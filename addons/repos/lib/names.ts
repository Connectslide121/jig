/** How the Repos list names and labels repositories (pure, tested in names.test.ts). */

/**
 * Each repository's short name, like the Git plugin: its folder's name (`Podium/podium` → `podium`).
 * When two share a name, both get their parent too (`wt/C1`), and so on until they differ.
 */
export function shortNames(paths: string[]): Map<string, string> {
  const parts = new Map(paths.map((p) => [p, p.replaceAll("\\", "/").replace(/\/+$/, "").split("/")]));
  const out = new Map<string, string>();
  for (const [path, segs] of parts) {
    let n = 1;
    const name = () => segs.slice(-n).join("/");
    while (
      n < segs.length &&
      [...parts.entries()].some(([other, o]) => other !== path && o.slice(-n).join("/") === name())
    )
      n++;
    out.set(path, name());
  }
  return out;
}

/** What the sync chip says and how it looks: work to sync, local changes, or a tick. */
export function syncChip(repo: { ahead: number; behind: number; dirty: number; error?: string }): {
  text: string;
  tone: "danger" | "accent" | "warning" | "success";
} {
  if (repo.error) return { text: "error", tone: "danger" };
  const parts = [repo.behind && `↓${repo.behind}`, repo.ahead && `↑${repo.ahead}`].filter(Boolean);
  if (parts.length) return { text: parts.join(" "), tone: "accent" };
  if (repo.dirty) return { text: `${repo.dirty} changed`, tone: "warning" };
  return { text: "✓", tone: "success" };
}
