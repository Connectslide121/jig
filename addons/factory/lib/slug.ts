/**
 * Run ids, slugs, branches and folders (architecture.md → Data model, D-427, D-449). Pure.
 */

/** A slug from a title: lower-case ASCII words joined by dashes, 40 characters at most. */
export function slugify(text: string): string {
  const s = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = s.length > 40 ? s.slice(0, 40).replace(/-[^-]*$/, "") || s.slice(0, 40) : s;
  return cut.replace(/-+$/, "") || "idea";
}

/** The slug, or the slug with `-2`, `-3`… when a run of the project already has it. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** A new run id: `fx-` and base-36 time and randomness (never `fx-sample-…`, those are samples). */
export function newRunId(now = Date.now(), random = Math.random): string {
  const tail = Math.floor(random() * 36 ** 3)
    .toString(36)
    .padStart(3, "0");
  return `fx-${now.toString(36)}${tail}`;
}

/** The run's branch (D-427). */
export const branchOf = (slug: string): string => `factory/${slug}`;

/** The run's folder, relative to the repository (D-427). */
export const folderOf = (slug: string): string => `docs/factory/${slug}`;

/** A run's title from what came in: its first line, cut at a word to 60 characters. */
export function titleOf(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find((l) => l.length > 0) ?? "";
  if (line.length <= 60) return line || "New idea";
  return `${line.slice(0, 60).replace(/\s+\S*$/, "")}…`;
}
