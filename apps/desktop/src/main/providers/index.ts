import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { ModelInfo } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { type AiProvider, CHATGPT_FALLBACK_MODELS } from "../../shared/providers";
import { resolveCommand } from "../addons/winCommand";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { handle } from "../ipc/router";
import { logger } from "../log";
import { jigHome } from "../state/paths";
import { makeWhich } from "../terminals/shell";
import { codexExecArgs, findCodex, parseCodexExec, parseCodexModels } from "./codex";

/**
 * Providers for Jig's non-chat AI calls (D-294): one text in, one text out, no tools. `claude` goes
 * through Claude Code's `oneShot`; `chatgpt` through OpenAI's Codex CLI (`codex exec`) with the user's
 * ChatGPT sign-in. Chats always run on Claude Code. Documented in docs/reference/engine.md.
 */

const log = logger("providers");

/** Same limit as Claude Code's one-shot. */
export const ONE_SHOT_TIMEOUT = 180_000;

/** The Codex CLI the user installed (PATH), or undefined. */
export function codexBinary(): string | undefined {
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
  return codexOneShot(
    binary,
    model,
    extras.system ? `${extras.system}\n\n${prompt}` : prompt,
    timeoutMs,
    cwd,
  );
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

export function registerProviderHandlers(): void {
  handle("ai.models", ({ provider }) => providerModels(provider));
}
