import type { ChatItem } from "../../../shared/engine";
import { toolLabel, toolSummary } from "./ToolCard";

/**
 * The compact chat view (D-159): what you and Claude say stays, and each run of steps between
 * (tool calls, thinking) folds into one line that says what they did. Pure.
 */
export type Entry = { item: ChatItem; children: ChatItem[] };
export type Row = { kind: "item"; entry: Entry } | { kind: "steps"; id: string; entries: Entry[] };

/** A step folds into its line; a tool call waiting for your permission stays in view. */
const isStep = (item: ChatItem, pending: Set<string>) =>
  item.kind === "thinking" || (item.kind === "tool" && !pending.has(item.id));

export function compactRows(entries: Entry[], pending: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const entry of entries) {
    const last = rows.at(-1);
    if (!isStep(entry.item, pending)) rows.push({ kind: "item", entry });
    else if (last?.kind === "steps") last.entries.push(entry);
    else rows.push({ kind: "steps", id: `steps-${entry.item.id}`, entries: [entry] });
  }
  return rows;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const EDITS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const SEARCHES = new Set(["Grep", "Glob", "LS"]);
const WEB = new Set(["WebFetch", "WebSearch"]);
const AGENTS = new Set(["Task", "Agent"]);

export interface StepsSummary {
  /** "Ran 3 commands, read 2 files, edited 1 file". */
  text: string;
  failed: number;
  /** The step running now ("npm test"), if one is. */
  running?: string;
}

/** What a run of steps did, in one line. */
export function stepsSummary(entries: Entry[]): StepsSummary {
  const tools = entries.flatMap((e) => (e.item.kind === "tool" ? [e.item] : []));
  const thought = entries.some((e) => e.item.kind === "thinking");
  const files = (names: Set<string>) =>
    new Set(
      tools
        .filter((t) => names.has(t.name))
        .map((t) => String(t.input.file_path ?? t.input.notebook_path ?? t.id)),
    ).size;
  const count = (test: (name: string) => boolean) => tools.filter((t) => test(t.name)).length;
  const commands = count((n) => n === "Bash" || n === "PowerShell");
  const reads = files(new Set(["Read"]));
  const edits = files(EDITS);
  const searches = count((n) => SEARCHES.has(n));
  const web = count((n) => WEB.has(n));
  const agents = count((n) => AGENTS.has(n));
  const todos = count((n) => n === "TodoWrite");
  const known = new Set([
    "Bash",
    "PowerShell",
    "Read",
    "TodoWrite",
    ...EDITS,
    ...SEARCHES,
    ...WEB,
    ...AGENTS,
  ]);
  const other = count((n) => !known.has(n));
  const parts = [
    commands && `ran ${plural(commands, "command", "commands")}`,
    reads && `read ${plural(reads, "file", "files")}`,
    edits && `edited ${plural(edits, "file", "files")}`,
    searches && `searched ${plural(searches, "time", "times")}`,
    web && `looked up ${plural(web, "page", "pages")}`,
    agents && `ran ${plural(agents, "agent", "agents")}`,
    todos && "updated the to-do list",
    other && `used ${plural(other, "tool", "tools")}`,
    thought && !tools.length && "thought",
  ].filter((p): p is string => Boolean(p));
  const text = parts.join(", ");
  const current = [...tools].reverse().find((t) => t.status === "running");
  return {
    text: text ? text.charAt(0).toUpperCase() + text.slice(1) : "Worked",
    failed: tools.filter((t) => t.status === "error").length,
    ...(current
      ? { running: toolSummary(current.name, current.input).split("\n")[0] || toolLabel(current.name) }
      : {}),
  };
}
