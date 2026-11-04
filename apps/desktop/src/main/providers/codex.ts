import { dirname, join } from "node:path";
import type { ModelInfo } from "../../shared/engine";
import type { RawCodexRateLimits, RawCodexWindow } from "../../shared/usage";

/**
 * OpenAI's Codex CLI, signed in with the user's ChatGPT account (D-294). Pure helpers, unit-tested:
 * finding the binary, the `codex exec` arguments, and reading what Codex prints. Jig only starts the
 * official CLI; it never reads, stores, logs or forwards Codex's login (`~/.codex/auth.json`).
 */

/** Codex's Rust target triples per Node platform/arch (the npm package's `vendor/<triple>` folders). */
const TRIPLES: Record<string, string> = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
};

/**
 * The Codex CLI on PATH (the user's own install: `npm i -g @openai/codex`, Homebrew or winget). Jig
 * doesn't ship it: the npm package is ~480 MB per platform. On Windows an npm install puts a
 * `codex.cmd` shim on PATH; Jig runs the native `codex.exe` behind it instead, so no cmd.exe sits
 * between Jig and Codex (prompts go in on stdin, and a timeout stops the real process).
 */
export function findCodex(options: {
  platform: string;
  arch: string;
  which: (bin: string) => string | undefined;
  exists: (path: string) => boolean;
}): string | undefined {
  const found = options.which("codex");
  if (!found || options.platform !== "win32" || /\.exe$/i.test(found)) return found;
  const triple = TRIPLES[`${options.platform}-${options.arch}`];
  if (!triple) return found;
  const exe = join("vendor", triple, "bin", "codex.exe");
  const pkg = join(dirname(found), "node_modules", "@openai");
  const platformPkg = `codex-${options.platform}-${options.arch}`;
  for (const candidate of [
    join(pkg, "codex", "node_modules", "@openai", platformPkg, exe),
    join(pkg, platformPkg, exe),
    join(pkg, "codex", exe),
  ])
    if (options.exists(candidate)) return candidate;
  return found;
}

export interface CodexSignIn {
  loggedIn: boolean;
  /** In words: "your ChatGPT account", "an OpenAI API key". Never the key or the account. */
  method?: string;
}

/**
 * Reads `codex login status` ("Logged in using ChatGPT", "Logged in using an API key - sk-…",
 * "Not logged in"). Only yes/no and the method are kept; anything after the method (a masked key)
 * is dropped. Undefined when the output isn't recognised.
 */
export function parseCodexLoginStatus(output: string): CodexSignIn | undefined {
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^(not )?logged in/i.test(l));
  if (!line) return undefined;
  if (/^not logged in/i.test(line)) return { loggedIn: false };
  if (/chatgpt/i.test(line)) return { loggedIn: true, method: "your ChatGPT account" };
  if (/api key/i.test(line)) return { loggedIn: true, method: "an OpenAI API key" };
  if (/access token/i.test(line)) return { loggedIn: true, method: "an access token" };
  return { loggedIn: true };
}

/** The sentence for Get started and the sign-in toast. */
export function codexSignInText(signIn: CodexSignIn | undefined): string {
  if (!signIn) return "Couldn't ask Codex whether it's signed in.";
  return signIn.loggedIn ? `Signed in${signIn.method ? ` with ${signIn.method}` : ""}.` : "Not signed in.";
}

/** Codex features a one-shot never needs: plugins, apps, sub-agents, images, the browser, hooks… */
const OFF_FEATURES = [
  "apps",
  "plugins",
  "multi_agent",
  "image_generation",
  "view_image",
  "browser_use",
  "computer_use",
  "hooks",
  "memories",
];
/** Codex's shell: how it runs commands (and, without a read tool of its own, how it reads files). */
const SHELL_FEATURES = ["shell_tool", "unified_exec"];

