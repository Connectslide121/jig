/**
 * The Files view's logic (pure, tested): sorting entries, git status of files and folders, which
 * folders it shows, filtering by name, and which file changes matter for a refresh.
 */

export interface Entry {
  name: string;
  path: string;
  dir: boolean;
  /** Ignored by git (.gitignore): shown dimmed. */
  ignored?: boolean;
}

/** Folders first, then by name (case-insensitive, numbers in order). */
export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.dir) - Number(a.dir) ||
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/** Never listed: git's own folder and OS clutter. */
export function hiddenEntry(name: string): boolean {
  return name === ".git" || name === ".DS_Store" || name === "Thumbs.db";
}

export type FileState = "modified" | "added" | "untracked" | "deleted" | "conflict" | "renamed";

/**
 * `git status --porcelain=v1 -z --untracked-files=all` in `repo` → absolute path → state (paths use
 * the separator of `repo`).
 */
export function parseStatus(out: string, repo: string): Record<string, FileState> {
  const sep = repo.includes("\\") && !repo.includes("/") ? "\\" : "/";
  const join = (rel: string) => `${repo.replace(/[\\/]+$/, "")}${sep}${rel.split("/").join(sep)}`;
  const result: Record<string, FileState> = {};
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i]!;
    if (item.length < 4) continue;
    const x = item[0]!;
    const y = item[1]!;
    const rel = item.slice(3);
    let state: FileState;
    if (x === "?" && y === "?") state = "untracked";
    else if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D"))
      state = "conflict";
    else if (x === "R" || x === "C") {
      state = "renamed";
      i++; // the original path follows
    } else if (x === "A") state = "added";
    else if (x === "D" || y === "D") state = "deleted";
    else state = "modified";
    result[join(rel)] = state;
  }
  return result;
}

/** Whether a folder holds changed files (for the dot next to it). */
export function folderChanged(folder: string, states: Record<string, FileState>): boolean {
  const prefix = folder.replace(/[\\/]+$/, "");
  return Object.keys(states).some(
    (p) => p.length > prefix.length && p.startsWith(prefix) && /[\\/]/.test(p[prefix.length]!),
  );
}

/** Which folders the view shows for a project: the chosen one first, then the ones shown next to it. */
export interface Roots {
  /** The folder the view follows; default the project's default workspace. */
  main?: string;
  /** Main folder → other folders shown with it. */
  extras: Record<string, string[]>;
}

export function visibleRoots(roots: Roots, fallback: string, known: string[]): string[] {
  const main = roots.main && known.includes(roots.main) ? roots.main : fallback;
  const extras = (roots.extras[main] ?? []).filter((p) => p !== main && known.includes(p));
  return [main, ...extras];
}

export function toggleRoot(roots: Roots, main: string, folder: string): Roots {
  const current = roots.extras[main] ?? [];
  const next = current.includes(folder) ? current.filter((p) => p !== folder) : [...current, folder];
  const extras = { ...roots.extras };
  if (next.length) extras[main] = next;
  else delete extras[main];
  return { ...roots, extras };
}

/**
 * Files matching a filter: every word of the query appears in the relative path (any order,
 * case-insensitive). Name matches first, then shorter paths. At most `limit`.
 */
export function filterPaths(paths: string[], query: string, limit = 200): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const base = (p: string) => p.split("/").pop()!.toLowerCase();
  return paths
    .filter((p) => {
      const lower = p.toLowerCase();
      return words.every((w) => lower.includes(w));
    })
    .sort(
      (a, b) =>
        Number(words.every((w) => base(b).includes(w))) - Number(words.every((w) => base(a).includes(w))) ||
        a.length - b.length ||
        a.localeCompare(b),
    )
    .slice(0, limit);
}

/** A change under a shown folder that can change the tree (paths relative to it). */
export function changeMatters(file: string): boolean {
  const parts = file.split(/[\\/]/);
  return !parts.includes(".git") || /(^|[\\/])\.git[\\/](index|HEAD)$/.test(file);
}
