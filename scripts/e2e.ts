/**
 * `npm run e2e`: builds when stale, runs Playwright with the given arguments, and after a passing
 * run of the **whole** suite on a clean checkout records the commit in `.jig-e2e-passed.json`, so the
 * release can skip a suite that already passed on the same source (D-272). A failed whole-suite run
 * on a clean checkout records the commit and the specs that failed in `.jig-e2e-failed.json`;
 * `-- --resume` (the release's rerun) then runs only those specs and the ones the commits since need
 * (e2e/affected.json), and records a pass of the whole suite when they pass (D-325).
 * Run with: npm run e2e [-- --resume | <playwright args>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type AffectedRules, selectSpecs } from "./e2e-select.ts";
import { E2E_FAILED, E2E_STAMP, failedSpecFiles, isReleaseFile, rerunSpecs } from "./release-lib.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const windows = process.platform === "win32";
const resume = process.argv.includes("--resume");
const args = process.argv.slice(2).filter((a) => a !== "--resume");
const git = (...a: string[]) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const sh = (cmd: string, a: string[], env: Record<string, string> = {}) =>
  spawnSync(cmd, a, {
    cwd: root,
    stdio: "inherit",
    shell: windows && cmd === "npx",
    env: { ...process.env, ...env },
  }).status ?? 1;

if (sh(process.execPath, ["scripts/build-if-stale.ts"]) !== 0) process.exit(1);
// The source the suite runs on: uncommitted changes make it unknown, so nothing is recorded then.
const clean = git("status", "--porcelain") === "";
const sha = git("rev-parse", "HEAD");
const stamp = join(root, E2E_STAMP);
const failedStamp = join(root, E2E_FAILED);
const report = join(root, "test-results", "e2e-report.json");

/** The specs a rerun needs, when an earlier whole-suite run failed on an ancestor of this commit. */
function resumeSpecs(): "all" | string[] {
  if (!clean || !existsSync(failedStamp)) return "all";
  try {
    const last = JSON.parse(readFileSync(failedStamp, "utf8")) as { sha?: string; specs?: string[] };
    if (!last.sha || !/^[0-9a-f]{40}$/.test(last.sha) || !Array.isArray(last.specs)) return "all";
    git("merge-base", "--is-ancestor", last.sha, "HEAD");
    const changed = git("diff", "--name-only", last.sha, "HEAD")
      .split("\n")
      .filter((path) => !isReleaseFile(path))
      .map((path) => {
        const full = join(root, path);
        return {
          path,
          text: existsSync(full) && /\.(tsx?|jsx?)$/.test(path) ? readFileSync(full, "utf8") : "",
        };
      });
    const rules = JSON.parse(readFileSync(join(root, "e2e/affected.json"), "utf8")) as AffectedRules;
    const specs = readdirSync(join(root, "e2e"))
      .filter((f) => f.endsWith(".spec.ts"))
      .map((name) => ({ name, text: readFileSync(join(root, "e2e", name), "utf8") }));
    const pick = rerunSpecs(last.specs, selectSpecs(changed, specs, rules).specs);
    console.log(
      pick === "all"
        ? `The changes since the failed run on ${last.sha.slice(0, 7)} need the whole suite.`
        : `Rerunning what failed on ${last.sha.slice(0, 7)} and what the changes since need: ${pick.join(", ")}.`,
    );
    return pick;
  } catch {
    return "all";
  }
}

const only = resume ? resumeSpecs() : "all";
// A whole-suite run, or a resumed one standing in for it: its result is recorded.
const recorded = !args.length;
// A run that tests other source (or fails) mustn't leave an older pass behind.
if (recorded) rmSync(stamp, { force: true });
const files = only === "all" ? [] : only.map((s) => `e2e/${s}`);
const status =
  only !== "all" && !files.length
    ? 0
    : sh(
        "npx",
        ["playwright", "test", ...files, ...args, ...(recorded ? ["--reporter=list,json"] : [])],
        recorded ? { PLAYWRIGHT_JSON_OUTPUT_FILE: report } : {},
      );
if (recorded && clean && git("rev-parse", "HEAD") === sha) {
  if (status === 0) {
    writeFileSync(stamp, `${JSON.stringify({ sha, at: new Date().toISOString() }, null, 2)}\n`);
    rmSync(failedStamp, { force: true });
  } else {
    // Every spec that didn't fail passed on this commit (or on the earlier one, unaffected since).
    let specs: string[] = [];
    try {
      specs = failedSpecFiles(JSON.parse(readFileSync(report, "utf8")));
    } catch {}
    // No failed test (an error outside the tests): nothing to narrow down, the next run is whole.
    if (specs.length)
      writeFileSync(
        failedStamp,
        `${JSON.stringify({ sha, specs, at: new Date().toISOString() }, null, 2)}\n`,
      );
    else rmSync(failedStamp, { force: true });
  }
}
process.exit(status);
