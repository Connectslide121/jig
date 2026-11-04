import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { type AiFeatureId, aiChoice } from "../../shared/aiFeatures";
import type { ModelInfo } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { type AiProvider, CHATGPT_FALLBACK_MODELS, type ProviderStatus } from "../../shared/providers";
import type { RawCodexRateLimits } from "../../shared/usage";
import { resolveCommand } from "../addons/winCommand";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { handle } from "../ipc/router";
import { logger } from "../log";
import { execTool } from "../setup/checks";
import { jigHome } from "../state/paths";
import { makeWhich } from "../terminals/shell";
import {
  codexExecArgs,
  codexRateLimitRequests,
  codexSignInText,
  findCodex,
  parseCodexExec,
  parseCodexLoginStatus,
  parseCodexModels,
  parseCodexRateLimits,
} from "./codex";

/**
 * Providers for Jig's non-chat AI calls (D-294): one text in, one text out, no tools. `claude` goes
 * through Claude Code's `oneShot`; `chatgpt` through OpenAI's Codex CLI (`codex exec`) with the user's
 * ChatGPT sign-in. Chats pick their engine separately (D-309). Documented in docs/reference/engine.md.
 */

const log = logger("providers");

/** Same limit as Claude Code's one-shot. */
export const ONE_SHOT_TIMEOUT = 180_000;

/** The Codex CLI: the user's own (`engine.codexPath`), else the one on PATH, or undefined. */
export function codexBinary(): string | undefined {
  const own = getConfig().engine.codexPath.trim();
  if (own) return own;
  return findCodex({
    platform: process.platform,
    arch: process.arch,
    which: makeWhich(process.env),
    exists: existsSync,
  });
}

/**
 * Codex's environment: no OpenAI API key, so it always uses the ChatGPT sign-in it stored itself
 * (Jig never reads that), and nothing Electron set for its own child processes.
 */
export const CODEX_UNSET_ENV = ["OPENAI_API_KEY", "CODEX_API_KEY", "ELECTRON_RUN_AS_NODE"];

export function codexEnv(base: Record<string, string | undefined>): Record<string, string | undefined> {
  const env = { ...base };
  for (const name of CODEX_UNSET_ENV) delete env[name];
  return env;
}

export interface OneShotExtras {
  /** Working folder (default: Jig's home, no repository). */
  cwd?: string;
  /** Lines added to the instructions: Claude's `append`; for Codex, put before the prompt. */
  system?: string;
}

