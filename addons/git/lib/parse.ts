/**
 * Parsers for git's machine-readable output. Pure, so they are unit-tested (parse.test.ts) and shared
 * by the host code and the UI.
 */

export interface BranchHeader {
  oid?: string;
  head?: string; // branch name, or "(detached)"
  upstream?: string;
  ahead: number;
  behind: number;
}

export type ChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechange"
  | "unmerged"
  | "untracked";

export interface FileChange {
  path: string;
  origPath?: string;
  kind: ChangeKind;
}

export interface Status {
  branch: BranchHeader;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  conflicted: FileChange[];
}

const KIND: Record<string, ChangeKind> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "typechange",
  U: "unmerged",
};

/** `git status --porcelain=v2 --branch -z` */
export function parseStatus(out: string): Status {
  const status: Status = {
    branch: { ahead: 0, behind: 0 },
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]!;
    if (!line) continue;
    if (line.startsWith("# ")) {
      const [key, ...rest] = line.slice(2).split(" ");
      const value = rest.join(" ");
      if (key === "branch.oid") status.branch.oid = value === "(initial)" ? undefined : value;
      else if (key === "branch.head") status.branch.head = value;
      else if (key === "branch.upstream") status.branch.upstream = value;
      else if (key === "branch.ab") {
        const m = /^\+(\d+) -(\d+)$/.exec(value);
        if (m) {
          status.branch.ahead = Number(m[1]);
          status.branch.behind = Number(m[2]);
        }
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      // 1 XY sub mH mI mW hH hI path   |   2 XY sub mH mI mW hH hI Xscore path \0 origPath
      const fields = line.split(" ");
      const xy = fields[1]!;
      const renamed = line.startsWith("2 ");
      const path = fields.slice(renamed ? 9 : 8).join(" ");
      const origPath = renamed ? parts[++i] : undefined;
      const [x, y] = [xy[0]!, xy[1]!];
      if (x !== ".") status.staged.push({ path, origPath, kind: KIND[x] ?? "modified" });
      if (y !== ".") status.unstaged.push({ path, kind: KIND[y] ?? "modified" });
    } else if (line.startsWith("u ")) {
      const fields = line.split(" ");
      status.conflicted.push({ path: fields.slice(10).join(" "), kind: "unmerged" });
    } else if (line.startsWith("? ")) {
      status.untracked.push({ path: line.slice(2), kind: "untracked" });
    }
  }
  return status;
}

export interface Branch {
  name: string; // short name: main, origin/main
  ref: string; // refs/heads/main
  remote: boolean;
  current: boolean;
  oid: string;
  upstream?: string;
  ahead: number;
  behind: number;
  gone?: boolean;
  date?: string;
}

export const BRANCH_FORMAT = [
  "%(refname)",
  "%(refname:short)",
  "%(objectname:short)",
  "%(upstream:short)",
  "%(upstream:track,nobracket)",
  "%(HEAD)",
  "%(committerdate:iso8601-strict)",
].join("%00");

/** `git for-each-ref --format=<BRANCH_FORMAT> refs/heads refs/remotes` */
export function parseBranches(out: string): Branch[] {
  const branches: Branch[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [ref, name, oid, upstream, track, head, date] = line.split("\0");
    if (!ref || !name || ref.endsWith("/HEAD")) continue;
    const ahead = Number(/ahead (\d+)/.exec(track ?? "")?.[1] ?? 0);
    const behind = Number(/behind (\d+)/.exec(track ?? "")?.[1] ?? 0);
    branches.push({
      name,
      ref,
      remote: ref.startsWith("refs/remotes/"),
      current: head === "*",
      oid: oid ?? "",
      upstream: upstream || undefined,
      ahead,
      behind,
      gone: track === "gone" || undefined,
      date: date || undefined,
    });
  }
  // Current first, then local, then remote; newest first within each.
  return branches.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      Number(a.remote) - Number(b.remote) ||
      (b.date ?? "").localeCompare(a.date ?? "") ||
      a.name.localeCompare(b.name),
  );
}

export interface Commit {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  body?: string;
  refs?: string[];
}

/** Fields separated by \x1f, records by \x1e. */
export const LOG_FORMAT = "%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1e";
export const SHOW_FORMAT = "%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1f%b%x1e";

export function parseLog(out: string): Commit[] {
  return out
    .split("\x1e")
    .map((r) => r.replace(/^\n+/, ""))
    .filter((r) => r.includes("\x1f"))
    .map((record) => {
      const [hash, short, parents, author, email, date, refs, subject, body] = record.split("\x1f");
      return {
        hash: hash!,
        short: short!,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        author: author ?? "",
        email: email ?? "",
        date: date ?? "",
        subject: subject ?? "",
        body: body?.trim() || undefined,
        refs: refs
          ? refs
              .split(", ")
              .map((r) => r.replace(/^HEAD -> /, ""))
              .filter(Boolean)
          : undefined,
      };
    });
}