/**
 * A scoped `codex exec`: the prompt on stdin (`-`), JSON events on stdout, a read-only sandbox (no
 * writes, no network) with no approvals, web search and the features above off, the user's config
 * (so their MCP servers) and rules ignored and nothing saved. `shell` keeps Codex's shell, `config`
 * adds `-c` overrides. Codex still signs in with its own login.
 */
function scopedExecArgs(
  model: string,
  cwd: string,
  options: { shell?: boolean; config?: string[] } = {},
): string[] {
  const off = [...(options.shell ? [] : SHELL_FEATURES), ...OFF_FEATURES];
  return [
    "exec",
    "--json",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--color",
    "never",
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    ...(options.config ?? []).flatMap((c) => ["-c", c]),
    ...off.flatMap((f) => ["--disable", f]),
    ...(model ? ["--model", model] : []),
    "--cd",
    cwd,
    "-",
  ];
}

/** `codex exec` for one text answer: no shell and no tools at all. */
export function codexExecArgs(model: string, cwd: string): string[] {
  return scopedExecArgs(model, cwd);
}

/**
 * The search helper of Codex chats (D-337): Codex's shell in a read-only sandbox without network, so
 * it can grep and read the chat's folder but change nothing; no MCP servers (no Jig tools), and no
 * AGENTS.md (everything it needs is in the question, like jig-search's `omitClaudeMd`). On Windows
 * the sandbox needs a mode, which usually comes from the user's config (ignored here): without one
 * Codex refuses every command. `unelevated` needs no administrator setup (checked with 0.166.0).
 */
export function codexSearchArgs(model: string, cwd: string, platform: string = process.platform): string[] {
  return scopedExecArgs(model, cwd, {
    shell: true,
    config: ["project_doc_max_bytes=0", ...(platform === "win32" ? ['windows.sandbox="unelevated"'] : [])],
  });
}

/** The environment variable that hands the tester its MCP server's token (never a command line). */
export const HELPER_TOKEN_ENV = "JIG_HELPER_MCP_TOKEN";

/**
 * The tester helper of Codex chats (D-337): no shell (nothing it runs could read the token from its
 * environment) and one MCP server, `jig`, that serves only Claude's browser tools, each pre-approved
 * since nobody is there to answer a prompt. The token comes from `HELPER_TOKEN_ENV`. (Codex's
 * `enabled_tools` isn't used: with it set from the command line Codex offered the model no tools at
 * all, checked with 0.166.0.)
 */
