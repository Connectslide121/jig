import type { ActivityEvent } from "./mine";

/** One name and how often it was used, in how many chats. */
export interface UsageCount {
  name: string;
  count: number;
  chats: number;
}

/**
 * How Claude worked for you across chats (D-185): the overview card's counts, summed over the
 * activity log. Read from `session.tool` events tagged `detail.use` / `detail.name` / `detail.chat`.
 */
export interface UsageSummary {
  days: number;
  chats: number;
  prompts: number;
  toolCalls: number;
  tools: UsageCount[];
  skills: UsageCount[];
  subagents: UsageCount[];
  addons: UsageCount[];
  mcp: UsageCount[];
}

const USES = { skill: "skills", subagent: "subagents", addon: "addons", mcp: "mcp" } as const;

function sorted(map: Map<string, { count: number; chats: Set<string> }>): UsageCount[] {
  return [...map.entries()]
    .map(([name, v]) => ({ name, count: v.count, chats: v.chats.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Sums the tool calls, skills, subagents, add-ons and MCP servers Claude used in chats. */
export function usageSummary(events: ActivityEvent[], days: number): UsageSummary {
  const chats = new Set<string>();
  let prompts = 0;
  let toolCalls = 0;
  const maps = {
    tools: new Map<string, { count: number; chats: Set<string> }>(),
    skills: new Map<string, { count: number; chats: Set<string> }>(),
    subagents: new Map<string, { count: number; chats: Set<string> }>(),
    addons: new Map<string, { count: number; chats: Set<string> }>(),
    mcp: new Map<string, { count: number; chats: Set<string> }>(),
  };
  const bump = (map: Map<string, { count: number; chats: Set<string> }>, name: string, chat: string) => {
    const v = map.get(name) ?? { count: 0, chats: new Set<string>() };
    v.count++;
    if (chat) v.chats.add(chat);
    map.set(name, v);
  };
  for (const e of events) {
    const chat = e.detail?.chat ?? "";
    if (e.kind === "prompt") {
      prompts++;
      if (chat) chats.add(chat);
      continue;
    }
    if (e.kind !== "session.tool") continue;
    toolCalls++;
    if (chat) chats.add(chat);
    const tool = e.detail?.tool;
    if (tool) bump(maps.tools, tool, chat);
    const use = e.detail?.use as keyof typeof USES | undefined;
    const name = e.detail?.name;
    if (use && name && use in USES) bump(maps[USES[use]], name, chat);
  }
  return {
    days,
    chats: chats.size,
    prompts,
    toolCalls,
    tools: sorted(maps.tools),
    skills: sorted(maps.skills),
    subagents: sorted(maps.subagents),
    addons: sorted(maps.addons),
    mcp: sorted(maps.mcp),
  };
}

const list = (items: UsageCount[], max = 8) =>
  items.length
    ? items
        .slice(0, max)
        .map((i) => `${i.name} ${i.count}× in ${i.chats} chat(s)`)
        .join(", ")
    : "none";

/** The summary as a few lines for the weekly reflection; undefined when nothing was recorded. */
export function usageText(summary: UsageSummary): string | undefined {
  if (!summary.toolCalls && !summary.prompts) return undefined;
  return [
    `${summary.chats} chat(s), ${summary.prompts} message(s), ${summary.toolCalls} tool call(s) in ${summary.days} days`,
    `Tools: ${list(summary.tools)}`,
    `Skills: ${list(summary.skills)}`,
    `Subagents: ${list(summary.subagents)}`,
    `Add-ons: ${list(summary.addons)}`,
    `MCP servers: ${list(summary.mcp)}`,
  ].join("\n");
}
