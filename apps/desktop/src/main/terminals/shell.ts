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
