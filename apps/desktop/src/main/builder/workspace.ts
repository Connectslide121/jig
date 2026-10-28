import { cp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BuildFile } from "../../shared/builds";
import { git } from "../addons/repo";

/**
 * Level-2 work happens in a git worktree of `~/.jig/addons` (branch `build/<job>`), so nothing the
 * builder writes is live until you accept. Accept merges the branch; Discard removes worktree and branch.
 */
const IDENTITY = ["-c", "user.name=Jig builder", "-c", "user.email=jig@localhost"];

async function run(cwd: string, args: string[]) {
  const r = await git(cwd, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
  return r.stdout;
}

export async function createWorktree(repo: string, dir: string, branch: string): Promise<void> {
  await mkdir(join(dir, ".."), { recursive: true });
  await run(repo, ["worktree", "add", "-q", "-b", branch, dir, "HEAD"]);
}

/** Copies an add-on folder (e.g. a built-in one) into the worktree to be changed there. */
export async function copyInto(from: string, worktree: string, folder: string): Promise<string> {
  const target = join(worktree, folder);
  const exists = await stat(target).then(
    () => true,
    () => false,
  );
  if (!exists)
    await cp(from, target, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src),
    });
  return target;
}

/** Commits what the builder changed in the worktree; returns the changed files. */
export async function commitWorktree(dir: string, message: string): Promise<BuildFile[]> {
  await run(dir, ["add", "-A"]);
  const staged = await git(dir, ["diff", "--cached", "--quiet"]);
  if (staged.code !== 0) await run(dir, [...IDENTITY, "commit", "-q", "-m", message]);
  return changedFiles(dir);
}

/** Files that differ between the worktree's branch and where it started. */
export async function changedFiles(dir: string): Promise<BuildFile[]> {
  const base = (await run(dir, ["merge-base", "HEAD", "main"]).catch(() => "")).trim() || "HEAD~0";
  const [names, numstat] = await Promise.all([
    run(dir, ["diff", "--no-renames", "--name-status", "-z", base, "HEAD"]),
    run(dir, ["diff", "--no-renames", "--numstat", "-z", base, "HEAD"]),
  ]);
  const counts = new Map<string, [number, number]>();
  for (const entry of numstat.split("\0").filter(Boolean)) {
    const [a, d, ...rest] = entry.split("\t");
    counts.set(rest.join("\t"), [Number(a) || 0, Number(d) || 0]);
  }
  const parts = names.split("\0").filter(Boolean);
  const files: BuildFile[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const code = parts[i]!;
    const path = parts[i + 1]!;
    const [added, deleted] = counts.get(path) ?? [0, 0];
    files.push({
      path,
      status: code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified",
      added,
      deleted,
    });
  }
  return files;
}

/** The patch of one file in the build (for the preview). */
export async function fileDiff(dir: string, path: string): Promise<string> {
  const base = (await run(dir, ["merge-base", "HEAD", "main"])).trim();
  return run(dir, ["diff", "-U100000", base, "HEAD", "--", path]);
}

/** Merges the build branch into `main` of the add-ons repo. */
export async function mergeBuild(repo: string, branch: string, message: string): Promise<void> {
  const ff = await git(repo, ["merge", "--ff-only", "-q", branch]);
  if (ff.code === 0) return;
  await run(repo, [...IDENTITY, "merge", "--no-ff", "-q", "-m", message, branch]);
}

export async function removeWorktree(repo: string, dir: string, branch: string): Promise<void> {
  await git(repo, ["worktree", "remove", "--force", dir]);
  await rm(dir, { recursive: true, force: true });
  await git(repo, ["worktree", "prune"]);
  await git(repo, ["branch", "-D", branch]);
}
