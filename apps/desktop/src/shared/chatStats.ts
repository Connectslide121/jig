import type { ChatItem, SessionMeta } from "./engine";

/** Tools that change a file, and the input field naming it. */
const EDIT_TOOLS: Record<string, string> = {
  Edit: "file_path",
  MultiEdit: "file_path",
  Write: "file_path",
  NotebookEdit: "notebook_path",
};
const WEB_TOOLS = new Set(["WebFetch", "WebSearch"]);
const AGENT_TOOLS = new Set(["Task", "Agent"]);

export interface Counted {
  name: string;
  count: number;
}

export interface ToolStat {
  name: string;
  calls: number;
  errors: number;
}

export interface FileStat {
  path: string;
  edits: number;
  added: number;
  removed: number;
}

export interface SubagentStat {
  id: string;
  type: string;
  description: string;
  status: "running" | "completed" | "failed" | "stopped";
  toolUses: number;
  tokens?: number;
  durationMs?: number;
}

export interface McpStat {
  server: string;
  calls: number;
  tools: number;
}

/** What happened in a chat, counted from its transcript (the chat overview, D-184). */
export interface ChatStats {
  /** Your messages, and Claude's answers (top level, not subagents'). */
  messages: number;
  replies: number;
  turns: number;
  failedTurns: number;
  /** Time Claude worked, summed over the turns. */
  workingMs: number;
  thinking: number;
  /** Every tool call, subagents' included. */
  toolCalls: number;
  toolErrors: number;
  /** Calls made by subagents (part of `toolCalls`). */
  subagentToolCalls: number;
  tools: ToolStat[];
  /** Skills Claude used (the Skill tool). */
  skills: Counted[];
  /** Commands and skills you ran with `/`. */
  commands: Counted[];
  subagents: SubagentStat[];
  mcp: McpStat[];
  files: FileStat[];
  linesAdded: number;
  linesRemoved: number;
  filesRead: number;
  /** Shell commands Claude ran (Bash) and ones you ran with `!`. */
  bash: number;
  shell: number;
  web: number;
  permissions: { asked: number; allowed: number; denied: number };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

const byCount = (map: Map<string, number>): Counted[] =>
  [...map]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/** Lines added and removed in a unified diff. */
export function diffLines(diff: string | undefined): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of (diff ?? "").split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/** A tool's name for people: `server · tool` for MCP tools. */
export function toolLabel(name: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]} · ${mcp[2]}` : name;
}

/** Counts what happened in a chat: tools, skills, subagents, MCP, files, turns, permissions. */
export function chatStats(items: ChatItem[]): ChatStats {
  const stats: ChatStats = {
    messages: 0,
    replies: 0,
    turns: 0,
    failedTurns: 0,
    workingMs: 0,
    thinking: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagentToolCalls: 0,
    tools: [],
    skills: [],
    commands: [],
    subagents: [],
    mcp: [],
    files: [],
    linesAdded: 0,
    linesRemoved: 0,
    filesRead: 0,
    bash: 0,
    shell: 0,
    web: 0,
    permissions: { asked: 0, allowed: 0, denied: 0 },
  };
  const tools = new Map<string, ToolStat>();
  const skills = new Map<string, number>();
  const commands = new Map<string, number>();
  const mcp = new Map<string, { calls: number; tools: Set<string> }>();
  const files = new Map<string, FileStat>();
  const read = new Set<string>();
  const children = new Map<string, number>();
  for (const item of items) if (item.kind === "tool" && item.parentId) bump(children, item.parentId);
  for (const item of items) {
    switch (item.kind) {
      case "user": {
        stats.messages++;
        const command = /^\/([\w:.-]+)/.exec(item.text.trim());
        if (command) bump(commands, command[1]!);
        break;
      }
      case "assistant":
        if (!item.parentId) stats.replies++;
        break;
      case "thinking":
        stats.thinking++;
        break;
      case "result":
        stats.turns++;
        if (!item.ok) stats.failedTurns++;
        stats.workingMs += item.durationMs || 0;
        break;
      case "shell":
        stats.shell++;
        break;
      case "permission":
        stats.permissions.asked++;
        if (item.status === "allowed" || item.status === "always") stats.permissions.allowed++;
        else if (item.status === "denied") stats.permissions.denied++;
        break;
      case "tool": {
        stats.toolCalls++;
        if (item.parentId) stats.subagentToolCalls++;
        const failed = item.status === "error";
        if (failed) stats.toolErrors++;
        const tool = tools.get(item.name) ?? { name: item.name, calls: 0, errors: 0 };
        tool.calls++;
        if (failed) tool.errors++;
        tools.set(item.name, tool);
        const input = item.input ?? {};
        const server = /^mcp__(.+?)__(.+)$/.exec(item.name);
        if (server) {
          const s = mcp.get(server[1]!) ?? { calls: 0, tools: new Set<string>() };
          s.calls++;
          s.tools.add(server[2]!);
          mcp.set(server[1]!, s);
        } else if (item.name === "Skill") {
          const name = str(input.skill) || str(input.command) || str(input.name);
          if (name) bump(skills, name.replace(/^\//, ""));
        } else if (AGENT_TOOLS.has(item.name)) {
          stats.subagents.push({
            id: item.id,
            type: str(input.subagent_type) || "general-purpose",
            description: str(input.description) || item.task?.description || "",
            status:
              item.task?.status ??
              (item.status === "running" ? "running" : item.status === "error" ? "failed" : "completed"),
            toolUses: item.task?.toolUses ?? children.get(item.id) ?? 0,
            tokens: item.task?.tokens,
            durationMs: item.task?.durationMs,
          });
        } else if (item.name === "Bash") {
          stats.bash++;
        } else if (WEB_TOOLS.has(item.name)) {
          stats.web++;
        } else if (item.name === "Read") {
          const path = str(input.file_path);
          if (path) read.add(path);
        } else if (EDIT_TOOLS[item.name] && !failed) {
          const path = str(input[EDIT_TOOLS[item.name]!]);
          if (path) {
            const file = files.get(path) ?? { path, edits: 0, added: 0, removed: 0 };
            const lines = diffLines(item.diff);
            file.edits++;
            file.added += lines.added;
            file.removed += lines.removed;
            files.set(path, file);
            stats.linesAdded += lines.added;
            stats.linesRemoved += lines.removed;
          }
        }
        break;
      }
    }
  }
  stats.tools = [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  stats.skills = byCount(skills);
  stats.commands = byCount(commands);
  stats.mcp = [...mcp]
    .map(([server, s]) => ({ server, calls: s.calls, tools: s.tools.size }))
    .sort((a, b) => b.calls - a.calls || a.server.localeCompare(b.server));
  stats.files = [...files.values()].sort((a, b) => b.edits - a.edits || a.path.localeCompare(b.path));
  stats.filesRead = read.size;
  return stats;
}

/** All tokens a chat used (input, output and cache). */
export function totalTokens(meta: Pick<SessionMeta, "usage">): number {
  const u = meta.usage;
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

/** A duration for people: `45s`, `3m 20s`, `1h 05m`. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** A path for people: relative to the chat's folder when inside it. */
export function relativeTo(cwd: string, path: string): string {
  const base = cwd.replace(/[\\/]+$/, "");
  if (base && (path.startsWith(`${base}/`) || path.startsWith(`${base}\\`)))
    return path.slice(base.length + 1);
  return path;
}
