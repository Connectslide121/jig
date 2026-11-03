import { dirname, join } from "node:path";
import type { ModelInfo } from "../../shared/engine";

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

/**
 * `codex exec` for one text answer: the prompt comes on stdin (`-`), JSON events on stdout, a
 * read-only sandbox with no approvals, the shell, plugins, apps, web search and sub-agents off, the
 * user's config and rules ignored and nothing saved. Codex still signs in with its own login.
 */
export function codexExecArgs(model: string, cwd: string): string[] {
  const off = [
    "shell_tool",
    "unified_exec",
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
    ...off.flatMap((f) => ["--disable", f]),
    ...(model ? ["--model", model] : []),
    "--cd",
    cwd,
    "-",
  ];
}

/**
 * The final answer from `codex exec --json` output (JSONL events): the last `agent_message`. A
 * `turn.failed` or top-level `error` event throws its message; `error` items are warnings and are
 * skipped. Lines that aren't JSON (stray log output) are ignored.
 */
export function parseCodexExec(stdout: string): string {
  let text: string | undefined;
  let failure: string | undefined;
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
    else if (event.type === "turn.failed")
      failure = String(event.error?.message ?? failure ?? "Codex couldn't answer");
    else if (event.type === "error" && !failure && typeof event.message === "string") failure = event.message;
  }
  if (failure) throw new Error(failure);
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
