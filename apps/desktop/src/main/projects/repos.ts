import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ProjectRepo } from "../../shared/projects";

/** Folders never searched for repositories. */
const SKIP = new Set(["node_modules", "bin", "obj", "dist", "build", "out", "target", "vendor"]);

/** How deep under a workspace folder Jig looks for repositories (`repos/api`, `repos/client-a/api`). */
export const REPO_SCAN_DEPTH = 2;

const isRepo = (dir: string) =>
  stat(join(dir, ".git")).then(
    () => true,
    () => false,
  );

/**
 * The git repositories inside a folder that isn't one itself (a "workspace", D-075): searched
 * `maxDepth` levels down, not inside a repository, skipping hidden and build folders. Sorted by path.
 */
export async function findRepos(root: string, maxDepth = REPO_SCAN_DEPTH): Promise<ProjectRepo[]> {
  const out: ProjectRepo[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name));
    await Promise.all(
      folders.map(async (entry) => {
        const path = join(dir, entry.name);
        if (await isRepo(path)) out.push({ path, name: relative(root, path).replaceAll("\\", "/") });
        else if (depth + 1 < maxDepth) await walk(path, depth + 1);
      }),
    );
  };
  await walk(root, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
