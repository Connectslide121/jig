import type { Script } from "../../shared/terminals";

/** Folders discovery never enters (kept in step with `SKIP` in discover.ts), so their churn is ignored. */
const IGNORED = new Set([
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

const FILES = new Set([
  "package.json",
  "host.json",
  "local.settings.json",
  "launchsettings.json",
  "requirements.txt",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "package-lock.json",
  "scripts",
]);

/**
 * Whether a change to `name` (an entry of a watched folder) could change what discovery finds: the
 * files it reads, a script file, or a folder appearing/disappearing (no extension, not skipped). An
 * unknown name (the OS gave none) counts. Editors' temp files and build output don't.
 */
export function isRelevantScriptChange(name: string | null | undefined): boolean {
  if (!name) return true;
  const base = (name.split(/[/]/).pop() ?? "").toLowerCase();
  if (!base || IGNORED.has(base) || base.startsWith(".")) return false;
  if (FILES.has(base)) return true;
  if (/\.(csproj|ps1|sh|cmd|bat)$/.test(base)) return true;
  return !base.includes("."); // a folder coming or going
}

/** A comparable fingerprint of a script list: equal when nothing the view shows or runs changed. */
export function scriptsSignature(scripts: Script[]): string {
  return JSON.stringify(scripts.map((s) => [s.id, s.cwd, s.command, s.detail ?? "", s.url ?? ""]));
}

/** Which folders to watch: all of them up to `max` (shallowest first); `capped` says some are left out. */
export function pickWatchDirs(dirs: string[], max: number): { watch: string[]; capped: boolean } {
  const depth = (d: string) => d.split(/[/]/).length;
  const sorted = [...new Set(dirs)].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return { watch: sorted.slice(0, max), capped: sorted.length > max };
}
