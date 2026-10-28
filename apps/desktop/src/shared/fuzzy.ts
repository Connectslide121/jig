/**
 * Fuzzy matching for pickers (`@` file mentions, the `/` menu): the query's characters must appear in
 * order. Matches in the file name, at the start of a word or path segment, and in a row score higher.
 * Returns undefined when it doesn't match. Case-insensitive.
 */
export function fuzzyScore(text: string, query: string): number | undefined {
  const q = query.toLowerCase().replaceAll("\\", "/");
  if (!q) return 0;
  const t = text.toLowerCase().replaceAll("\\", "/");
  const nameStart = t.lastIndexOf("/") + 1;
  // A plain substring is the best kind of match, better still in the file name.
  const direct = t.lastIndexOf(q);
  if (direct >= 0) {
    const atStart = direct === 0 || "/-_. ".includes(t[direct - 1]!);
    return 1000 + (direct >= nameStart ? 500 : 0) + (atStart ? 200 : 0) - t.length;
  }
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    const i = t.indexOf(ch, from);
    if (i < 0) return undefined;
    score += 10;
    if (i === previous + 1) score += 15;
    if (i === 0 || "/-_. ".includes(t[i - 1]!)) score += 20;
    if (i >= nameStart) score += 10;
    previous = i;
    from = i + 1;
  }
  return score - t.length / 10;
}

/** The best `limit` items for a query, best first (stable for equal scores). */
export function fuzzyFilter<T>(items: T[], query: string, key: (item: T) => string, limit = 50): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(key(item), query) }))
    .filter((x): x is { item: T; index: number; score: number } => x.score !== undefined)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}