export function codexTesterArgs(
  model: string,
  cwd: string,
  mcpUrl: string,
  tools: readonly string[],
): string[] {
  return scopedExecArgs(model, cwd, {
    config: [
      "project_doc_max_bytes=0",
      `mcp_servers.jig.url=${JSON.stringify(mcpUrl)}`,
      `mcp_servers.jig.bearer_token_env_var=${JSON.stringify(HELPER_TOKEN_ENV)}`,
      "mcp_servers.jig.startup_timeout_sec=20",
      "mcp_servers.jig.tool_timeout_sec=120",
      ...tools.map((t) => `mcp_servers.jig.tools.${t}.approval_mode="approve"`),
    ],
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

/**
 * The final answer from `codex exec --json` output (JSONL events): the last `agent_message`. A
 * `turn.failed` or top-level `error` event throws its message, unless the turn completed with an
 * answer after it (a top-level `error` can be a passing "Reconnecting… 2/5"). `error` items are
 * warnings and are skipped. Lines that aren't JSON (stray log output) are ignored. With `exitCode`
 * (null: killed), a run that ended badly without `turn.completed` throws, even after a message (it
 * may be only a preamble).
 */
export function parseCodexExec(stdout: string, exitCode?: number | null): string {
  let text: string | undefined;
  let failure: string | undefined;
  let completed = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    let event: {
      type?: string;
      message?: unknown;
      error?: { message?: unknown };
      item?: { type?: string; text?: unknown };
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message")
      text = typeof event.item.text === "string" ? event.item.text : text;
    else if (event.type === "turn.completed") completed = true;
    else if (event.type === "turn.failed") {
      completed = false;
      failure = String(event.error?.message ?? failure ?? "Codex couldn't answer");
    } else if (event.type === "error" && !failure && typeof event.message === "string")
      failure = event.message;
  }
  if (completed && text !== undefined) return text;
  if (failure) throw new Error(failure);
  if (exitCode !== undefined && exitCode !== 0 && !completed)
    throw new Error(
      exitCode === null ? "Codex was stopped before it answered" : `Codex stopped (exit code ${exitCode})`,
    );
  if (text === undefined) throw new Error("Codex finished without an answer");
  return text;
}

/** Models from `codex debug models` (JSON): the listed ones, in Codex's order. */
export function parseCodexModels(stdout: string): ModelInfo[] {
  let json: { models?: unknown };
  try {
    json = JSON.parse(stdout.trim());
  } catch {
    return [];
  }
  if (!Array.isArray(json.models)) return [];
  return (
    json.models as {
      slug?: unknown;
      display_name?: unknown;
      description?: unknown;
      visibility?: unknown;
      priority?: unknown;
    }[]
  )
    .filter((m) => typeof m.slug === "string" && m.slug && m.visibility !== "hide")
    .map((m, i) => ({
      m,
      i,
      priority: typeof m.priority === "number" ? m.priority : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.priority - b.priority || a.i - b.i)
    .map(({ m }) => ({
      value: m.slug as string,
      displayName: typeof m.display_name === "string" && m.display_name ? m.display_name : (m.slug as string),
      description: typeof m.description === "string" ? m.description : "",
    }));
}

/** The JSON-RPC id of the rate-limit read in `codexRateLimitRequests`. */
export const RATE_LIMITS_REQUEST_ID = 2;

/**
 * What Jig writes to `codex app-server` (stdio JSON-RPC, one message per line) to read the ChatGPT
 * plan's rate limits: initialize, then `account/rateLimits/read` without the reset-credit details.
 */
export function codexRateLimitRequests(version: string): string {
  return [
    {
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "jig", title: "Jig", version }, capabilities: null },
    },
    { method: "initialized" },
    {
      id: RATE_LIMITS_REQUEST_ID,
      method: "account/rateLimits/read",
      params: { excludeResetCreditDetails: true },
    },
  ]
    .map((m) => JSON.stringify(m))
    .join("\n")
    .concat("\n");
}

/**
 * The answer to the rate-limit read in app-server output: `{ limits }` (only the windows and the plan
 * type; the account id and everything else is dropped), `{ signedOut: true }` when Codex has no
 * ChatGPT sign-in, or undefined while the answer hasn't arrived. Other errors throw their message.
 */
export function parseCodexRateLimits(
  stdout: string,
): { limits: RawCodexRateLimits } | { signedOut: true } | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    let message: { id?: unknown; result?: { rateLimits?: unknown }; error?: { message?: unknown } };
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id !== RATE_LIMITS_REQUEST_ID) continue;
    if (message.error) {
      const text = String(message.error.message ?? "Codex couldn't read the rate limits");
      if (/auth|log ?in|sign ?in/i.test(text)) return { signedOut: true };
      throw new Error(text);
    }
    const snapshot = (message.result?.rateLimits ?? {}) as Record<string, unknown>;
    const window = (w: unknown): RawCodexWindow | null => {
      if (!w || typeof w !== "object") return null;
      const x = w as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      return {
        usedPercent: num(x.usedPercent),
        windowDurationMins: num(x.windowDurationMins),
        resetsAt: num(x.resetsAt),
      };
    };
    return {
      limits: {
        primary: window(snapshot.primary),
        secondary: window(snapshot.secondary),
        planType: typeof snapshot.planType === "string" ? snapshot.planType : null,
        rateLimitReachedType:
          typeof snapshot.rateLimitReachedType === "string" ? snapshot.rateLimitReachedType : null,
      },
    };
  }
  return undefined;
}
