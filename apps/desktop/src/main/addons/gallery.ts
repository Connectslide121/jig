import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { GalleryAddon, GallerySource } from "../../shared/addons";
import { type AddonRecord, scanDir } from "./catalog";

/**
 * The add-on gallery (D-179): add-ons to browse and install from sources you add in Settings — a git
 * repository (cloned with your own git and credentials, into Jig's cache) or a folder. A source holds
 * add-on folders at its top level or under `addons/`. Nothing runs from a gallery: installing goes
 * through the same package checks as importing a `.zip`, after you've seen the add-on's permissions.
 */

/** A git URL Jig may clone: https, ssh, or `git@host:path`. */
export const isGitSource = (source: string) => /^(https:\/\/|ssh:\/\/|git@[\w.-]+:)/i.test(source.trim());

/** Why a source can't be used (only git over https/ssh or an absolute folder), or undefined. */
export function sourceProblem(source: string): string | undefined {
  const s = source.trim();
  if (!s) return "Give a git URL or a folder";
  if (s.startsWith("-") || s.includes("::")) return "Not a git URL or a folder";
  if (isGitSource(s)) return undefined;
  if (/^[a-z][\w+.-]*:\/\//i.test(s)) return "Only https:// and ssh:// git URLs";
  return isAbsolute(s) ? undefined : "A folder must be a full path";
}

/** Where a git source is cloned: one folder per URL. */
export const cacheDirFor = (cacheRoot: string, source: string) =>
  join(cacheRoot, "galleries", createHash("sha1").update(source.trim()).digest("hex").slice(0, 16));

function gitRun(args: string[], cwd?: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        windowsHide: true,
        timeout: 120_000,
        // Never prompt (no terminal to answer in), and only the transports a gallery may use.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "https:ssh" },
      },
      (error, _stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stderr:
            String(stderr) || (error?.code === "ENOENT" ? "git is not installed" : (error?.message ?? "")),
        }),
    );
  });
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The folder to read a source from: a git source is cloned once and updated when `refresh` asks. */
export async function sourceFolder(source: string, cacheRoot: string, refresh = false): Promise<string> {
  const problem = sourceProblem(source);
  if (problem) throw new Error(problem);
  const s = source.trim();
  if (!isGitSource(s)) {
    if (!(await exists(s))) throw new Error("The folder doesn't exist");
    return s;
  }
  const dir = cacheDirFor(cacheRoot, s);
  if (await exists(join(dir, ".git"))) {
    if (!refresh) return dir;
    const fetched = await gitRun(["fetch", "-q", "--depth", "1", "origin"], dir);
    if (fetched.code !== 0) throw new Error(fetched.stderr.trim() || "git fetch failed");
    const reset = await gitRun(["reset", "-q", "--hard", "FETCH_HEAD"], dir);
    if (reset.code !== 0) throw new Error(reset.stderr.trim() || "git reset failed");
    return dir;
  }
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(cacheRoot, "galleries"), { recursive: true });
  const cloned = await gitRun(["clone", "-q", "--depth", "1", "--", s, dir]);
  if (cloned.code !== 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(cloned.stderr.trim() || "git clone failed");
  }
  return dir;
}

/** The add-on folders of a source: at its top level and under `addons/`. */
export async function galleryRecords(folder: string): Promise<AddonRecord[]> {
  const found = [...(await scanDir(folder, "user")), ...(await scanDir(join(folder, "addons"), "user"))];
  const seen = new Set<string>();
  return found.filter((r) => r.manifest && !seen.has(r.id) && seen.add(r.id));
}

/** A gallery entry, with the version you have of it (yours, or the built-in one). */
export function galleryEntry(
  record: AddonRecord,
  installed: Array<{ id: string; source: "builtin" | "user"; version?: string }>,
): GalleryAddon {
  const mine = installed.find((a) => a.id === record.id);
  const m = record.manifest!;
  return {
    id: record.id,
    name: m.name,
    version: m.version,
    description: m.description,
    icon: m.icon,
    permissions: m.permissions ?? [],
    errors: record.errors,
    installed: mine ? { source: mine.source, version: mine.version } : undefined,
  };
}

/** Every source with its add-ons (or what went wrong reading it). */
export async function readGallery(
  sources: string[],
  cacheRoot: string,
  installed: Array<{ id: string; source: "builtin" | "user"; version?: string }>,
  refresh = false,
): Promise<GallerySource[]> {
  return Promise.all(
    sources.map(async (source) => {
      try {
        const records = await galleryRecords(await sourceFolder(source, cacheRoot, refresh));
        return { source, addons: records.map((r) => galleryEntry(r, installed)) };
      } catch (error) {
        return { source, error: (error as Error).message, addons: [] };
      }
    }),
  );
}
