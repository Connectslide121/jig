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

/** Commits what the builder changed in the worktree; returns the changed files (since `base`). */
export async function commitWorktree(dir: string, message: string, base?: string): Promise<BuildFile[]> {
  await commitAll(dir, message);
  return changedFiles(dir, base);
}

/** Commits everything in the worktree (no-op when nothing changed); returns the commit. */
export async function commitAll(dir: string, message: string): Promise<string> {
  await run(dir, ["add", "-A"]);
  const staged = await git(dir, ["diff", "--cached", "--quiet"]);
  if (staged.code !== 0) await run(dir, [...IDENTITY, "commit", "-q", "-m", message]);
  return (await run(dir, ["rev-parse", "HEAD"])).trim();
}

/** Where the build's changes start: `base`, else where its branch left `main`. */
async function startOf(dir: string, base?: string): Promise<string> {
  return base || (await run(dir, ["merge-base", "HEAD", "main"]).catch(() => "")).trim() || "HEAD~0";
}

/** Files that differ between `base` (or where the worktree's branch started) and now. */
export async function changedFiles(dir: string, base?: string): Promise<BuildFile[]> {
  const from = await startOf(dir, base);
  const [names, numstat] = await Promise.all([
    run(dir, ["diff", "--no-renames", "--name-status", "-z", from, "HEAD"]),
    run(dir, ["diff", "--no-renames", "--numstat", "-z", from, "HEAD"]),
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
export async function fileDiff(dir: string, path: string, base?: string): Promise<string> {
  return run(dir, ["diff", "-U100000", await startOf(dir, base), "HEAD", "--", path]);
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
