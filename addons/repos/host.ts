import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { AddonHostApi, AddonWorkspace } from "@jig/sdk";

export interface RepoState {
  /** The workspace (added folder) the repository is in. */
  workspaceId: string;
  name: string;
  path: string;
  /** Set for a repository inside a workspace project (its path). */
  repoPath?: string;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  /** Files with uncommitted changes (including untracked). */
  dirty: number;
  /** When `git fetch` last ran (FETCH_HEAD time). */
  lastFetch?: string;
  error?: string;
}

const ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };

async function git(api: AddonHostApi, cwd: string, args: string[], timeoutMs = 30_000) {
  const r = await api.exec("git", ["-c", "core.quotepath=off", ...args], { cwd, timeoutMs, env: ENV });
  if (r.code !== 0)
    throw new Error(
      (r.stderr || r.stdout).trim().split("\n").slice(-4).join("\n") || `git ${args[0]} failed`,
    );
  return r.stdout;
}

/** Branch, ahead/behind and dirty count from `git status --porcelain=v2 --branch`. */
export function summarize(
  out: string,
): Pick<RepoState, "branch" | "upstream" | "ahead" | "behind" | "dirty"> {
  const state = {
    branch: undefined as string | undefined,
    upstream: undefined as string | undefined,
    ahead: 0,
    behind: 0,
    dirty: 0,
  };
  for (const line of out.split("\0")) {
    if (line.startsWith("# branch.head ")) state.branch = line.slice(14);
    else if (line.startsWith("# branch.upstream ")) state.upstream = line.slice(18);
    else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(line);
      if (m) {
        state.ahead = Number(m[1]);
        state.behind = Number(m[2]);
      }
    } else if (/^[12u?] /.test(line)) state.dirty++;
  }
  return state;
}

type RepoItem = { workspaceId: string; name: string; path: string; repoPath?: string };

/** Every repository of every workspace (added folder), whatever the projects; each once. */
export function repoItems(workspaces: AddonWorkspace[]): RepoItem[] {
  const seen = new Set<string>();
  return workspaces
    .filter((w) => w.exists)
    .flatMap((w): RepoItem[] =>
      w.isGitRepo
        ? [{ workspaceId: w.id, name: w.name, path: w.path }]
        : (w.repos ?? []).map((r) => ({
            workspaceId: w.id,
            name: `${w.name}/${r.name}`,
            path: r.path,
            repoPath: r.path,
          })),
    )
    .filter((r) => !seen.has(r.path) && Boolean(seen.add(r.path)));
}

async function inspect(api: AddonHostApi, p: RepoItem): Promise<RepoState> {
  const base: RepoState = { ...p, ahead: 0, behind: 0, dirty: 0 };
  try {
    const out = await git(api, p.path, ["status", "--porcelain=v2", "--branch", "-z"]);
    const gitDir = (await git(api, p.path, ["rev-parse", "--absolute-git-dir"])).trim();
    const fetched = await stat(join(gitDir, "FETCH_HEAD")).catch(() => undefined);
    return { ...base, ...summarize(out), lastFetch: fetched?.mtime.toISOString() };
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
}

/** Runs `fn` over `items` with at most `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function overview(_: unknown, api: AddonHostApi): Promise<RepoState[]> {
  return pool(repoItems(await api.workspaces()), 6, (p) => inspect(api, p));
}

export async function fetch({ path }: { path: string }, api: AddonHostApi) {
  await git(api, path, ["fetch", "--all", "--prune"], 180_000);
}

export async function pull({ path }: { path: string }, api: AddonHostApi) {
  await git(api, path, ["pull"], 180_000);
}

/** Where a branch's first push goes: `origin`, else the repository's only (or first) remote. */
export function pushRemote(remotes: string[]): string | undefined {
  return remotes.includes("origin") ? "origin" : remotes[0];
}

export async function push({ path }: { path: string }, api: AddonHostApi) {
  const state = summarize(await git(api, path, ["status", "--porcelain=v2", "--branch", "-z"]));
  if (state.upstream) await git(api, path, ["push"], 180_000);
  else if (state.branch) {
    const remote = pushRemote((await git(api, path, ["remote"])).split(/\r?\n/).filter(Boolean));
    if (!remote) throw new Error("This repository has no remote to push to");
    await git(api, path, ["push", "-u", remote, state.branch], 180_000);
  }
}

export async function fetchAll(_: unknown, api: AddonHostApi) {
  const results = await pool(repoItems(await api.workspaces()), 4, async (p) => {
    try {
      await fetch({ path: p.path }, api);
      return undefined;
    } catch (error) {
      return `${p.name}: ${(error as Error).message}`;
    }
  });
  return results.filter(Boolean);
}

export async function openInCode({ path }: { path: string }, api: AddonHostApi) {
  const r = await api.exec("code", [path], { timeoutMs: 20_000 });
  if (r.code === 127)
    throw new Error(
      "VS Code's `code` command was not found. In VS Code: Command Palette → \"Shell Command: Install 'code' command in PATH\".",
    );
  if (r.code !== 0) throw new Error(r.stderr.trim() || "VS Code could not be opened");
}
