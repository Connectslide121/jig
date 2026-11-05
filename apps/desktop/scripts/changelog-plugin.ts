import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** One published version's notes, as the What's new tab shows them. */
export interface ChangelogEntry {
  version: string;
  /** The day it was released (YYYY-MM-DD); null when git knows neither its tag nor its notes. */
  date: string | null;
  notes: string;
}

const ID = "virtual:jig-changelog";
const RESOLVED = `\0${ID}`;
const FILE = /^jig-(\d+\.\d+\.\d+)-notes\.md$/;

function newerFirst(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i]! - pa[i]!;
  return 0;
}

function gitDay(repo: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", ...args], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Its tag's day; before the tag exists (the installer is built first), the release commit's. */
function releaseDate(repo: string, version: string): string | null {
  return gitDay(repo, [`v${version}`]) ?? gitDay(repo, ["--", `release/jig-${version}-notes.md`]);
}

/** Reads `release/jig-<version>-notes.md` (what each GitHub release says) into the app at build time. */
export function readChangelog(repo: string): ChangelogEntry[] {
  const dir = join(repo, "release");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => FILE.exec(name)?.[1])
    .filter((v): v is string => !!v)
    .sort(newerFirst)
    .map((version) => ({
      version,
      date: releaseDate(repo, version),
      notes: readFileSync(join(dir, `jig-${version}-notes.md`), "utf8").trim(),
    }));
}

/** `import changelog from "virtual:jig-changelog"`: Jig's release notes, newest first (D-393). */
export function changelogPlugin(repo: string): Plugin {
  return {
    name: "jig-changelog",
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined;
      this.addWatchFile(join(repo, "release"));
      return `export default ${JSON.stringify(readChangelog(repo))};`;
    },
  };
}
