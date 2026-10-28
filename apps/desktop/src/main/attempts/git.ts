import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { AttemptChanges, AttemptFile } from "../../shared/attempts";
import { git } from "../addons/repo";

async function run(cwd: string, args: string[]): Promise<string> {
  const r = await git(cwd, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
  return r.stdout;
}

/** The repository's current commit; attempts start from it. */
export async function headCommit(repo: string): Promise<string> {
  const r = await git(repo, ["rev-parse", "--verify", "HEAD"]);
  if (r.code !== 0) throw new Error("The repository has no commits yet: commit once, then try again");
  return r.stdout.trim();
}

/** Whether the working copy has changes (they are not part of the attempts). */
export async function isDirty(repo: string): Promise<boolean> {
  return (await run(repo, ["status", "--porcelain"])).trim().length > 0;
}

export async function addWorktree(repo: string, dir: string, branch: string, base: string): Promise<void> {
  await mkdir(dirname(dir), { recursive: true });
  await run(repo, ["worktree", "add", "-q", "-b", branch, dir, base]);
}

export async function removeWorktree(repo: string, dir: string, branch: string): Promise<void> {
  await git(repo, ["worktree", "remove", "--force", dir]);
  await rm(dir, { recursive: true, force: true });
  await git(repo, ["worktree", "prune"]);
  await git(repo, ["branch", "-D", branch]);
}

/** Stages everything in an attempt's worktree (it's Jig's own copy) so new files count too. */
async function stageAll(worktree: string): Promise<void> {
  await run(worktree, ["add", "-A"]);
}

const STATUS: Record<string, AttemptFile["status"]> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
};

/** What an attempt changed compared with `base`: files with line counts. */
export async function attemptChanges(index: number, worktree: string, base: string): Promise<AttemptChanges> {
  await stageAll(worktree);
  const names = (await run(worktree, ["diff", "--cached", "--no-renames", "--name-status", "-z", base]))
    .split("\0")
    .filter(Boolean);
  const counts = new Map<string, [number, number]>();
  const numstat = (await run(worktree, ["diff", "--cached", "--no-renames", "--numstat", "-z", base]))
    .split("\0")
    .filter(Boolean);
  for (const entry of numstat) {
    const [ins, del, ...rest] = entry.split("\t");
    counts.set(rest.join("\t"), [Number(ins) || 0, Number(del) || 0]);
  }
  const files: AttemptFile[] = [];
  for (let i = 0; i + 1 < names.length; i += 2) {
    const path = names[i + 1]!;
    const [insertions, deletions] = counts.get(path) ?? [0, 0];
    files.push({ path, status: STATUS[names[i]!.charAt(0)] ?? "modified", insertions, deletions });
  }
  return {
    index,
    files,
    insertions: files.reduce((n, f) => n + f.insertions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };
}

/** The diff of an attempt (one file, or all of it), as git prints it. */
export async function attemptDiff(worktree: string, base: string, path?: string): Promise<string> {
  await stageAll(worktree);
  return run(worktree, ["diff", "--cached", "--no-renames", base, ...(path ? ["--", path] : [])]);
}

/**
 * Applies an attempt to the repository's working copy (not committed: you review and commit it as
 * usual). Fails without changing anything when it doesn't apply cleanly.
 */
export async function applyAttempt(repo: string, worktree: string, base: string): Promise<void> {
  await stageAll(worktree);
  const patch = await run(worktree, ["diff", "--cached", "--binary", "--no-renames", base]);
  if (!patch.trim()) throw new Error("This attempt didn't change anything");
  const check = await gitWithInput(repo, ["apply", "--check", "--whitespace=nowarn", "-"], patch);
  if (check.code !== 0)
    throw new Error(
      `It doesn't apply to your working copy (you changed the same files since): ${check.stderr.trim().split("\n")[0]}`,
    );
  const applied = await gitWithInput(repo, ["apply", "--whitespace=nowarn", "-"], patch);
  if (applied.code !== 0) throw new Error(applied.stderr.trim() || "git apply failed");
}

function gitWithInput(cwd: string, args: string[], input: string) {
  return new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (e) => resolve({ code: 1, stderr: e.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.stdin.end(input);
  });
}
