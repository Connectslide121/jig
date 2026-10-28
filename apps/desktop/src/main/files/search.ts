import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { fuzzyFilter } from "../../shared/fuzzy";

const run = promisify(execFile);

/** Folders never worth mentioning (build output, dependencies, caches). */
const SKIP = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "bin",
  "obj",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "coverage",
  ".turbo",
  ".cache",
  ".idea",
  ".vs",
]);
const MAX_FILES = 30_000;
const CACHE_MS = 20_000;

const cache = new Map<string, { at: number; files: Promise<string[]> }>();

/** A repository's files as git sees them (tracked and new, without ignored ones), relative to it. */
async function gitFiles(repo: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await run("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: repo,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.split("\n").filter(Boolean);
  } catch {
    return undefined;
  }
}

/**
 * The files under `root`, relative and with `/` separators: git's list inside repositories (so
 * .gitignore applies), a walk elsewhere that skips dependency and build folders. A workspace (a folder
 * of repositories) gets each repository's list.
 */
export async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= MAX_FILES || depth > 8) return;
    const inRepo = await stat(join(dir, ".git")).then(
      () => true,
      () => false,
    );
    if (inRepo) {
      const files = await gitFiles(dir);
      if (files) {
        const prefix = relative(root, dir).replaceAll("\\", "/");
        for (const f of files.slice(0, MAX_FILES - out.length)) out.push(prefix ? `${prefix}/${f}` : f);
        return;
      }
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) await walk(join(dir, e.name), depth + 1);
      } else if (e.isFile()) out.push(relative(root, join(dir, e.name)).replaceAll("\\", "/"));
    }
  };
  await walk(root, 0);
  return out;
}

/** Files and folders under `root` matching `query` (fuzzy), best first. Folders end with `/`. */
export async function searchFiles(root: string, query: string, limit = 50): Promise<string[]> {
  let entry = cache.get(root);
  if (!entry || Date.now() - entry.at > CACHE_MS) {
    entry = { at: Date.now(), files: listFiles(root) };
    cache.set(root, entry);
  }
  const files = await entry.files;
  const folders = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) folders.add(`${parts.slice(0, i).join("/")}/`);
  }
  return fuzzyFilter([...files, ...folders], query.replace(/^@/, ""), (f) => f, limit);
}
