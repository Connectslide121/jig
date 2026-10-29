/**
 * Arranging a list in a panel (pure, for add-ons): hide items, put them in your own order, and split
 * them into groups with dividers. The add-on keeps an `Arrangement` in its storage; items are known by
 * stable keys. Items that appear later (a new script) go after the arranged ones, in their own order.
 */
export interface Arrangement {
  /** Item and divider keys in your order. Divider keys start with `divider:`. */
  order: string[];
  /** Keys of hidden items. */
  hidden: string[];
  /** Divider key → its title ("" = a plain line). */
  dividers: Record<string, string>;
}

export const EMPTY_ARRANGEMENT: Arrangement = { order: [], hidden: [], dividers: {} };

export type Arranged<T> =
  | { kind: "item"; key: string; item: T; hidden: boolean }
  | { kind: "divider"; key: string; title: string };

export const isDivider = (key: string) => key.startsWith("divider:");

/**
 * The list to show: your order first, then new items; dividers where you put them (a divider with no
 * visible item after it before the next divider is left out unless `all`). Hidden items only with
 * `all` (arranging).
 */
export function arrange<T>(
  items: T[],
  keyOf: (item: T) => string,
  a: Arrangement,
  all = false,
): Arranged<T>[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const hidden = new Set(a.hidden);
  const placed = new Set<string>();
  const out: Arranged<T>[] = [];
  for (const key of a.order) {
    if (isDivider(key)) {
      if (key in a.dividers) out.push({ kind: "divider", key, title: a.dividers[key] ?? "" });
      continue;
    }
    const item = byKey.get(key);
    if (!item || placed.has(key)) continue;
    placed.add(key);
    out.push({ kind: "item", key, item, hidden: hidden.has(key) });
  }
  for (const item of items) {
    const key = keyOf(item);
    if (!placed.has(key)) out.push({ kind: "item", key, item, hidden: hidden.has(key) });
  }
  if (all) return out;
  const visible = out.filter((e) => e.kind === "divider" || !e.hidden);
  // Dividers with nothing under them (before the next divider or the end) don't show.
  return visible.filter((e, i) => {
    if (e.kind === "item") return true;
    const next = visible.slice(i + 1).find((x) => x.kind === "item" || x.kind === "divider");
    return next?.kind === "item";
  });
}

/** The full order as shown while arranging (so a move keeps everything else where it is). */
function fullOrder<T>(items: T[], keyOf: (item: T) => string, a: Arrangement): string[] {
  return arrange(items, keyOf, a, true).map((e) => e.key);
}

/** Moves `key` to just before `before` (or to the end). */
export function moveKey<T>(
  items: T[],
  keyOf: (item: T) => string,
  a: Arrangement,
  key: string,
  before?: string,
): Arrangement {
  const order = fullOrder(items, keyOf, a).filter((k) => k !== key);
  const at = before ? order.indexOf(before) : -1;
  order.splice(at < 0 ? order.length : at, 0, key);
  return { ...a, order };
}

export function toggleHidden(a: Arrangement, key: string): Arrangement {
  return { ...a, hidden: a.hidden.includes(key) ? a.hidden.filter((k) => k !== key) : [...a.hidden, key] };
}

/** Adds a divider before `before` (or at the end); returns the new arrangement and the divider's key. */
export function addDivider<T>(
  items: T[],
  keyOf: (item: T) => string,
  a: Arrangement,
  title = "",
  before?: string,
): Arrangement {
  const key = `divider:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const withDivider = { ...a, dividers: { ...a.dividers, [key]: title } };
  return moveKey(items, keyOf, { ...withDivider, order: [...fullOrder(items, keyOf, a), key] }, key, before);
}

export function renameDivider(a: Arrangement, key: string, title: string): Arrangement {
  return { ...a, dividers: { ...a.dividers, [key]: title.trim() } };
}

export function removeDivider(a: Arrangement, key: string): Arrangement {
  const dividers = { ...a.dividers };
  delete dividers[key];
  return { ...a, dividers, order: a.order.filter((k) => k !== key) };
}
