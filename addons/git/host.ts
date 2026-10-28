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
  type Status,
} from "./lib/parse";
import {
  type AutoFetchSettings,
  canWatchTree,
  DEFAULT_AUTO_FETCH,
  dueForFetch,
  gitDirChangeMatters,
  type SingleFlight,
  singleFlight,
  throttleDebounce,
  treeChangeMatters,
} from "./lib/watch";

/** Runs the user's git safely: argument arrays (no shell), stable output, no prompts. */
async function git(
  api: AddonHostApi,
  cwd: string,
  args: string[],
  options: {
    ok?: number[];
    timeoutMs?: number;
    input?: string;
    encoding?: "utf8" | "base64";
    env?: Record<string, string>;
  } = {},
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
      env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C.UTF-8", ...options.env },
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

const statusRuns = new Map<string, SingleFlight<Status>>();

/**
 * The repository's status. One `git status` at a time per repository: a call while one runs waits
 * for one more run after it (shared by every caller meanwhile), as VS Code does, so bursts of
 * changes in a big repository never pile up git processes.
 */
export async function status({ cwd }: Cwd, api: AddonHostApi): Promise<Status> {
  let run = statusRuns.get(cwd);
  if (!run) {
    run = singleFlight(async () =>
      parseStatus(
        await git(api, cwd, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]),
      ),
    );
    statusRuns.set(cwd, run);
  }
  return run();
}

/** The status of several repositories at once (a workspace); one failing doesn't hide the others. */
export async function statusAll({ cwds }: { cwds: string[] }, api: AddonHostApi) {
  return Promise.all(
    (cwds ?? []).map(async (cwd) => {
      try {
        return { cwd, status: await status({ cwd }, api) };
      } catch (error) {
        return { cwd, error: (error as Error).message };
      }
    }),
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

/** Longest diff sent to Claude for a commit message: enough for any reviewable commit. */
const MESSAGE_DIFF_LIMIT = 60_000;

/**
 * What Claude needs to write a commit message: the diff that would be committed (staged, or every
 * change when nothing is staged, as the Commit button does), the names of new files, and the
 * subjects of recent commits (to match the repository's style).
 */
export async function messageContext({ cwd }: Cwd, api: AddonHostApi) {
  const stagedNames = (await git(api, cwd, ["diff", "--cached", "--name-only"])).trim();
  const staged = stagedNames.length > 0;
  let diff = await git(
    api,
    cwd,
    staged ? ["diff", "--cached", "--no-ext-diff"] : ["diff", "--no-ext-diff", "HEAD"],
    {
      ok: [0, 128],
    },
  );
  const untracked = staged
    ? ""
    : (await git(api, cwd, ["ls-files", "--others", "--exclude-standard"])).trim();
  if (untracked) diff += `\n\nNew files:\n${untracked}`;
  const truncated = diff.length > MESSAGE_DIFF_LIMIT;
  if (truncated) diff = `${diff.slice(0, MESSAGE_DIFF_LIMIT)}\n[… diff cut here]`;
  const recent = (await git(api, cwd, ["log", "-12", "--pretty=format:%s"], { ok: [0, 128] })).trim();
  return { staged, diff: diff.trim(), recent, truncated };
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
// Live refresh: each repository's working folder (Windows, macOS: one cheap handle per tree) and its
// git folder (HEAD, the index, refs) are watched; a change tells the UI which repository changed.
// Shared by every view of the repository (counted), closed when the last one goes.

type RepoWatch = {
  users: number;
  watchers: FSWatcher[];
  changed: ReturnType<typeof throttleDebounce>;
  tree: boolean;
};
const watchers = new Map<string, RepoWatch>();

/** Starts watching `cwd` (or adds a user). `tree`: the working folder is watched too. */
export async function watchRepo({ cwd }: Cwd, api: AddonHostApi): Promise<{ tree: boolean }> {
  const existing = watchers.get(cwd);
  if (existing) {
    existing.users++;
    return { tree: existing.tree };
  }
  const entry: RepoWatch = {
    users: 1,
    watchers: [],
    changed: throttleDebounce(() => api.emit("changed", { cwd })),
    tree: false,
  };
  watchers.set(cwd, entry);
  let gitDir: string;
  try {
    gitDir = (await git(api, cwd, ["rev-parse", "--absolute-git-dir"])).trim();
  } catch (error) {
    watchers.delete(cwd);
    throw error;
  }
  const add = (target: string, recursive: boolean, matters: (file: string) => boolean) => {
    try {
      const w = watch(target, { recursive }, (_e, file) => {
        if (!file || matters(String(file))) entry.changed.call();
      });
      w.on("error", () => w.close());
      entry.watchers.push(w);
      return true;
    } catch {
      // Watching isn't available here; the view still looks again by itself and on focus.
      return false;
    }
  };
  add(gitDir, false, gitDirChangeMatters);
  add(join(gitDir, "refs"), true, () => true);
  if (canWatchTree(process.platform)) entry.tree = add(cwd, true, treeChangeMatters);
  if (watchers.get(cwd) !== entry) for (const w of entry.watchers) w.close(); // unwatched meanwhile
  return { tree: entry.tree };
}

export function unwatchRepo({ cwd }: Cwd) {
  const entry = watchers.get(cwd);
  if (!entry || --entry.users > 0) return;
  for (const w of entry.watchers) w.close();
  entry.changed.cancel();
  watchers.delete(cwd);
}

// ------------------------------------------------------------------------------------------------
// Auto-fetch (a watcher, every minute): fetch each repository of your projects every few minutes,
// one at a time, so ahead/behind stays current without pressing Fetch. Never asks for credentials:
// a repository that would need a login is skipped until the next round.

export async function settings(_args: unknown, api: AddonHostApi): Promise<AutoFetchSettings> {
  return {
    ...DEFAULT_AUTO_FETCH,
    ...((await api.storage.get<Partial<AutoFetchSettings>>("autoFetch")) ?? {}),
  };
}

export async function saveSettings(args: AutoFetchSettings, api: AddonHostApi) {
  const minutes = Math.round(Number(args.minutes));
  await api.storage.set("autoFetch", {
    enabled: Boolean(args.enabled),
    minutes: Number.isFinite(minutes) ? Math.min(120, Math.max(1, minutes)) : DEFAULT_AUTO_FETCH.minutes,
  });
}

const lastFetched = new Map<string, number>();
let fetching = false;

export async function autoFetch(_args: unknown, api: AddonHostApi) {
  if (fetching) return;
  const s = await settings(undefined, api);
  if (!s.enabled) return;
  fetching = true;
  try {
    const repos = new Set<string>();
    for (const p of await api.projects()) {
      if (p.isGitRepo) repos.add(p.path);
      for (const r of p.repos ?? []) repos.add(r.path);
    }
    for (const cwd of dueForFetch([...repos], lastFetched, s.minutes * 60_000, Date.now())) {
      lastFetched.set(cwd, Date.now());
      await git(api, cwd, ["fetch", "--all", "--prune", "--quiet"], {
        ...NETWORK,
        // No login windows or prompts in the background (Git Credential Manager, ssh).
        env: { GCM_INTERACTIVE: "never", GIT_ASKPASS: "", SSH_ASKPASS: "" },
      }).catch(() => undefined);
    }
  } finally {
    fetching = false;
  }
}
