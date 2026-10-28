import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { type AddonHostApi, imageMime, MAX_IMAGE_BYTES } from "@jig/sdk";
import {
  BRANCH_FORMAT,
  type Commit,
  LOG_FORMAT,
  parseBranches,
  parseLog,
  parseNumstat,
  parseStatus,
  SHOW_FORMAT,
} from "./lib/parse";

/** Runs the user's git safely: argument arrays (no shell), stable output, no prompts. */
async function git(
  api: AddonHostApi,
  cwd: string,
  args: string[],
  options: { ok?: number[]; timeoutMs?: number; input?: string; encoding?: "utf8" | "base64" } = {},
) {
  const result = await api.exec(
    "git",
    [
      "-c",
      "core.quotepath=off",
      "-c",
      "color.ui=false",
      "-c",
      "i18n.logOutputEncoding=UTF-8",
      "--no-pager",
      ...args,
    ],
    {
      cwd,
      timeoutMs: options.timeoutMs ?? 30_000,
      env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C.UTF-8" },
      input: options.input,
      encoding: options.encoding,
    },
  );
  if (!(options.ok ?? [0]).includes(result.code)) {
    const message = (result.stderr || result.stdout).trim().split("\n").slice(-6).join("\n");
    throw new Error(
      result.code === 127
        ? "git is not installed or not on PATH"
        : message || `git ${args[0]} failed (${result.code})`,
    );
  }
  return result.stdout;
}

const NETWORK = { timeoutMs: 180_000 };
type Cwd = { cwd: string };

export async function status({ cwd }: Cwd, api: AddonHostApi) {
  return parseStatus(
    await git(api, cwd, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]),
  );
}

export async function branches({ cwd }: Cwd, api: AddonHostApi) {
  return parseBranches(
    await git(api, cwd, ["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes"]),
  );
}

