import type { ChatItem } from "../../../shared/engine";
import { diffCounts, toolLabel } from "./ToolCard";

/**
 * The compact chat view (D-159): what you and Claude say stays, and each run of steps between
 * (tool calls, thinking) folds into one line that says what they did. Pure.
 */
export type Entry = { item: ChatItem; children: ChatItem[] };
export type Row = { kind: "item"; entry: Entry } | { kind: "steps"; id: string; entries: Entry[] };

/**
 * A step folds into its line; a tool call waiting for your permission stays in view, and so does one
 * whose add-on promotes its card (a page the user came for, D-405).
 */
const isStep = (item: ChatItem, pending: Set<string>, promoted: (item: ChatItem) => boolean) =>
  item.kind === "thinking" || (item.kind === "tool" && !pending.has(item.id) && !promoted(item));

export function compactRows(
  entries: Entry[],
  pending: Set<string>,
  promoted: (item: ChatItem) => boolean = () => false,
): Row[] {
  const rows: Row[] = [];
  for (const entry of entries) {
    const last = rows.at(-1);
    if (!isStep(entry.item, pending, promoted)) rows.push({ kind: "item", entry });
    else if (last?.kind === "steps") last.entries.push(entry);
    else rows.push({ kind: "steps", id: `steps-${entry.item.id}`, entries: [entry] });
  }
  return rows;
}

/**
 * The images a run of steps produced (screenshots, images Claude looked at), its subagents' included,
 * in order: shown as previews under the folded line so they're never hidden in it. Uses the copies
 * saved with the chat, so they stay after the files are deleted.
 */
export function stepImages(entries: Entry[]): string[] {
  const paths = entries
    .flatMap((e) => [e.item, ...e.children])
    .flatMap((item) => (item.kind === "tool" ? (item.images ?? []).map((image) => image.path) : []));
  return [...new Set(paths)];
}

/** "a command", "3 commands". */
const some = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${n} ${many}`);
const base = (path: string) => path.split(/[\\/]/).pop() ?? path;
const EDITS = new Set(["Edit", "MultiEdit", "NotebookEdit"]);
const SEARCHES = new Set(["Grep", "Glob", "LS"]);
const WEB = new Set(["WebFetch", "WebSearch"]);
const AGENTS = new Set(["Task", "Agent"]);
const KNOWN = new Set([
  "Bash",
  "PowerShell",
  "Read",
  "Write",
  "TodoWrite",
  "SubagentMessage",
  ...EDITS,
  ...SEARCHES,
  ...WEB,
  ...AGENTS,
]);

export interface StepsSummary {
  /** "Ran 3 commands, read 2 files, edited cart.ts". */
  text: string;
  /** For a single command: what it does ("List repos and top-level contents"). */
  detail?: string;
  /** Lines the edits added and removed. */
  added: number;
  removed: number;
  failed: number;
  /** The tool running now ("Bash", "Read"), if one is: the tool, not its command. */
  running?: string;
}

/** What a run of steps did, in one line, like Claude Code's. */
export function stepsSummary(entries: Entry[]): StepsSummary {
  const tools = entries.flatMap((e) => (e.item.kind === "tool" ? [e.item] : []));
  const thought = entries.some((e) => e.item.kind === "thinking");
  const of = (test: (name: string) => boolean) => tools.filter((t) => test(t.name));
  const fileOf = (t: (typeof tools)[number]) => String(t.input.file_path ?? t.input.notebook_path ?? t.id);
  const unique = (list: typeof tools) => [...new Set(list.map(fileOf))];
  const files = (list: typeof tools, verb: string) => {
    const names = unique(list);
    if (!names.length) return "";
    return names.length <= 2 ? `${verb} ${names.map(base).join(" and ")}` : `${verb} ${names.length} files`;
  };
  const commands = of((n) => n === "Bash" || n === "PowerShell");
  const reads = unique(of((n) => n === "Read")).length;
  const searches = of((n) => SEARCHES.has(n)).length;
  const web = of((n) => WEB.has(n)).length;
  const agents = of((n) => AGENTS.has(n)).length;
  const messages = of((n) => n === "SubagentMessage").length;
  const todos = of((n) => n === "TodoWrite").length;
  const other = of((n) => !KNOWN.has(n)).length;
  const parts = [
    messages && `received ${some(messages, "message", "messages")}`,
    commands.length && `ran ${some(commands.length, "command", "commands")}`,
    reads && `read ${some(reads, "file", "files")}`,
    files(
      of((n) => n === "Write"),
      "created",
    ),
    files(
      of((n) => EDITS.has(n)),
      "edited",
    ),
    searches && (searches === 1 ? "searched the code" : `searched ${searches} times`),
    web && `looked up ${some(web, "page", "pages")}`,
    agents && `ran ${some(agents, "agent", "agents")}`,
    todos && "updated the to-do list",
    other && `used ${some(other, "tool", "tools")}`,
    thought && !tools.length && "thought",
  ].filter((p): p is string => Boolean(p));
  const text = parts.join(", ");
  // Lines added and removed: an edit's diff, or a new file's lines.
  let added = 0;
  let removed = 0;
  for (const t of of((n) => EDITS.has(n) || n === "Write")) {
    if (t.diff) {
      const counts = diffCounts(t.diff);
      added += counts.added;
      removed += counts.removed;
    } else if (t.name === "Write" && typeof t.input.content === "string")
      added += t.input.content.split("\n").length;
  }
  const only = tools.length === 1 ? tools[0] : undefined;
  const detail =
    only && commands.length === 1 && typeof only.input.description === "string"
      ? only.input.description
      : undefined;
  const current = [...tools].reverse().find((t) => t.status === "running");
  return {
    text: text ? text.charAt(0).toUpperCase() + text.slice(1) : "Worked",
    ...(detail ? { detail } : {}),
    added,
    removed,
    failed: tools.filter((t) => t.status === "error").length,
    ...(current ? { running: toolLabel(current.name) } : {}),
  };
}

/**
 * A long chat renders only its latest rows (D-366): `WINDOW` of them, and `BATCH` more each time you
 * scroll within a screen of the top. Back at the bottom it shrinks to the latest again.
 */
export const WINDOW = 60;
export const BATCH = 40;

/** The first row to render: at least `WINDOW` rows (or all), never past the asked start. */
export function windowStart(rows: number, start: number): number {
  return Math.max(0, Math.min(start, rows - WINDOW));
}

/** The index of the row that shows an item (a top-level one or a step in a folded run), or -1. */
export function rowIndexOf(rows: Row[], id: string): number {
  return rows.findIndex((row) =>
    row.kind === "steps" ? row.entries.some((e) => e.item.id === id) : row.entry.item.id === id,
  );
}
