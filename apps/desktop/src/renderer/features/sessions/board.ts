import type { SessionMeta } from "../../../shared/engine";

/** A column of the chats board (D-178): what each chat needs from you, across every project. */
export type BoardColumnKey = "needs_you" | "working" | "unread" | "error" | "recent";

export interface BoardColumn {
  key: BoardColumnKey;
  title: string;
  hint: string;
  chats: SessionMeta[];
}

const COLUMNS: Array<Omit<BoardColumn, "chats">> = [
  { key: "needs_you", title: "Needs you", hint: "Waiting for an answer or a permission" },
  { key: "working", title: "Working", hint: "Claude is on it" },
  { key: "unread", title: "Finished", hint: "Done since you last looked" },
  { key: "error", title: "Stopped with an error", hint: "Open it to see what went wrong" },
  { key: "recent", title: "Recent", hint: "Quiet chats of the last week" },
];

/** At most this many quiet chats; the Chats list has the rest. */
export const RECENT_LIMIT = 30;

/** Which column a chat belongs in; `seen` is the turn count when you last looked at it. */
export function boardColumnOf(meta: SessionMeta, seen: number | undefined): BoardColumnKey {
  if (meta.status === "needs_you") return "needs_you";
  if (meta.status === "working" || meta.status === "starting") return "working";
  if (meta.status === "error") return "error";
  if (seen !== undefined && meta.turns > seen) return "unread";
  return "recent";
}

/** Every chat (not builds, not archived) in its column, newest first; quiet ones only from the last week. */
export function boardColumns(
  metas: SessionMeta[],
  seen: Record<string, number>,
  now = Date.now(),
): BoardColumn[] {
  const weekAgo = now - 7 * 86_400_000;
  const by = new Map<BoardColumnKey, SessionMeta[]>(COLUMNS.map((c) => [c.key, []]));
  const sorted = metas
    .filter((m) => m.kind !== "builder" && !m.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const meta of sorted) {
    const key = boardColumnOf(meta, seen[meta.id]);
    if (key === "recent" && new Date(meta.updatedAt).getTime() < weekAgo) continue;
    by.get(key)!.push(meta);
  }
  return COLUMNS.map((c) => ({
    ...c,
    chats: c.key === "recent" ? by.get(c.key)!.slice(0, RECENT_LIMIT) : by.get(c.key)!,
  }));
}

/** The board's header line: what is going on, and what the chats of today cost. */
export function boardSummary(columns: BoardColumn[], metas: SessionMeta[], now = Date.now()): string {
  const count = (key: BoardColumnKey) => columns.find((c) => c.key === key)?.chats.length ?? 0;
  const today = new Date(now).toDateString();
  const cost = metas
    .filter((m) => m.kind !== "builder" && new Date(m.updatedAt).toDateString() === today)
    .reduce((sum, m) => sum + (m.costUsd || 0), 0);
  const parts = [
    count("needs_you") && `${count("needs_you")} need${count("needs_you") === 1 ? "s" : ""} you`,
    count("working") && `${count("working")} working`,
    count("unread") && `${count("unread")} finished`,
    count("error") && `${count("error")} stopped`,
  ].filter(Boolean) as string[];
  return [parts.join(" · ") || "Nothing needs you", cost > 0 ? `≈ $${cost.toFixed(2)} today` : ""]
    .filter(Boolean)
    .join(" · ");
}