/** Runs `codex exec` once and returns its final answer; stops it after `timeoutMs`. */
function codexOneShot(binary: string, model: string, prompt: string, timeoutMs: number, cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const r = resolveCommand(binary, codexExecArgs(model, cwd), process.platform, process.env);
    const child = spawn(r.file, r.args, {
      cwd,
      env: codexEnv(process.env),
      windowsHide: true,
      windowsVerbatimArguments: r.verbatim,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    // Codex logs to stderr (skills it couldn't load…); keep the tail for an error message only.
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start Codex: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("Codex didn't answer in time"));
      try {
        resolve(parseCodexExec(stdout));
      } catch (error) {
        if (code) log.debug(`codex exec exited ${code}: ${stderr.trim().split(/\r?\n/).pop() ?? ""}`);
        reject(error);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

/**
 * One prompt, one answer, on the chosen provider. Same timeout and errors on both: a rejection with a
 * plain message ("… didn't answer in time"). The fake engine answers for both providers in tests.
 */
export async function oneShot(
  provider: AiProvider,
  model: string,
  prompt: string,
  timeoutMs = ONE_SHOT_TIMEOUT,
  extras: OneShotExtras = {},
): Promise<string> {
  const cwd = extras.cwd || jigHome();
  const engine = getEngine();
  if (provider === "claude" || engine.kind === "fake") {
    const config = getConfig().engine;
    return engine.oneShot(prompt, {
      cwd,
      model,
      appendSystemPrompt: extras.system ?? "",
      env: sessionEnv(process.env, config.allowApiKey),
      claudePath: config.claudePath,
      timeoutMs,
    });
  }
  const binary = codexBinary();
  if (!binary)
    throw new JigError("codex_missing", "The Codex CLI isn't installed. See Get started → ChatGPT (Codex).");
  try {
    return await codexOneShot(
      binary,
      model,
      extras.system ? `${extras.system}\n\n${prompt}` : prompt,
      timeoutMs,
      cwd,
    );
  } finally {
    // Every ChatGPT answer uses the plan: the footer's ChatGPT usage refreshes (D-298).
    for (const listener of chatGptCallListeners) listener();
  }
}

/** `codex debug models` (about 1 MB of JSON with every model's instructions), read once per run. */
let codexModels: Promise<ModelInfo[]> | undefined;

function readCodexModels(binary: string): Promise<ModelInfo[]> {
  return new Promise((resolve) => {
    const r = resolveCommand(binary, ["debug", "models"], process.platform, process.env);
    execFile(
      r.file,
      r.args,
      {
        timeout: 20_000,
        windowsHide: true,
        windowsVerbatimArguments: r.verbatim,
        maxBuffer: 32 * 1024 * 1024,
        env: codexEnv(process.env),
      },
      (_error, stdout) => resolve(parseCodexModels(String(stdout))),
    );
  });
}

/** The models a provider offers: Claude Code's own list, or the one Codex reports (else a short list). */
export async function providerModels(provider: AiProvider): Promise<ModelInfo[]> {
  const engine = getEngine();
  if (provider === "claude") {
    const config = getConfig().engine;
    return engine.models({ env: sessionEnv(process.env, config.allowApiKey), claudePath: config.claudePath });
  }
  const binary = engine.kind === "fake" ? undefined : codexBinary();
  if (!binary) return CHATGPT_FALLBACK_MODELS;
  codexModels ??= readCodexModels(binary);
  const models = await codexModels;
  if (!models.length) codexModels = undefined;
  return models.length ? models : CHATGPT_FALLBACK_MODELS;
}

/** Whether each provider can answer now: Claude always (Claude Code reports its own sign-in); ChatGPT
 * when the Codex CLI is installed and signed in (`codex login status`; only yes/no is kept). */
export async function providerStatus(): Promise<ProviderStatus[]> {
  const claude: ProviderStatus = { provider: "claude", ready: true, detail: "Claude Code" };
  if (getEngine().kind === "fake")
    return [claude, { provider: "chatgpt", ready: true, detail: "the fake engine" }];
  const binary = codexBinary();
  if (!binary)
    return [claude, { provider: "chatgpt", ready: false, detail: "The Codex CLI isn't installed." }];
  const r = await execTool(binary, ["login", "status"]);
  const signIn = parseCodexLoginStatus(`${r.stdout}
${r.stderr}`);
  return [
    claude,
    {
      provider: "chatgpt",
      ready: signIn?.loggedIn === true,
      detail: codexSignInText(signIn),
    },
  ];
}

/**
 * Runs one of Jig's AI features on the provider and model picked for it in Settings → AI features
 * (D-297). Returns the answer and who gave it, for messages about it.
 */
export async function featureOneShot(
  feature: AiFeatureId,
  prompt: string,
  extras: OneShotExtras & { timeoutMs?: number } = {},
): Promise<{ text: string; provider: AiProvider }> {
  const { provider, model } = aiChoice(getConfig(), feature);
  const text = await oneShot(provider, model, prompt, extras.timeoutMs, extras);
  return { text, provider };
}

export function registerProviderHandlers(): void {
  handle("ai.models", ({ provider }) => providerModels(provider));
  handle("ai.providers", () => providerStatus());
}

const chatGptCallListeners = new Set<() => void>();

/** Called after every ChatGPT call the provider layer makes (the usage meter refreshes, D-298). */
export function onChatGptCall(listener: () => void): () => void {
  chatGptCallListeners.add(listener);
  return () => chatGptCallListeners.delete(listener);
}

/**
 * The ChatGPT plan's rate limits, from `codex app-server` (`account/rateLimits/read`; D-298).
 * Undefined when Codex isn't installed or isn't signed in with ChatGPT. Codex reads its own login;
 * Jig keeps only the windows and the plan type. The fake engine answers from `JIG_FAKE_CHATGPT_USAGE`
 * (`signedout`, or a `RawCodexRateLimits` JSON) or with sample numbers.
 */
export async function readChatGptUsage(version = "0"): Promise<RawCodexRateLimits | undefined> {
  if (getEngine().kind === "fake") {
    const scripted = process.env.JIG_FAKE_CHATGPT_USAGE;
    if (scripted === "signedout") return undefined;
    if (scripted) return JSON.parse(scripted) as RawCodexRateLimits;
    const at = (ms: number) => Math.round((Date.now() + ms) / 1000);
    return {
      planType: "plus",
      primary: { usedPercent: 27, windowDurationMins: 300, resetsAt: at((3 * 60 + 5) * 60_000) },
      secondary: { usedPercent: 64, windowDurationMins: 10080, resetsAt: at(2 * 24 * 3_600_000) },
    };
  }
  const binary = codexBinary();
  if (!binary) return undefined;
  return new Promise((resolve, reject) => {
    const r = resolveCommand(binary, ["app-server"], process.platform, process.env);
    const child = spawn(r.file, r.args, {
      env: codexEnv(process.env),
      windowsHide: true,
      windowsVerbatimArguments: r.verbatim,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    let done = false;
    const finish = (error: Error | undefined, value?: RawCodexRateLimits) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Codex didn't answer in time")), 20_000);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
      try {
        const answer = parseCodexRateLimits(stdout);
        if (answer) finish(undefined, "limits" in answer ? answer.limits : undefined);
      } catch (error) {
        finish(error as Error);
      }
    });
    child.on("error", (error) => finish(new Error(`Couldn't start Codex: ${error.message}`)));
    child.on("close", () => finish(new Error("Codex closed before it answered")));
    child.stdin.on("error", () => {});
    child.stdin.write(codexRateLimitRequests(version));
  });
}
