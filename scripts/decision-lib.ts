/**
 * Pure parts of `npm run decision` (scripts/decision.ts): which D-numbers a decision log uses, the
 * next free one and the heading that reserves it (D-361). Tested in decision-lib.test.ts.
 */

/** Numbers used twice before reserving existed; `--check` lets these through. */
export const LEGACY_DUPLICATES: readonly number[] = [165];

const HEADING = /^#{2,3} D-(\d+)\b/gm;

/** The D-numbers of the decision headings in a decision log (`## D-123: …` or `### D-123 — …`). */
export function decisionNumbers(text: string): number[] {
  return [...text.matchAll(HEADING)].map((m) => Number(m[1]));
}

/** The next free number across every copy of the log (worktrees, branches): one above the highest. */
export function nextDecision(texts: readonly string[]): number {
  let max = 0;
  for (const text of texts) for (const n of decisionNumbers(text)) max = Math.max(max, n);
  return max + 1;
}

/** Numbers used by more than one heading, except the legacy ones; sorted. */
export function duplicateDecisions(text: string, allowed: readonly number[] = LEGACY_DUPLICATES): number[] {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const n of decisionNumbers(text)) {
    if (seen.has(n) && !allowed.includes(n)) dupes.add(n);
    seen.add(n);
  }
  return [...dupes].sort((a, b) => a - b);
}

/** `D-007`, `D-361`: at least three digits, like the log. */
export function decisionId(n: number): string {
  return `D-${String(n).padStart(3, "0")}`;
}

/** The entry appended to reserve a number: the heading and the start of the usual fields. */
export function decisionEntry(n: number, title: string): string {
  const clean = title.trim();
  if (!clean) throw new Error("A decision needs a title.");
  if (/[\r\n]/.test(clean)) throw new Error("A decision's title is one line.");
  return `## ${decisionId(n)}: ${clean}\n\n- Status: accepted.\n- **Who:**\n`;
}

/** The log with the entry appended after a blank line, keeping the file's line endings. */
export function appendEntry(text: string, entry: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = text.replace(/\s+$/, "");
  const block = entry.replace(/\n/g, eol);
  return body ? `${body}${eol}${eol}${block}` : block;
}
