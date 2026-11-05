/**
 * What Claude's Repos tools answer (D-371), as plain text: a repository's state on one line, its
 * commits. Pure (tested in report.test.ts).
 */
import type { RepoCommit } from "./commits";

/** The fields of a repository's state the tools print (`RepoState` in host.ts). */
export interface RepoLine {
  name: string;
  path: string;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: number;
  lastFetch?: string;
  error?: string;
}

/** How long ago, short: 5m, 3h, 2d. */
export function ago(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/** Something to do: changes to commit, commits to push or pull, no upstream, or an error. */
export const needsAttention = (r: RepoLine) =>
  Boolean(r.error || r.dirty || r.ahead || r.behind || (r.branch && !r.upstream));

/** `Shop · main → origin/main · 2 to push · 1 to pull · 3 changed files · fetched 2h ago · /src/shop`. */
export function repoText(r: RepoLine, now = Date.now()): string {
  if (r.error) return `${r.name} · couldn't read: ${r.error.split("\n")[0]} · ${r.path}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    r.name,
    r.branch ? (r.upstream ? `${r.branch} → ${r.upstream}` : `${r.branch} (no upstream)`) : "no branch",
    r.ahead ? `${r.ahead} to push` : "",
    r.behind ? `${r.behind} to pull` : "",
    r.dirty ? plural(r.dirty, "changed file", "changed files") : "clean",
    r.lastFetch ? `fetched ${ago(Date.parse(r.lastFetch), now)} ago` : "never fetched",
    r.path,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The repository asked for: its path, its name, or the one name containing it (any case). */
export function findRepo<T extends { name: string; path: string }>(repos: T[], query: string): T | undefined {
  const q = query.trim().toLowerCase().replaceAll("\\", "/");
  const norm = (s: string) => s.toLowerCase().replaceAll("\\", "/");
  const exact = repos.find((r) => norm(r.path) === q || norm(r.name) === q);
  if (exact) return exact;
  const partial = repos.filter((r) => norm(r.name).includes(q));
  return partial.length === 1 ? partial[0] : undefined;
}

/** A commit on one line: `a1b2c3d · 2h ago · Ana · Fix the cart (to push) [main]`. */
export function commitText(c: RepoCommit, now = Date.now()): string {
  const state = { local: " (to push)", incoming: " (to pull)", pushed: "" }[c.state] ?? "";
  const refs = c.refs.length ? ` [${c.refs.join(", ")}]` : "";
  return `${c.short} · ${ago(c.time, now)} ago · ${c.author} · ${c.subject}${state}${refs}`;
}