export interface NumstatEntry {
  path: string;
  origPath?: string;
  added: number | null; // null = binary
  deleted: number | null;
}

/** `git diff --numstat -z` / `git show --numstat -z` (renames: "a\tb\t\0old\0new\0"). */
export function parseNumstat(out: string): NumstatEntry[] {
  const parts = out.split("\0");
  const entries: NumstatEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!.replace(/^\n+/, "");
    if (!part) continue;
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(part);
    if (!m) continue;
    const added = m[1] === "-" ? null : Number(m[1]);
    const deleted = m[2] === "-" ? null : Number(m[2]);
    if (m[3] === "") {
      const origPath = parts[++i];
      const path = parts[++i];
      if (path) entries.push({ path, origPath, added, deleted });
    } else entries.push({ path: m[3]!, added, deleted });
  }
  return entries;
}

export interface DiffLine {
  type: "context" | "add" | "del";
  text: string;
  oldNo?: number;
  newNo?: number;
}

export interface Hunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath?: string;
  newPath?: string;
  binary: boolean;
  hunks: Hunk[];
}

/** Unified diff of one file (`git diff` / `git show -- path`). */
export function parseUnifiedDiff(patch: string): FileDiff {
  const diff: FileDiff = { binary: false, hunks: [] };
  let hunk: Hunk | undefined;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
      if (!m) continue;
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      hunk = { header: raw, oldStart: oldNo, newStart: newNo, lines: [] };
      diff.hunks.push(hunk);
    } else if (!hunk) {
      if (raw.startsWith("--- ")) diff.oldPath = stripPrefix(raw.slice(4));
      else if (raw.startsWith("+++ ")) diff.newPath = stripPrefix(raw.slice(4));
      else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) diff.binary = true;
    } else if (raw.startsWith("+")) hunk.lines.push({ type: "add", text: raw.slice(1), newNo: newNo++ });
    else if (raw.startsWith("-")) hunk.lines.push({ type: "del", text: raw.slice(1), oldNo: oldNo++ });
    else if (raw.startsWith(" "))
      hunk.lines.push({ type: "context", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
    else if (raw === "" && hunk.lines.length > 0) {
      // A trailing empty line at the end of the patch output.
    }
  }
  return diff;
}

const stripPrefix = (p: string) =>
  p === "/dev/null" ? undefined : p.replace(/^[ab]\//, "").replace(/\t.*$/, "");

export interface SideBySideRow {
  left?: DiffLine;
  right?: DiffLine;
}

/** Pairs deleted and added lines of each change block so they sit side by side. */
export function sideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ left: dels[i], right: adds[i] });
    dels = [];
    adds = [];
  };
  for (const line of lines) {
    if (line.type === "del") dels.push(line);
    else if (line.type === "add") adds.push(line);
    else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}

export type Segment<T> = { kind: "lines"; items: T[] } | { kind: "collapsed"; items: T[] };

/** Collapses long runs of unchanged lines, keeping `keep` lines of context around each change. */
export function collapseUnchanged<T>(items: T[], isChange: (item: T) => boolean, keep = 3): Segment<T>[] {
  const out: Segment<T>[] = [];
  const push = (kind: Segment<T>["kind"], list: T[]) => {
    if (!list.length) return;
    const last = out[out.length - 1];
    if (kind === "lines" && last?.kind === "lines") last.items.push(...list);
    else out.push({ kind, items: list });
  };
  let i = 0;
  while (i < items.length) {
    if (isChange(items[i]!)) {
      push("lines", [items[i]!]);
      i++;
      continue;
    }
    let j = i;
    while (j < items.length && !isChange(items[j]!)) j++;
    const run = items.slice(i, j);
    const head = i === 0 ? 0 : keep;
    const tail = j === items.length ? 0 : keep;
    if (run.length > head + tail + 2) {
      push("lines", run.slice(0, head));
      push("collapsed", run.slice(head, run.length - tail));
      push("lines", run.slice(run.length - tail));
    } else push("lines", run);
    i = j;
  }
  return out;
}

/** Web page for a commit on GitHub or Azure DevOps, from a remote URL. */
export function commitUrl(remote: string, hash: string): string | undefined {
  const r = remote.trim().replace(/\.git$/, "");
  let m =
    /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+)$/.exec(
      r,
    );
  if (m) return `https://github.com/${m[1]}/${m[2]}/commit/${hash}`;
  m = /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)$/.exec(r);
  if (m) return `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}/commit/${hash}`;
  m = /^(?:git@)?ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(r);
  if (m) return `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}/commit/${hash}`;
  m = /^https:\/\/([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+)$/.exec(r);
  if (m) return `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}/commit/${hash}`;
  return undefined;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const units: Array<[number, string]> = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2629800, "month"],
    [31557600, "year"],
  ];
  let pick = units[0]!;
  for (const u of units) if (s >= u[0]) pick = u;
  const n = Math.floor(s / pick[0]);
  return `${n} ${pick[1]}${n === 1 ? "" : "s"} ago`;
}
