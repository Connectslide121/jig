/**
 * Runs only the e2e specs your change needs: the files that differ from the source the last passing
 * e2e:changed or whole-suite run tested (uncommitted ones included), or from HEAD when nothing passed
 * yet, or from `--since <ref>` (e.g. origin/main, the old behaviour), mapped by e2e/affected.json and
 * the data-testids changed views render (D-357). A passing run records the working tree it tested in
 * `.jig-e2e-changed.json` (ignored by git). Builds first only when the build is stale.
 * `--list` prints the choice without running (and records nothing).
 * Run with: npm run e2e:changed [-- --since <ref>] [-- --list]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIfStale } from "./build-if-stale.ts";
import { type AffectedRules, chooseBase, type E2ePass, selectSpecs } from "./e2e-select.ts";
import { E2E_STAMP } from "./release-lib.ts";

/** Where a passing e2e:changed run records the working-tree snapshot it tested. */
const E2E_CHANGED = ".jig-e2e-changed.json";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const git = (a: string[], env: Record<string, string> = {}) => {
  try {
    return execFileSync("git", a, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, ...env },
    }).trim();
  } catch {
    return "";
  }
};

/** The working tree as a git tree object (untracked files included, ignored ones not), via a scratch index. */
function snapshot(): string {
  const index = join(tmpdir(), `jig-e2e-index-${process.pid}`);
  const real = resolve(root, git(["rev-parse", "--git-path", "index"]));
  try {
    // Starting from the real index lets git skip unchanged files.
    if (existsSync(real)) copyFileSync(real, index);
    git(["add", "-A"], { GIT_INDEX_FILE: index });
    return git(["write-tree"], { GIT_INDEX_FILE: index });
  } finally {
    rmSync(index, { force: true });
  }
}

const readPass = (file: string, by: E2ePass["by"], key: "sha" | "tree"): E2ePass | undefined => {
  try {
    const json = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>;
    const ref = json[key];
    return typeof ref === "string" && /^[0-9a-f]{40,64}$/.test(ref) && typeof json.at === "string"
      ? { ref, at: json.at, by }
      : undefined;
  } catch {
    return undefined;
  }
};

const sinceArg = args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined;
const base = chooseBase(
  sinceArg,
  [readPass(E2E_STAMP, "e2e", "sha"), readPass(E2E_CHANGED, "e2e:changed", "tree")],
  (ref) => git(["cat-file", "-t", `${ref}^{tree}`]) === "tree",
);
// --since compares from where HEAD left that ref, like `git diff <ref>...HEAD`.
const from = base.kind === "since" ? git(["merge-base", base.ref, "HEAD"]) : base.ref;
if (!from) {
  console.error(`Unknown ref for --since: ${base.ref}`);
  process.exit(1);
}
const tree = snapshot();
const paths = git(["diff", "--name-only", "--no-renames", from, tree]).split("\n").filter(Boolean);

const changed = paths.map((path) => {
  const full = join(root, path);
  return { path, text: existsSync(full) && /\.(tsx?|jsx?)$/.test(path) ? readFileSync(full, "utf8") : "" };
});
const rules = JSON.parse(readFileSync(join(root, "e2e/affected.json"), "utf8")) as AffectedRules;
const specs = readdirSync(join(root, "e2e"))
  .filter((f) => f.endsWith(".spec.ts"))
  .map((name) => ({ name, text: readFileSync(join(root, "e2e", name), "utf8") }));
const pick = selectSpecs(changed, specs, rules);

const commit = (ref: string) => git(["log", "-1", "--format=%h %s", ref]) || ref.slice(0, 7);
const at = (iso: string) => new Date(iso).toLocaleString();
console.log(
  base.kind === "since"
    ? `Base: --since ${base.ref} (${commit(from)}), plus uncommitted changes.`
    : base.kind === "head"
      ? "Base: HEAD, no passing run recorded: uncommitted changes only."
      : base.by === "e2e"
        ? `Base: the whole suite that passed on ${commit(base.ref)} (${at(base.at)}).`
        : `Base: the source the last passing e2e:changed tested (${at(base.at)}).`,
);
console.log(`${changed.length} changed file(s).`);

const record = () =>
  writeFileSync(
    join(root, E2E_CHANGED),
    `${JSON.stringify({ tree, head: git(["rev-parse", "HEAD"]), at: new Date().toISOString() }, null, 2)}\n`,
  );
const list = args.includes("--list");

if (pick.specs !== "all" && pick.specs.length === 0) {
  console.log("No e2e specs needed for these changes.");
  if (!list) record();
  process.exit(0);
}
if (pick.specs === "all") console.log(`Whole suite: ${pick.reasons.all?.join(", ")} affects every test.`);
else
  for (const spec of pick.specs)
    console.log(`  ${spec.padEnd(28)} ${pick.reasons[spec]!.slice(0, 3).join(", ")}`);
if (pick.unmapped.length)
  console.log(`No rule in e2e/affected.json for: ${pick.unmapped.join(", ")} (ran the fallback specs).`);
if (list) process.exit(0);

buildIfStale();
const files = pick.specs === "all" ? [] : pick.specs.map((s) => `e2e/${s}`);
const run = spawnSync("npx", ["playwright", "test", ...files], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (run.status === 0) record();
process.exit(run.status ?? 1);