export async function log(
  {
    cwd,
    ref,
    skip = 0,
    limit = 200,
    filter,
  }: Cwd & { ref: string; skip?: number; limit?: number; filter?: string },
  api: AddonHostApi,
): Promise<Commit[]> {
  const base = ["log", `--format=${LOG_FORMAT}`, "--date-order"];
  const target = [ref, "--"];
  if (!filter?.trim())
    return parseLog(await git(api, cwd, [...base, `--skip=${skip}`, `-n${limit}`, ...target]));
  // Message OR author: two queries merged by date (git ANDs --grep with --author).
  const f = filter.trim();
  const n = `-n${skip + limit}`;
  const [byMessage, byAuthor] = await Promise.all([
    git(api, cwd, [...base, n, "-i", "--fixed-strings", `--grep=${f}`, ...target]),
    git(api, cwd, [...base, n, "-i", `--author=${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, ...target]),
  ]);
  const seen = new Set<string>();
  return [...parseLog(byMessage), ...parseLog(byAuthor)]
    .filter((c) => !seen.has(c.hash) && seen.add(c.hash))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(skip, skip + limit);
}

export async function show({ cwd, hash }: Cwd & { hash: string }, api: AddonHostApi) {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error("Not a commit hash");
  const [commit] = parseLog(await git(api, cwd, ["show", "-s", `--format=${SHOW_FORMAT}`, hash]));
  if (!commit) throw new Error("Commit not found");
  const numstat = await git(api, cwd, [
    "show",
    "--format=",
    "--numstat",
    "-z",
    "-M",
    "--first-parent",
    "-m",
    hash,
  ]);
  return { commit, files: parseNumstat(numstat) };
}

const FULL_CONTEXT = "-U100000";

/** The patch of one file: in a commit, staged, unstaged or untracked. Full context, so it can be collapsed. */
export async function diff(
  {
    cwd,
    path,
    commit,
    staged,
    untracked,
  }: Cwd & { path: string; commit?: string; staged?: boolean; untracked?: boolean },
  api: AddonHostApi,
): Promise<{ patch: string; truncated: boolean }> {
  const run = async (context: string) => {
    if (commit) {
      if (!/^[0-9a-f]{4,40}$/i.test(commit)) throw new Error("Not a commit hash");
      return git(api, cwd, ["show", "--format=", context, "-M", "--first-parent", "-m", commit, "--", path]);
    }
    if (untracked)
      return git(api, cwd, ["diff", "--no-index", context, "--", "/dev/null", path], { ok: [0, 1] });
    return git(api, cwd, ["diff", context, "-M", ...(staged ? ["--cached"] : []), "--", path]);
  };
  const patch = await run(FULL_CONTEXT);
  if (patch.length > 3_000_000) return { patch: await run("-U3"), truncated: true };
  return { patch, truncated: false };
}

/**
 * One version of an image file as a data URL: `worktree` (the file on disk), `index` (staged), or a
 * commit (`HEAD`, a hash, `hash^`). `null` when the file doesn't exist in that version.
 */
export async function image(
  { cwd, path, rev }: Cwd & { path: string; rev: string },
  api: AddonHostApi,
): Promise<{ dataUrl: string; bytes: number } | { tooLarge: true } | null> {
  const mime = imageMime(path);
  if (!mime) throw new Error("Not an image file");
  let base64: string;
  if (rev === "worktree") {
    const file = join(cwd, path);
    if (!(await api.fs.exists(file))) return null;
    base64 = await api.fs.readFile(file, "base64");
  } else {
    if (rev !== "index" && rev !== "HEAD" && !/^[0-9a-f]{4,40}\^?$/i.test(rev))
      throw new Error("Bad revision");
    const spec = rev === "index" ? `:${path}` : `${rev}:${path}`;
    try {
      base64 = await git(api, cwd, ["show", spec], { encoding: "base64" });
    } catch {
      return null;
    }
  }
  const bytes =
    Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return { tooLarge: true };
  return { dataUrl: `data:${mime};base64,${base64}`, bytes };
}

export async function stage({ cwd, paths }: Cwd & { paths: string[] }, api: AddonHostApi) {
  await git(api, cwd, ["add", "--", ...paths]);
}

export async function unstage({ cwd, paths }: Cwd & { paths: string[] }, api: AddonHostApi) {
  try {
    await git(api, cwd, ["restore", "--staged", "--", ...paths]);
  } catch {
    // Before the first commit there's nothing to restore from.
    await git(api, cwd, ["rm", "--cached", "-q", "--", ...paths]);
  }
}

/** Throws away changes: tracked files go back to the index; untracked files are deleted. */
export async function discard(
  { cwd, paths, untracked }: Cwd & { paths: string[]; untracked?: boolean },
  api: AddonHostApi,
) {
  if (untracked) await git(api, cwd, ["clean", "-f", "-q", "--", ...paths]);
  else await git(api, cwd, ["restore", "--worktree", "--", ...paths]);
}

export async function commit(
  { cwd, message, amend }: Cwd & { message: string; amend?: boolean },
  api: AddonHostApi,
) {
  if (!message.trim() && !amend) throw new Error("Write a commit message first");
  await git(api, cwd, ["commit", ...(amend ? ["--amend"] : []), "-F", "-"], { input: message });
}

export async function switchBranch(
  { cwd, name, remote }: Cwd & { name: string; remote?: boolean },
  api: AddonHostApi,
) {
  if (remote) {
    const local = name.replace(/^[^/]+\//, "");
    const existing = (await branches({ cwd }, api)).some((b) => !b.remote && b.name === local);
    await git(api, cwd, existing ? ["switch", local] : ["switch", "--track", name]);
  } else await git(api, cwd, ["switch", name]);
}

export async function createBranch(
  { cwd, name, from }: Cwd & { name: string; from?: string },
  api: AddonHostApi,
) {
  const check = await api.exec("git", ["check-ref-format", "--branch", name], { cwd });
  if (check.code !== 0) throw new Error(`"${name}" is not a valid branch name`);
  await git(api, cwd, ["switch", "-c", name, ...(from ? [from] : [])]);
}

export async function fetch({ cwd }: Cwd, api: AddonHostApi) {
  await git(api, cwd, ["fetch", "--all", "--prune"], NETWORK);
}

export async function pull({ cwd }: Cwd, api: AddonHostApi) {
  return git(api, cwd, ["pull"], NETWORK);
}

/** Pushes; sets the upstream on the first push of a branch. */
export async function push({ cwd }: Cwd, api: AddonHostApi) {
  const s = await status({ cwd }, api);
  if (!s.branch.head || s.branch.head === "(detached)") throw new Error("Not on a branch");
  if (s.branch.upstream) return git(api, cwd, ["push"], NETWORK);
  const remotes = (await git(api, cwd, ["remote"])).split("\n").filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  if (!remote) throw new Error("This repository has no remote to push to");
  return git(api, cwd, ["push", "-u", remote, s.branch.head], NETWORK);
}

/** Commits on `branch` that the current branch doesn't have, and the other way round. */
export async function compare({ cwd, branch }: Cwd & { branch: string }, api: AddonHostApi) {
  const current = (await status({ cwd }, api)).branch.head ?? "HEAD";
  const range = (a: string, b: string) =>
    git(api, cwd, ["log", `--format=${LOG_FORMAT}`, "-n200", `${a}..${b}`, "--"]);
  const [onlyThere, onlyHere] = await Promise.all([range("HEAD", branch), range(branch, "HEAD")]);
  return { current, branch, onlyThere: parseLog(onlyThere), onlyHere: parseLog(onlyHere) };
}

export async function remoteUrl({ cwd }: Cwd, api: AddonHostApi) {
  return (await git(api, cwd, ["remote", "get-url", "origin"], { ok: [0, 2] })).trim() || undefined;
}

export async function isRepo({ cwd }: Cwd, api: AddonHostApi) {
  const r = await api.exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
  return r.code === 0 && r.stdout.trim() === "true";
}

// ------------------------------------------------------------------------------------------------
// Live refresh: watch .git/HEAD, the index and refs; tell the UI (debounced).

const watchers = new Map<string, { watchers: FSWatcher[]; timer?: NodeJS.Timeout }>();

export async function watchRepo({ cwd }: Cwd, api: AddonHostApi) {
  if (watchers.has(cwd)) return;
  const gitDir = (await git(api, cwd, ["rev-parse", "--absolute-git-dir"])).trim();
  const entry: { watchers: FSWatcher[]; timer?: NodeJS.Timeout } = { watchers: [] };
  const changed = () => {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => api.emit("changed", { cwd }), 300);
  };
  for (const [target, recursive] of [
    [gitDir, false],
    [join(gitDir, "refs"), true],
  ] as const) {
    try {
      entry.watchers.push(
        watch(target, { recursive }, (_e, file) => {
          if (!file || /^(HEAD|index|FETCH_HEAD|ORIG_HEAD|packed-refs)$/.test(String(file)) || recursive)
            changed();
        }),
      );
    } catch {
      // Watching isn't available; the view still refreshes on focus and after actions.
    }
  }
  watchers.set(cwd, entry);
}

export function unwatchRepo({ cwd }: Cwd) {
  const entry = watchers.get(cwd);
  for (const w of entry?.watchers ?? []) w.close();
  watchers.delete(cwd);
}
