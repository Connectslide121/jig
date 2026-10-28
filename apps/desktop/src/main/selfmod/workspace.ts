import { cp, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { git } from "../addons/repo";

/**
 * Workspaces for level-3 changes: a git worktree of Jig's source repository whose node_modules are
 * linked to the repository's (junctions on Windows — no admin rights needed), and a copy of your Jig
 * home for the preview instance.
 */
const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

async function run(cwd: string, args: string[]) {
  const r = await git(cwd, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
  return r.stdout.trim();
}

/** Is `dir` Jig's source repository (a git repo with apps/desktop and AGENTS.md)? */
export async function isJigRepo(dir: string): Promise<boolean> {
  if (!dir) return false;
  const [desktop, agents] = await Promise.all([
    exists(join(dir, "apps", "desktop", "package.json")),
    exists(join(dir, "AGENTS.md")),
  ]);
  if (!desktop || !agents) return false;
  const r = await git(dir, ["rev-parse", "--show-toplevel"]);
  return r.code === 0;
}

/** Links node_modules folders of the repo into the worktree (a dependency change needs a real install). */
export async function linkNodeModules(repo: string, worktree: string): Promise<void> {
  for (const rel of ["node_modules", join("apps", "desktop", "node_modules")]) {
    const from = join(repo, rel);
    const to = join(worktree, rel);
    if ((await exists(from)) && !(await exists(to)))
      await symlink(from, to, process.platform === "win32" ? "junction" : "dir");
  }
}

export async function unlinkNodeModules(worktree: string): Promise<void> {
  for (const rel of ["node_modules", join("apps", "desktop", "node_modules")]) {
    await rm(join(worktree, rel), { recursive: false, force: true }).catch(() => {});
  }
}

export async function createAppWorktree(repo: string, dir: string, branch: string): Promise<void> {
  await mkdir(join(dir, ".."), { recursive: true });
  await run(repo, ["worktree", "add", "-q", "-b", branch, dir, "HEAD"]);
  await linkNodeModules(repo, dir);
}

/** The commit the worktree started from (recorded when it is created). */
export async function headCommit(dir: string): Promise<string> {
  return run(dir, ["rev-parse", "HEAD"]);
}

export async function commitAll(dir: string, base: string, message: string): Promise<string[]> {
  await run(dir, ["add", "-A", "--", ".", ":!node_modules", ":!apps/desktop/node_modules"]);
  const staged = await git(dir, ["diff", "--cached", "--quiet"]);
  if (staged.code !== 0)
    await run(dir, [
      "-c",
      "user.name=Jig builder",
      "-c",
      "user.email=jig@localhost",
      "commit",
      "-q",
      "-m",
      message,
    ]);
  return changedPaths(dir, base);
}

export async function changedPaths(dir: string, base: string): Promise<string[]> {
  const out = await run(dir, ["diff", "--name-only", base, "HEAD"]);
  return out.split("\n").filter(Boolean);
}

export async function fileDiff(dir: string, base: string, path: string): Promise<string> {
  return run(dir, ["diff", base, "HEAD", "--", path]);
}

/** True when the change touches dependencies (the linked node_modules can't be used then). */
export function needsInstall(paths: string[]): boolean {
  return paths.some((p) => /(^|\/)package(-lock)?\.json$/.test(p.replaceAll("\\", "/")));
}

/** Your Jig home for the preview instance, without builds, caches, logs and activity. */
export async function copyHome(home: string, target: string): Promise<void> {
  const skip = new Set(["work", "cache", "logs", "activity", "launcher", "app-builds"]);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(home).catch(() => [] as string[])) {
    if (skip.has(entry)) continue;
    await cp(join(home, entry), join(target, entry), { recursive: true });
  }
}

/** Merges the change into the repository's current branch; refuses when you have uncommitted work there. */
export async function mergeIntoRepo(repo: string, branch: string, message: string): Promise<string> {
  const dirty = (await run(repo, ["status", "--porcelain", "--untracked-files=no"])).trim();
  if (dirty) throw new Error(`${repo} has uncommitted changes. Commit or stash them, then accept again.`);
  await run(repo, [
    "-c",
    "user.name=Jig builder",
    "-c",
    "user.email=jig@localhost",
    "merge",
    "--no-ff",
    "-q",
    "-m",
    message,
    branch,
  ]);
  return run(repo, ["rev-parse", "HEAD"]);
}

export async function removeAppWorktree(repo: string, dir: string, branch: string): Promise<void> {
  await unlinkNodeModules(dir);
  await git(repo, ["worktree", "remove", "--force", dir]);
  await rm(dir, { recursive: true, force: true });
  await git(repo, ["worktree", "prune"]);
  await git(repo, ["branch", "-D", branch]);
}

/** Undo an accepted change: revert its merge commit (recorded as a new commit). */
export async function revertMerge(repo: string, commit: string): Promise<void> {
  await run(repo, [
    "-c",
    "user.name=Jig builder",
    "-c",
    "user.email=jig@localhost",
    "revert",
    "--no-edit",
    "-m",
    "1",
    commit,
  ]);
}
