/**
 * Builds apps/desktop only when its inputs changed since the last build (e2e runs). The stamp is a hash
 * of every input's path, size and modification time, written into dist after a successful build.
 * Run with: node scripts/build-if-stale.ts [--force]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const INPUTS = [
  "apps/desktop/src",
  "apps/desktop/scripts",
  "apps/desktop/vite.config.ts",
  "apps/desktop/package.json",
  "packages",
  "addons",
  "package-lock.json",
];
const stampFile = join(root, "apps/desktop/dist/.build-stamp");

export function inputsStamp(): string {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...INPUTS],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split("\n")
    .filter((f) => f && !/\.test\.tsx?$/.test(f))
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    try {
      const s = statSync(join(root, file));
      hash.update(`${file}\0${s.size}\0${s.mtimeMs}\n`);
    } catch {
      hash.update(`${file}\0deleted\n`);
    }
  }
  return hash.digest("hex");
}

export function buildIfStale(force = false): boolean {
  const stamp = inputsStamp();
  if (!force && existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp) {
    console.log("Build is up to date (apps/desktop/dist).");
    return false;
  }
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  writeFileSync(stampFile, stamp);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  buildIfStale(process.argv.includes("--force"));
