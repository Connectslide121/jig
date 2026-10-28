import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Which shell to start and how to make it run one command. Pure (with an injectable `which`), so it
 * is unit-tested for every OS. Idea from ThinkRail's `shellArgs.ts`.
 */
export type Which = (bin: string) => string | undefined;

export function makeWhich(env: Record<string, string | undefined>, platform = process.platform): Which {
  const dirs = (env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : delimiter).filter(Boolean);
  const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  return (bin) => {
    for (const dir of dirs) {
      for (const ext of bin.includes(".") ? [""] : exts) {
        const candidate = join(dir, bin + ext.toLowerCase());
        if (existsSync(candidate)) return candidate;
        const upper = join(dir, bin + ext);
        if (ext && existsSync(upper)) return upper;
      }
    }
    return undefined;
  };
}

/** The configured shell, else PowerShell 7 / Windows PowerShell on Windows, `$SHELL` elsewhere. */
export function defaultShell(
  configured: string,
  platform: string,
  env: Record<string, string | undefined>,
  which: Which,
): string {
  if (configured.trim()) return configured.trim();
  if (platform === "win32") return which("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
  return env.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/bash");
}

type ShellFamily = "powershell" | "cmd" | "posix";

export function shellFamily(shell: string): ShellFamily {
  const name = shell.replaceAll("\\", "/").split("/").pop()!.toLowerCase();
  if (name.startsWith("pwsh") || name.startsWith("powershell")) return "powershell";
  if (name === "cmd" || name === "cmd.exe") return "cmd";
  return "posix";
}

/** Arguments for an interactive shell. */
export function interactiveArgs(shell: string, platform: string): string[] {
  const family = shellFamily(shell);
  if (family === "powershell") return ["-NoLogo"];
  if (family === "cmd") return [];
  return platform === "darwin" ? ["-l"] : [];
}

/** Arguments that make `shell` run `command` and exit with its status. */
export function commandArgs(shell: string, command: string, platform: string): string[] {
  const family = shellFamily(shell);
  if (family === "powershell") return ["-NoLogo", "-NoProfile", "-Command", command];
  if (family === "cmd") return ["/d", "/s", "/c", command];
  return platform === "darwin" ? ["-l", "-c", command] : ["-c", command];
}

/**
 * Extracts the commands typed into an interactive terminal from the raw input stream (for the
 * activity log). Handles backspace and ignores escape sequences (arrow keys, etc.).
 */
export class LineTracker {
  private line = "";
  constructor(private readonly onLine: (line: string) => void) {}

  feed(data: string): void {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]!;
      if (ch === "\x1b") {
        // Skip a CSI/SS3 sequence: ESC [ ... final byte, or ESC O x.
        if (data[i + 1] === "[" || data[i + 1] === "O") {
          i += 2;
          while (i < data.length && !/[@-~]/.test(data[i]!)) i++;
        } else i++;
        // History navigation makes the visible line unknown; drop what we have.
        this.line = "";
      } else if (ch === "\r" || ch === "\n") {
        const line = this.line.trim();
        this.line = "";
        if (line) this.onLine(line);
      } else if (ch === "\x7f" || ch === "\b") {
        this.line = this.line.slice(0, -1);
      } else if (ch === "\x03" || ch === "\x15") {
        this.line = "";
      } else if (ch >= " ") {
        this.line += ch;
      }
    }
  }
}

/** Words that look like credentials: keys, tokens, long random strings. */
const SECRET =
  /(sk-ant-|sk-[a-z0-9]{8}|ghp_|gho_|github_pat_|xox[bp]-|AKIA[0-9A-Z]{12}|eyJ[\w-]{10,}\.|(pass(word)?|pwd|secret|token|api[_-]?key)\s*[=:])|\b[A-Za-z0-9+/_#-]{32,}={0,2}(\s|$)/i;

export function looksSecret(line: string): boolean {
  return SECRET.test(line);
}

/** Tracks whether a full-screen program (the alternate screen: claude, vim, less, …) is showing. */
export function altScreenAfter(current: boolean, output: string): boolean {
  let state = current;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
  for (const m of output.matchAll(/\x1b\[\?(1049|1047|47)([hl])/g)) state = m[2] === "h";
  return state;
}

/**
 * Whether a line typed into a terminal may go to the activity log: the shell echoed it (password
 * prompts don't echo), no full-screen program was showing, and it doesn't look like a secret.
 */
export function isRecordable(line: string, recentOutput: string, altScreen: boolean): boolean {
  if (altScreen || looksSecret(line)) return false;
  const shown = recentOutput
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
    .replace(/[\x00-\x08\x0b-\x1f]/g, "");
  return shown.includes(line);
}
