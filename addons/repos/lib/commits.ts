/**
 * A repository's commits as the Repos view shows them under its row, like the Git plugin (D-149):
 * the ones to pull, then the branch's latest, each marked to push or pushed; a commit's files and a
 * file's diff. Pure (tested in commits.test.ts).
 */

/** incoming: on the upstream, to pull · local: only here, to push · pushed. */
export type CommitState = "incoming" | "local" | "pushed";

export interface RepoCommit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  /** ms since the epoch. */
  time: number;
  /** Branches and tags pointing at it (`HEAD -> main` is `main`; HEAD itself left out). */
  refs: string[];
  state: CommitState;
}

export interface CommitFile {
  /** A, M, D, R, C, T. */
  status: string;
  path: string;
  /** The old path of a renamed or copied file, '' otherwise. */
  from: string;
  /** Lines added and removed, -1 for a binary file. */
  added: number;
  removed: number;
}

/** Unit separator between a commit's fields, record separator after each. */
export const LOG_FORMAT = "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1f%D%x1e";

/** Commits out of `git log` in LOG_FORMAT, each given the state `stateOf` says. */
export function parseLog(stdout: string, stateOf: (hash: string) => CommitState): RepoCommit[] {
  return stdout
    .split("\x1e")
    .map((record) => record.replace(/^\s+/, ""))
    .filter(Boolean)
    .map((record) => {
      const [hash = "", short = "", subject = "", author = "", time = "0", refs = ""] = record.split("\x1f");
      return {
        hash,
        short,
        subject,
        author,
        time: Number(time) * 1000,
        refs: refs
          .split(",")
          .map((ref) => ref.trim().replace(/^HEAD -> /, ""))
          .filter((ref) => ref && ref !== "HEAD" && !ref.endsWith("/HEAD")),
        state: stateOf(hash),
      };
    });
}

/** A ref as a chip shows it: a tag without its `tag:` mark. */
export function refLabel(ref: string): { label: string; tag: boolean } {
  return ref.startsWith("tag: ") ? { label: ref.slice(5), tag: true } : { label: ref, tag: false };
}

/** Compares a commit with its first parent (the root commit with nothing). */
export function diffTree(hash: string): string[] {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error("Not a commit hash");
  return [
    "diff-tree",
    "-r",
    "-M",
    "--root",
    "--diff-merges=first-parent",
    "--no-commit-id",
    "--no-color",
    hash,
  ];
}

/** A commit's files out of `--name-status` and `--numstat`, which list them in the same order. */
export function parseFiles(nameStatus: string, numstat: string): CommitFile[] {
  const counts = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  return nameStatus
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      const [code = "", first = "", second] = line.split("\t");
      const [added = "-", removed = "-"] = counts[i] ?? [];
      return {
        status: code.charAt(0),
        path: second ?? first,
        from: second === undefined ? "" : first,
        added: added === "-" ? -1 : Number(added),
        removed: removed === "-" ? -1 : Number(removed),
      };
    });
}

/** The longest diff shown under a file, in characters; past it, whole hunks are cut. */
export const MAX_DIFF = 20_000;

/** A file's patch from its first `@@`, cut at a whole hunk past `max` characters. */
export function hunks(patch: string, max = MAX_DIFF): { text: string; cut: boolean } {
  const start = patch.indexOf("\n@@");
  const body = patch.startsWith("@@") ? patch : start < 0 ? "" : patch.slice(start + 1);
  const trim = (text: string) => text.replace(/\n+$/, "");
  if (body.length <= max) return { text: trim(body), cut: false };
  // Cut before the last hunk that starts within `max`; a first hunk longer than `max` is kept whole.
  const at = body.lastIndexOf("\n@@", max);
  const second = body.indexOf("\n@@", 1);
  return { text: trim(at > 0 ? body.slice(0, at) : second > 0 ? body.slice(0, second) : body), cut: true };
}

/** How long ago a commit was: `4m`, `3h`, `yesterday`, `5d`, `3w`, or its date past two months. */
export function commitAge(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return new Date(ms).toISOString().slice(0, 10);
}
