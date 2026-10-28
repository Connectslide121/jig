import { type FSWatcher, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import { changeMatters, type Entry, type FileState, hiddenEntry, parseStatus, sortEntries } from "./lib/tree";

/** Runs the user's git: argument arrays, no prompts, no index writes (so watching never loops). */
async function git(api: AddonHostApi, cwd: string, args: string[], input?: string) {
  return api.exec("git", ["-c", "core.quotepath=off", "--no-pager", ...args], {
    cwd,
    timeoutMs: 30_000,
    env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C.UTF-8" },
    input,
  });
}

/** A folder's entries: folders first, git's own folder left out, ignored ones marked. */
export async function list({ dir }: { dir: string }, api: AddonHostApi): Promise<Entry[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const entries: Entry[] = [];
  for (const d of dirents) {
    if (hiddenEntry(d.name)) continue;
    const path = join(dir, d.name);
    let isDir = d.isDirectory();
    if (d.isSymbolicLink()) isDir = Boolean((await stat(path).catch(() => undefined))?.isDirectory());
    entries.push({ name: d.name, path, dir: isDir });
  }
  // Ignored entries (node_modules, build output…) are dimmed; outside a repository nothing is.
  if (entries.length) {
    const r = await git(api, dir, ["check-ignore", "-z", "--stdin"], entries.map((e) => e.path).join("\0"));
    if (r.code === 0) {
      const ignored = new Set(r.stdout.split("\0").filter(Boolean));
      for (const e of entries) if (ignored.has(e.path)) e.ignored = true;
    }
  }
  return sortEntries(entries);
}

/** Git state of the files under `root`: of the repository it is in, or of `repos` inside it. */
export async function status(
  { root, repos }: { root: string; repos?: string[] },
  api: AddonHostApi,
): Promise<Record<string, FileState>> {
  const top = await git(api, root, ["rev-parse", "--show-toplevel"]);
  const tops = top.code === 0 ? [root] : (repos ?? []);
  const result: Record<string, FileState> = {};
  await Promise.all(
    tops.map(async (cwd) => {
      const r = await git(api, cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
      if (r.code !== 0) return;
      // Paths are relative to the repository's top; `--show-toplevel` gives it with forward slashes.
      const t = await git(api, cwd, ["rev-parse", "--show-toplevel"]);
      const repoTop = t.code === 0 ? t.stdout.trim().split("/").join(sep) : cwd;
      Object.assign(result, parseStatus(r.stdout, repoTop));
    }),
  );
  return result;
}

/** Every file under `root` (relative, forward slashes) for the filter: git's list where it can, else a walk. */
export async function files(
  { root, repos }: { root: string; repos?: string[] },
  api: AddonHostApi,
): Promise<string[]> {
  const fromGit = async (cwd: string) => {
    const r = await git(api, cwd, ["ls-files", "-co", "--exclude-standard", "-z"]);
    if (r.code !== 0) return undefined;
    const prefix = relative(root, cwd).split(sep).join("/");
    return r.stdout
      .split("\0")
      .filter(Boolean)
      .map((p) => (prefix ? `${prefix}/${p}` : p));
  };
  const own = await fromGit(root);
  if (own) return own.slice(0, 50_000);
  const out: string[] = [];
  for (const repo of repos ?? []) {
    out.push(...((await fromGit(repo)) ?? []));
    if (out.length > 50_000) break;
  }
  return out.slice(0, 50_000);
}

// ------------------------------------------------------------------------------------------------
// Live refresh: one recursive watch per shown folder where the system does that cheaply (Windows,
// macOS); a change tells the UI which folder changed, at most once a second. Elsewhere the view
// looks again every few seconds while visible.

type FolderWatch = { users: number; watcher?: FSWatcher; timer?: NodeJS.Timeout; last: number };
const watches = new Map<string, FolderWatch>();

export function watchFolder({ root }: { root: string }, api: AddonHostApi): { live: boolean } {
  const existing = watches.get(root);
  if (existing) {
    existing.users++;
    return { live: Boolean(existing.watcher) };
  }
  const entry: FolderWatch = { users: 1, last: 0 };
  watches.set(root, entry);
  if (process.platform === "win32" || process.platform === "darwin") {
    try {
      entry.watcher = watch(root, { recursive: true }, (_e, file) => {
        if (file && !changeMatters(String(file))) return;
        if (entry.timer) return;
        const wait = Math.max(300, 1000 - (Date.now() - entry.last));
        entry.timer = setTimeout(() => {
          entry.timer = undefined;
          entry.last = Date.now();
          api.emit("changed", { root });
        }, wait);
      });
      entry.watcher.on("error", () => entry.watcher?.close());
    } catch {
      entry.watcher = undefined;
    }
  }
  return { live: Boolean(entry.watcher) };
}

export function unwatchFolder({ root }: { root: string }) {
  const entry = watches.get(root);
  if (!entry || --entry.users > 0) return;
  entry.watcher?.close();
  clearTimeout(entry.timer);
  watches.delete(root);
}

export async function openInCode({ path }: { path: string }, api: AddonHostApi) {
  const r = await api.exec("code", [path], { timeoutMs: 20_000 });
  if (r.code === 127)
    throw new Error(
      "VS Code's `code` command was not found. In VS Code: Command Palette → \"Shell Command: Install 'code' command in PATH\".",
    );
  if (r.code !== 0) throw new Error(r.stderr.trim() || "VS Code could not be opened");
}
