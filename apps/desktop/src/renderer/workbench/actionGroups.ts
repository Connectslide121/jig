import type { ActionDef } from "./registry";

/** Pure: filters and groups actions for the menu. Every word of the query must match. */
export function filterActions(
  actions: ActionDef[],
  query: string,
): Array<{ group: string; actions: ActionDef[] }> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = actions.filter((a) => a.visible?.() !== false);
  const matches = visible.filter((a) => {
    const text = [a.title, a.group, ...(a.keywords ?? [])].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const groups = new Map<string, ActionDef[]>();
  for (const action of matches) groups.set(action.group, [...(groups.get(action.group) ?? []), action]);
  const order = ["Chats", "Claude", "Build", "Projects", "Terminals", "Git", "Layout", "Appearance", "Jig"];
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([group, list]) => ({ group, actions: list.sort((a, b) => a.title.localeCompare(b.title)) }));
}
