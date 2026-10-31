/**
 * Go to… (D-176): one list of chats, views, actions and files, filtered by what you type. Pure, so the
 * ranking is tested; `QuickOpen.tsx` gathers the items and shows them.
 */
export type QuickKind = "chat" | "view" | "action" | "file";

export interface QuickItem {
  kind: QuickKind;
  id: string;
  label: string;
  /** Second line: the chat's project, the action's group, the file's folder. */
  detail?: string;
  /** Newer first among equal matches (chats: last activity, ISO). */
  recency?: string;
}

export const QUICK_KINDS: Array<{ kind: QuickKind; title: string }> = [
  { kind: "chat", title: "Chats" },
  { kind: "view", title: "Views" },
  { kind: "action", title: "Actions" },
  { kind: "file", title: "Files" },
];

/** How well an item matches: every word must be in its label or detail; label prefix > label > detail. */
export function quickScore(item: QuickItem, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const label = item.label.toLowerCase();
  const detail = (item.detail ?? "").toLowerCase();
  let score = 0;
  for (const w of words) {
    if (label.startsWith(w)) score += 3;
    else if (label.split(/[\s/._-]+/).some((part) => part.startsWith(w))) score += 2;
    else if (label.includes(w)) score += 1.5;
    else if (detail.includes(w)) score += 0.5;
    else return 0;
  }
  return score;
}

/**
 * The groups to show, in `QUICK_KINDS` order, best match first, at most `perKind` each. Files come
 * from a search on the host and are kept in its order.
 */
export function quickGroups(
  items: QuickItem[],
  query: string,
  perKind = 8,
): Array<{ kind: QuickKind; title: string; items: QuickItem[] }> {
  return QUICK_KINDS.map(({ kind, title }) => {
    const scored = items
      .filter((i) => i.kind === kind)
      .map((item, index) => ({ item, index, score: kind === "file" ? 1 : quickScore(item, query) }))
      .filter((s) => s.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.item.recency ?? "").localeCompare(a.item.recency ?? "") ||
          a.index - b.index,
      );
    return { kind, title, items: scored.slice(0, perKind).map((s) => s.item) };
  }).filter((g) => g.items.length > 0);
}
