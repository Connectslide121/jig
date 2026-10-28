import type { PermissionMode } from "../../../shared/engine";

/** What the word at the caret is asking for: a Claude Code command (`/…` at the start) or a file (`@…`). */
export interface ComposerToken {
  kind: "command" | "file";
  query: string;
  /** Where the token starts (its `/` or `@`) and ends, in the text. */
  start: number;
  end: number;
}

export function tokenAt(text: string, caret: number): ComposerToken | undefined {
  const before = text.slice(0, caret);
  const afterWord = /^\S*/.exec(text.slice(caret))![0].length;
  const command = /^\/(\S*)$/.exec(before);
  if (command) return { kind: "command", query: command[1]!, start: 0, end: caret + afterWord };
  const file = /(^|\s)@([^\s@]*)$/.exec(before);
  if (file) {
    const start = caret - file[2]!.length - 1;
    return { kind: "file", query: file[2]!, start, end: caret + afterWord };
  }
  return undefined;
}

/** Puts `value` in place of the token, followed by a space; returns the text and the new caret. */
export function replaceToken(
  text: string,
  token: ComposerToken,
  value: string,
): { text: string; caret: number } {
  const rest = text.slice(token.end).replace(/^ /, "");
  // A folder keeps the picker open (no space), so you can go on into it.
  const spacer = value.endsWith("/") ? "" : " ";
  const head = `${text.slice(0, token.start)}${value}${spacer}`;
  return { text: head + rest, caret: head.length };
}

/** What a message box starting with `!` or `#` does: run a shell command, or remember a line. */
export function inputMode(text: string): "shell" | "memory" | undefined {
  if (/^!\s*\S/.test(text)) return "shell";
  if (/^#\s*\S/.test(text)) return "memory";
  return undefined;
}

/** Shift+Tab goes through the modes like Claude Code does: ask → accept edits → plan → ask. */
export function nextPermissionMode(mode: PermissionMode): PermissionMode {
  if (mode === "default") return "acceptEdits";
  if (mode === "acceptEdits") return "plan";
  return "default";
}

/**
 * ↑/↓ through what you sent before (newest first). `index` -1 is the draft you were typing.
 * Returns the next index and the text to show, or undefined at either end.
 */
export function historyStep(
  history: string[],
  index: number,
  direction: "up" | "down",
  draft: string,
): { index: number; text: string } | undefined {
  const next = direction === "up" ? index + 1 : index - 1;
  if (next < -1 || next >= history.length) return undefined;
  return { index: next, text: next === -1 ? draft : history[history.length - 1 - next]! };
}
