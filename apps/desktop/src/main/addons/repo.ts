import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AddonCommit } from "../../shared/addons";
import { logger } from "../log";

const log = logger("addons");

/**
 * `~/.jig/addons` is a git repository: every accepted change is a commit, so any add-on can be rolled
 * back. Uses your own `git`. If git isn't installed, add-ons still work, without history.
 */
export function git(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-c", "core.quotepath=off", "-c", "core.autocrlf=false", ...args],
      { cwd, windowsHide: true, timeout: 60_000, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout: String(stdout),
          stderr: String(stderr) || (error?.code === "ENOENT" ? "git is not installed" : ""),
        }),
    );
  });
}

const IDENTITY = ["-c", "user.name=Jig", "-c", "user.email=jig@localhost"];

export async function ensureRepo(dir: string): Promise<boolean> {
  await mkdir(dir, { recursive: true });
  const status = await git(dir, ["rev-parse", "--is-inside-work-tree"]);
  if (status.code === 0 && status.stdout.trim() === "true") {
    const top = await git(dir, ["rev-parse", "--show-toplevel"]);
    // Only use the repo if ~/.jig/addons is its root (not some parent repo the folder happens to be in).
    if (normalize(top.stdout.trim()) === normalize(dir)) return true;
  }
  const init = await git(dir, ["init", "-q", "-b", "main"]);
  if (init.code !== 0) {
    log.warn(`Add-on history disabled: ${init.stderr.trim()}`);
    return false;
  }
  await writeFile(join(dir, ".gitignore"), "node_modules/\n.DS_Store\n");
  await writeFile(
    join(dir, "README.md"),
    "# Your Jig add-ons\n\nEach folder is an add-on (see docs/guides/writing-addons.md in Jig's repository).\nEvery change Jig makes here is a commit, so you can roll back from Settings → Add-ons.\n",
  );
  await git(dir, ["add", "-A"]);
  await git(dir, [...IDENTITY, "commit", "-q", "-m", "Start add-on history"]);
  return true;
}

const normalize = (p: string) => p.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();

/** Commits everything (or one folder) with a message; no-op when nothing changed. */
export async function commitAll(dir: string, message: string, path = "."): Promise<string | undefined> {
  await git(dir, ["add", "-A", "--", path]);
  const diff = await git(dir, ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return undefined;
  const result = await git(dir, [...IDENTITY, "commit", "-q", "-m", message]);
  if (result.code !== 0) {
    log.warn("Commit failed", result.stderr);
    return undefined;
  }
  return (await git(dir, ["rev-parse", "HEAD"])).stdout.trim();
}

export async function history(dir: string, path: string): Promise<AddonCommit[]> {
  const result = await git(dir, ["log", "--format=%H%x1f%aI%x1f%s", "-n", "50", "--", path]);
  if (result.code !== 0) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date, message] = line.split("\x1f");
      return { hash: hash!, date: date!, message: message ?? "" };
    });
}

/** Restores `path` to how it was in `commit` and records that as a new commit. */
export async function rollback(dir: string, path: string, commit: string): Promise<string | undefined> {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error("Invalid commit");
  // Remove the tracked files first, so files added after `commit` disappear.
  await git(dir, ["rm", "-r", "-q", "--ignore-unmatch", "--", path]);
  const restore = await git(dir, ["checkout", commit, "--", path]);
  if (restore.code !== 0) throw new Error(restore.stderr.trim() || "Rollback failed");
  return commitAll(dir, `Roll back ${path} to ${commit.slice(0, 7)}`, path);
}
