/**
 * `npm run verify` and `npm run typecheck`, fast (D-421). Every check runs at once; each TypeScript project
 * type-checks incrementally from its own build info in .cache/tsc (git-ignored), and a project whose inputs
 * haven't changed since its last pass is skipped (scripts/verify-lib.ts says when). Same checks and the
 * same strictness as running them one by one; the exit code is 1 when any of them failed, and each
 * failing check's output is printed whole.
 * Run with: node scripts/verify.ts [--typecheck] [--full] [project names, e.g. web node addons]
 *   --typecheck  only the TypeScript projects   --full  check every project even when unchanged
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inputsStamp } from "./verify-lib.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = join(root, ".cache/tsc");
const tsc = join(root, "node_modules/typescript/bin/tsc");
const biome = join(root, "node_modules/@biomejs/biome/bin/biome");

interface Project {
  name: string;
  config: string;
}

/** The TypeScript projects, biggest first so the slow ones start first. */
const PROJECTS: Project[] = [
  { name: "web", config: "apps/desktop/tsconfig.web.json" },
  { name: "node", config: "apps/desktop/tsconfig.node.json" },
  { name: "addons", config: "addons/tsconfig.json" },
  { name: "e2e", config: "tsconfig.e2e.json" },
  { name: "sdk", config: "packages/sdk/tsconfig.json" },
  { name: "azure", config: "packages/azure/tsconfig.json" },
  { name: "themes", config: "packages/themes/tsconfig.json" },
  { name: "learning", config: "packages/learning/tsconfig.json" },
  { name: "documents", config: "packages/documents/tsconfig.json" },
  { name: "teams-relay", config: "relay/teams/tsconfig.json" },
];

interface Check {
  name: string;
  args: string[];
  project?: Project;
}

const argv = process.argv.slice(2);
const typecheckOnly = argv.includes("--typecheck");
const full = argv.includes("--full");
const wanted = argv.filter((a) => !a.startsWith("--"));
const unknown = wanted.filter((w) => !PROJECTS.some((p) => p.name === w));
if (unknown.length > 0) {
  console.error(
    `Unknown project: ${unknown.join(", ")}. Projects: ${PROJECTS.map((p) => p.name).join(", ")}`,
  );
  process.exit(2);
}

const buildInfo = (p: Project) => join(cacheDir, `${p.name}.tsbuildinfo`);
const stampFile = (p: Project) => join(cacheDir, `${p.name}.stamp`);
// Colours only in a terminal; chats read the plain text.
const tty = process.stdout.isTTY === true;

const checks: Check[] = PROJECTS.filter((p) => wanted.length === 0 || wanted.includes(p.name)).map((p) => ({
  name: `typecheck ${p.name}`,
  args: [tsc, "-p", p.config, "--incremental", "--tsBuildInfoFile", buildInfo(p), "--pretty", String(tty)],
  project: p,
}));
if (!typecheckOnly && wanted.length === 0) {
  checks.push(
    { name: "lint", args: [biome, "check", "."] },
    { name: "check:tokens", args: ["scripts/check-tokens.ts"] },
    { name: "check:addon-imports", args: ["scripts/check-addon-imports.ts"] },
    { name: "check:decisions", args: ["scripts/decision.ts", "--check"] },
  );
}

// Inputs a project's build info doesn't list: its tsconfig text, how it's checked, and every file in the
// repository by name (a new file can change what an import resolves to, or join an include folder).
const repoFiles = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const baseConfig = readFileSync(join(root, "tsconfig.base.json"), "utf8");
function extraInputs(check: Check & { project: Project }): string {
  return [
    check.args.slice(1, -2).join(" "), // without --pretty
    readFileSync(join(root, check.project.config), "utf8"),
    baseConfig,
    repoFiles,
  ].join("\0");
}

interface Result {
  check: Check;
  code: number;
  output: string;
  ms: number;
  skipped?: boolean;
}

function spawnCheck(check: Check): Promise<Result> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, check.args, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: tty ? "1" : "0" },
    });
    let output = "";
    child.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.on("error", (err) => resolve({ check, code: 1, output: `${output}${err.message}\n`, ms: 0 }));
    child.on("close", (code) => resolve({ check, code: code ?? 1, output, ms: Date.now() - started }));
  });
}

async function run(check: Check): Promise<Result> {
  const project = check.project;
  if (!project) return spawnCheck(check);
  const extra = extraInputs({ ...check, project });
  if (!full) {
    const before = inputsStamp(buildInfo(project), extra);
    let last = "";
    try {
      last = readFileSync(stampFile(project), "utf8");
    } catch {}
    if (before && before.stamp === last) return { check, code: 0, output: "", ms: 0, skipped: true };
  }
  const started = Date.now();
  const result = await spawnCheck(check);
  const after = result.code === 0 ? inputsStamp(buildInfo(project), extra) : null;
  // A file saved while tsc ran may not be what it checked: leave the stamp out, so the next run checks it.
  if (after && after.newest < started) writeFileSync(stampFile(project), after.stamp);
  else rmSync(stampFile(project), { force: true });
  return result;
}

mkdirSync(cacheDir, { recursive: true });
const started = Date.now();
// Each tsc takes one core and up to ~1 GB; keep a core free for the rest of the computer.
const limit = Math.max(1, Math.min(checks.length, availableParallelism() - 1));
const queue = [...checks];
const results: Result[] = [];
await Promise.all(
  Array.from({ length: limit }, async () => {
    for (let check = queue.shift(); check; check = queue.shift()) {
      const result = await run(check);
      results.push(result);
      const seconds = result.skipped ? "    -" : (result.ms / 1000).toFixed(1).padStart(5);
      const mark = result.code !== 0 ? "FAILED" : result.skipped ? "same  " : "ok    ";
      console.log(
        `${mark} ${seconds} s  ${check.name}${result.skipped ? " (unchanged since it passed)" : ""}`,
      );
    }
  }),
);

const failed = results.filter((r) => r.code !== 0);
for (const r of failed) {
  console.error(`\n── ${r.check.name} ${"─".repeat(Math.max(0, 70 - r.check.name.length))}`);
  console.error(r.output.trimEnd());
}
const total = ((Date.now() - started) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} checks failed (${total} s).`);
  process.exit(1);
}
console.log(`All ${results.length} checks passed (${total} s).`);
