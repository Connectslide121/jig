import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Script, ScriptKind } from "../../shared/terminals";

/**
 * Finds the things you start in a project, per folder: `package.json` scripts (npm / pnpm / yarn /
 * bun from the lockfile), `*.ps1` / `*.sh` / `*.cmd` in the root and `scripts/`, .NET projects
 * (`dotnet run` / `dotnet watch`) and Azure Functions apps (`func start`). Reads files only.
 */
const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "bin",
  "obj",
  ".next",
  ".venv",
  "venv",
  "target",
  "coverage",
  ".jig",
]);
const MAX_DEPTH = 3;

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function packageRunner(dir: string, root: string): Promise<string> {
  for (let d = dir; ; ) {
    if (await exists(join(d, "pnpm-lock.yaml"))) return "pnpm";
    if (await exists(join(d, "yarn.lock"))) return "yarn";
    if ((await exists(join(d, "bun.lockb"))) || (await exists(join(d, "bun.lock")))) return "bun run";
    if (await exists(join(d, "package-lock.json"))) return "npm run";
    if (d === root) return "npm run";
    const parent = join(d, "..");
    if (parent === d || !parent.startsWith(root)) return "npm run";
    d = parent;
  }
}

const slash = (p: string) => p.replaceAll("\\", "/");

function script(
  kind: ScriptKind,
  root: string,
  cwd: string,
  name: string,
  command: string,
  detail?: string,
): Script {
  const folder = slash(relative(root, cwd));
  return { id: `${kind}:${folder}:${name}`, name, kind, folder, cwd, command, detail };
}

/**
 * A git worktree's `.git` is a file pointing into the main repository's `worktrees/` folder
 * (`gitdir: …/.git/worktrees/C1`); a submodule's points into `modules/` instead.
 */
export function isWorktreeGitFile(content: string): boolean {
  return /^gitdir:.*[\\/]worktrees[\\/][^\\/]+\s*$/m.test(content);
}

async function isWorktree(dir: string): Promise<boolean> {
  const content = await readFile(join(dir, ".git"), "utf8").catch(() => "");
  return isWorktreeGitFile(content);
}

async function scan(root: string, dir: string, depth: number, out: Script[], platform: string) {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  // Worktrees inside a folder repeat their repository's scripts (D-127); one you open as its own
  // project (the root) still shows them.
  if (dir !== root && files.has(".git") && (await isWorktree(dir))) return;

  if (files.has("package.json")) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      const runner = await packageRunner(dir, root);
      for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
        if (typeof body !== "string" || /^(pre|post)/.test(name)) continue;
        out.push(script("npm", root, dir, name, `${runner} ${name}`, body));
      }
    } catch {
      // Not valid JSON: skip.
    }
  }

  const isAzureFunctions =
    files.has("host.json") &&
    (files.has("local.settings.json") ||
      [...files].some((f) => f.endsWith(".csproj")) ||
      files.has("package.json") ||
      files.has("requirements.txt"));
  if (isAzureFunctions) out.push(script("func", root, dir, "func start", "func start"));

  for (const file of [...files].sort()) {
    if (file.endsWith(".csproj") && !/\.Tests?\.csproj$/i.test(file)) {
      const name = file.replace(/\.csproj$/i, "");
      if (!isAzureFunctions) {
        out.push(script("dotnet-run", root, dir, `${name}: run`, `dotnet run --project "${file}"`));
        out.push(script("dotnet-watch", root, dir, `${name}: watch`, `dotnet watch --project "${file}" run`));
      }
    }
  }

  const rel = slash(relative(root, dir));
  const scriptFolder = rel === "" || /(^|\/)scripts$/.test(rel);
  if (scriptFolder) {
    for (const file of [...files].sort()) {
      if (file.endsWith(".ps1"))
        out.push(
          script("ps1", root, dir, file, platform === "win32" ? `& ".\\${file}"` : `pwsh -File "./${file}"`),
        );
      else if (file.endsWith(".sh")) out.push(script("sh", root, dir, file, `bash "./${file}"`));
      else if (platform === "win32" && /\.(cmd|bat)$/i.test(file))
        out.push(script("cmd", root, dir, file, `.\\${file}`));
    }
  }

  if (depth >= MAX_DEPTH) return;
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith(".")) {
      await scan(root, join(dir, entry.name), depth + 1, out, platform);
    }
  }
}

/**
 * Scripts of a project folder. For a workspace, `repos` are its repositories: each is searched from its
 * own root too, so scripts deep inside a repository (`client-a/api/src/functions`) are found. Git
 * worktrees inside the folder are left out: they'd repeat their repository's scripts.
 */
export async function discoverScripts(
  root: string,
  platform = process.platform,
  repos: string[] = [],
): Promise<Script[]> {
  const out: Script[] = [];
  await scan(root, root, 0, out, platform);
  for (const repo of repos)
    if (repo === root || !(await isWorktree(repo))) await scan(root, repo, 0, out, platform);
  const unique = [...new Map(out.map((s) => [s.id, s])).values()];
  return unique.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
}
