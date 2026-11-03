/**
 * `npm run e2e`: builds when stale, runs Playwright with the given arguments, and after a passing
 * run of the **whole** suite on a clean checkout records the commit in `.jig-e2e-passed.json`, so the
 * release can skip a suite that already passed on the same source (D-272).
 * Run with: npm run e2e [-- <playwright args>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_STAMP } from "./release-lib.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const windows = process.platform === "win32";
const args = process.argv.slice(2);
const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

const sh = (cmd: string, a: string[]) =>
  spawnSync(cmd, a, { cwd: root, stdio: "inherit", shell: windows && cmd === "npx" }).status ?? 1;

if (sh(process.execPath, ["scripts/build-if-stale.ts"]) !== 0) process.exit(1);
// The source the suite runs on: uncommitted changes make it unknown, so nothing is recorded then.
const clean = git("status", "--porcelain") === "";
const sha = git("rev-parse", "HEAD");
const stamp = join(root, E2E_STAMP);
// A run that tests other source (or fails) mustn't leave an older pass behind.
if (!args.length) rmSync(stamp, { force: true });
const status = sh("npx", ["playwright", "test", ...args]);
if (status === 0 && !args.length && clean && git("rev-parse", "HEAD") === sha)
  writeFileSync(stamp, `${JSON.stringify({ sha, at: new Date().toISOString() }, null, 2)}\n`);
process.exit(status);
