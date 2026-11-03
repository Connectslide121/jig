/** Inline code completion in the editor (D-255): GitHub Copilot's language server, or Claude Code. */

export type CompletionProvider = "copilot" | "claude" | "off";

export interface CopilotState {
  /** The language server is downloaded (Jig fetches it the first time you set Copilot up). */
  installed: boolean;
  /** Where setting it up is: downloading, starting, waiting for the GitHub sign-in. */
  phase: "idle" | "downloading" | "starting" | "signing-in" | "ready" | "error";
  signedIn: boolean;
  /** The GitHub account, as the server reports it. */
  user?: string;
  /** What the server last said (quota, an error, a file it ignores). */
  message?: string;
  version?: string;
}

export interface CompletionState {
  /** Who completes now: Claude when its setting is on, else Copilot when signed in, else nobody. */
  provider: CompletionProvider;
  copilot: CopilotState;
  /** The Claude model completions use (Settings → Editor). */
  claudeModel: string;
}

export interface CompletionRequest {
  path: string;
  text: string;
  /** The caret, as an offset into `text`. */
  offset: number;
  tabSize: number;
  insertSpaces: boolean;
}

export interface CompletionSuggestion {
  /** Replaces `text.slice(from, to)`; usually `from === to === offset`. */
  text: string;
  from: number;
  to: number;
  /** Copilot's acceptance id (its telemetry command runs when you press Tab). */
  id?: string;
  provider: Exclude<CompletionProvider, "off">;
}

/** LSP positions (UTF-16 code units, as JS strings) to and from offsets. */
export function positionAt(text: string, offset: number): { line: number; character: number } {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const line = before.split("\n").length - 1;
  return { line, character: before.length - (before.lastIndexOf("\n") + 1) };
}

export function offsetAt(text: string, position: { line: number; character: number }): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  const end = text.indexOf("\n", offset);
  return Math.min(offset + position.character, end < 0 ? text.length : end);
}

const PREFIX_CHARS = 6000;
const SUFFIX_CHARS = 2000;

/** What Claude is asked for one completion: the code around the caret, marked. */
export function claudePrompt(request: Pick<CompletionRequest, "path" | "text" | "offset">): string {
  const prefix = request.text.slice(Math.max(0, request.offset - PREFIX_CHARS), request.offset);
  const suffix = request.text.slice(request.offset, request.offset + SUFFIX_CHARS);
  const name = request.path.split(/[\\/]/).pop() ?? request.path;
  return [
    `Complete the code at <CURSOR> in ${name}.`,
    "Answer with only the text to insert at <CURSOR>: no explanation, no Markdown fences, nothing that is already before or after it. Prefer finishing the current line or statement; at most a few lines. If nothing fits, answer with nothing.",
    "",
    `${prefix}<CURSOR>${suffix}`,
  ].join("\n");
}

/** Claude's answer as text to insert: fences and an echoed line start removed, the rest kept. */
export function cleanClaudeCompletion(answer: string, text: string, offset: number): string {
  let out = answer.replace(/\r\n/g, "\n");
  const fenced = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(out);
  if (fenced) out = fenced[1]!;
  out = out.replace(/<CURSOR>/g, "");
  if (!out.trim()) return "";
  // Claude sometimes repeats the start of the line: keep only what comes after it.
  const lineStart = text.slice(text.lastIndexOf("\n", offset - 1) + 1, offset);
  if (lineStart.trim() && out.startsWith(lineStart)) out = out.slice(lineStart.length);
  // Nor what already follows the caret on its line.
  const rest = text.slice(offset, text.indexOf("\n", offset) < 0 ? text.length : text.indexOf("\n", offset));
  if (rest.trim() && out.endsWith(rest)) out = out.slice(0, out.length - rest.length);
  return out.replace(/\s+$/, (tail) => (tail.includes("\n") ? "" : tail));
}
