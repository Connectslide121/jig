/**
 * Runs only the e2e specs your change needs: uncommitted files plus commits not yet pushed (or since
 * `--since <ref>`), mapped by e2e/affected.json and the data-testids changed views render.
 * Builds first only when the build is stale. `--list` prints the choice without running.
 * Run with: npm run e2e:changed [-- --since <ref>] [-- --list]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIfStale } from "./build-if-stale.ts";
import { type AffectedRules, selectSpecs } from "./e2e-select.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const git = (...a: string[]) => {
  try {
    return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

const since = args.includes("--since")
  ? args[args.indexOf("--since") + 1]
  : git("rev-parse", "--abbrev-ref", "@{upstream}").trim();
const paths = new Set<string>();
for (const line of git("status", "--porcelain", "--untracked-files=all").split("\n")) {
  if (!line.trim()) continue;
  // "R  old -> new": the new path.
  paths.add(line.slice(3).split(" -> ").pop()!.replace(/^"|"$/g, ""));
}
if (since) for (const f of git("diff", "--name-only", `${since}...HEAD`).split("\n")) if (f) paths.add(f);

const changed = [...paths].map((path) => {
  const full = join(root, path);
  return { path, text: existsSync(full) && /\.(tsx?|jsx?)$/.test(path) ? readFileSync(full, "utf8") : "" };
});
const rules = JSON.parse(readFileSync(join(root, "e2e/affected.json"), "utf8")) as AffectedRules;
const specs = readdirSync(join(root, "e2e"))
  .filter((f) => f.endsWith(".spec.ts"))
  .map((name) => ({ name, text: readFileSync(join(root, "e2e", name), "utf8") }));
const pick = selectSpecs(changed, specs, rules);

console.log(
  `${changed.length} changed file(s)${since ? ` (uncommitted + since ${since})` : " (uncommitted)"}.`,
);
if (pick.specs !== "all" && pick.specs.length === 0) {
  console.log("No e2e specs needed for these changes.");
  process.exit(0);
}
if (pick.specs === "all") console.log(`Whole suite: ${pick.reasons.all?.join(", ")} affects every test.`);
else
  for (const spec of pick.specs)
    console.log(`  ${spec.padEnd(28)} ${pick.reasons[spec]!.slice(0, 3).join(", ")}`);
if (pick.unmapped.length)
  console.log(`No rule in e2e/affected.json for: ${pick.unmapped.join(", ")} (ran the fallback specs).`);
if (args.includes("--list")) process.exit(0);

buildIfStale();
const files = pick.specs === "all" ? [] : pick.specs.map((s) => `e2e/${s}`);
const run = spawnSync("npx", ["playwright", "test", ...files], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(run.status ?? 1);
