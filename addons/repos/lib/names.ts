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

/**
 * A repository's state at a glance: the dot's tone and words, and what the row's pills show (nothing
 * for a repository that is up to date, so a long list stays calm).
 */
export function repoStatus(repo: { ahead: number; behind: number; dirty: number; error?: string }): {
  tone: "danger" | "accent" | "warning" | "success";
  label: string;
  /** `↓1 ↑2`, when there is something to pull or push. */
  sync?: string;
  /** Files with uncommitted changes. */
  changed?: number;
} {
  if (repo.error) return { tone: "danger", label: "Couldn't read it" };
  const sync = [repo.behind && `↓${repo.behind}`, repo.ahead && `↑${repo.ahead}`].filter(Boolean).join(" ");
  const changed = repo.dirty || undefined;
  const label = [
    repo.behind && `${repo.behind} to pull`,
    repo.ahead && `${repo.ahead} to push`,
    repo.dirty && `${repo.dirty} changed`,
  ]
    .filter(Boolean)
    .join(", ");
  if (sync) return { tone: "accent", label, sync, changed };
  if (changed) return { tone: "warning", label, changed };
  return { tone: "success", label: "Up to date" };
}
