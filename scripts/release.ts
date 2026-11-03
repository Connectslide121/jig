/**
 * Publishes a Jig release in one go (the "Release Jig" workflow runs it after Claude writes the plan):
 * reads release/next.json (version, bump, reason, summary, notes), checks the repository and GitHub,
 * bumps the version and commits it, runs every check and the whole e2e suite, packages the Windows
 * installer and tests it, tags and pushes, creates a draft release, verifies it, publishes it and
 * records the result in docs/status.md. Stops at the first failure; run it again to continue (a
 * release commit already made is reused, a draft already uploaded is checked, not recreated).
 * Run with: npm run release (`npm run release -- --check` checks the plan and the repository only;
 * `-- --skip-tests` skips check and e2e when they already passed on this source). The e2e suite is
 * skipped on its own when `npm run e2e` last passed in full on this source (D-272).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersions, setVersion } from "../.agents/skills/jig-release/scripts/version.mjs";
import {
  checkBump,
  compareVersions,
  E2E_STAMP,
  e2eStillPasses,
  parseLatestYml,
  parsePlan,
  preparedParagraph,
  publishedParagraph,
  withStatus,
} from "./release-lib.ts";

const REPO = "Connectslide121/jig";
const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "apps", "desktop", "release");
const windows = process.platform === "win32";

function step(title: string): void {
  console.log(`\n▶ ${title}`);
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/** A command whose output we need. */
function read(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A long command shown as it runs; stops the release when it fails. */
function run(cmd: string, args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    // npm/npx are .cmd shims that need a shell on Windows; git and gh are real executables, and a
    // shell would split arguments with spaces (a commit message, a release title).
    shell: windows && (cmd === "npm" || cmd === "npx"),
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) fail(`${cmd} ${args.join(" ")} failed (exit ${result.status})`);
}

function hash(file: string, algorithm: "sha256" | "sha512", encoding: "hex" | "base64"): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash(algorithm);
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest(encoding)))
      .on("error", reject);
  });
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The commit the whole e2e suite last passed on (`npm run e2e` records it), when nothing but the
 * release's own files changed since; otherwise undefined and the suite runs.
 */
function e2ePassedOn(): string | undefined {
  try {
    const { sha } = JSON.parse(readFileSync(join(root, E2E_STAMP), "utf8")) as { sha?: string };
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return undefined;
    return e2eStillPasses(read("git", ["diff", "--name-only", sha, "HEAD"]).split("\n")) ? sha : undefined;
  } catch {
    return undefined;
  }
}
const gitClean = () => read("git", ["status", "--porcelain"]) === "";

// ── The plan ──────────────────────────────────────────────────────────────
step("Reading the plan (release/next.json)");
const planFile = join(root, "release", "next.json");
if (!existsSync(planFile)) fail("No release/next.json: ask Claude to prepare the release first.");
const plan = (() => {
  try {
    return parsePlan(readFileSync(planFile, "utf8"));
  } catch (error) {
    fail((error as Error).message);
  }
})();
const tag = `v${plan.version}`;
console.log(`Jig ${plan.version} (${plan.bump}): ${plan.reason}`);

// ── The repository and GitHub ─────────────────────────────────────────────
step("Checking the repository and GitHub");
if (!windows) fail("Jig's installer is built on Windows.");
const origin = read("git", ["remote", "get-url", "origin"]);
if (!/github\.com[/:]Connectslide121\/jig(\.git)?$/i.test(origin)) fail(`origin is ${origin}, not ${REPO}`);
if (read("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") fail("Releases are made from main.");
if (!gitClean())
  fail("The working tree has changes. Commit or stash them first: a release never includes unfinished work.");
try {
  read("gh", ["auth", "status"]);
} catch {
  fail("gh isn't signed in to GitHub: run `gh auth login` once.");
}
read("git", ["fetch", "origin", "--tags"]);
if (read("git", ["rev-list", "--count", "HEAD..origin/main"]) !== "0")
  fail("origin/main has commits this checkout lacks: pull first.");
const outgoing = read("git", ["log", "--oneline", "origin/main..HEAD"]);
console.log(outgoing ? `Commits going out with this release:\n${outgoing}` : "No unpushed commits.");

const releases = JSON.parse(
  read("gh", ["release", "list", "--repo", REPO, "--limit", "20", "--json", "tagName,isDraft,isLatest"]),
) as Array<{ tagName: string; isDraft: boolean; isLatest: boolean }>;
const published = releases.filter((r) => !r.isDraft).map((r) => r.tagName.replace(/^v/, ""));
const latest = published.sort(compareVersions).at(-1);
if (published.includes(plan.version)) fail(`${tag} is already published.`);
try {
  checkBump(plan, latest);
} catch (error) {
  fail((error as Error).message);
}
const subject = `Release Jig ${plan.version}`;
const current = readVersions(root).current;
// The release commit set the version; it may have been pushed and followed by other commits (a fix
// for what stopped the release, or work committed meanwhile), so continue from HEAD while the
// version is unpublished.
const resuming = current === plan.version;
if (resuming) {
  if (!read("git", ["log", "--format=%s", "-200"]).split("\n").includes(subject))
    fail(`The app version is already ${current}, but there is no "${subject}" commit.`);
  console.log("The version is already set by the release commit: continuing from HEAD.");
} else if (compareVersions(plan.version, current) <= 0)
  fail(`${plan.version} must be newer than ${current}.`);
const remoteTag = read("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]);
const draft = releases.find((r) => r.tagName === tag && r.isDraft);
if (remoteTag && !draft) fail(`${tag} already exists on GitHub without a draft release: look at it by hand.`);

if (process.argv.includes("--check")) {
  console.log(
    `\n✔ Ready to release Jig ${plan.version}${resuming ? " (continuing)" : ""}: nothing was changed.`,
  );
  process.exit(0);
}

// ── Version and status ────────────────────────────────────────────────────
if (!resuming) {
  step(`Setting the version to ${plan.version}`);
  setVersion(root, plan.version);
  const status = join(root, "docs", "status.md");
  writeFileSync(
    status,
    withStatus(readFileSync(status, "utf8"), plan.version, preparedParagraph(plan, today())),
  );
  run("git", ["add", "package.json", "apps/desktop/package.json", "package-lock.json", "docs/status.md"]);
  run("git", ["commit", "-q", "-m", subject]);
}
const sha = read("git", ["rev-parse", "HEAD"]);

// ── Checks, package, packaged test ────────────────────────────────────────
// --skip-tests: only when check and the whole e2e suite already passed on this source (a rerun after
// a packaging fix); the packaged app test below always runs.
if (process.argv.includes("--skip-tests")) {
  console.log("\nSkipping npm run check and the e2e suite (--skip-tests).");
} else {
  step("npm run check");
  run("npm", ["run", "check"]);
  step("The whole e2e suite");
  const passed = e2ePassedOn();
  if (passed)
    console.log(`Already passed on ${passed.slice(0, 7)}, and only the version changed since: skipped.`);
  else run("npm", ["run", "e2e"]);
}
step("Building and packaging the installer");
run("npm", ["run", "build"]);
run("npm", ["run", "dist", "--workspace", "@jig/desktop", "--", "--no-open"]);

step("Checking the installer and its update feed");
const installer = join(out, `Jig-Setup-${plan.version}.exe`);
const blockmap = `${installer}.blockmap`;
const feedFile = join(out, "latest.yml");
for (const f of [installer, blockmap, feedFile])
  if (!existsSync(f) || !statSync(f).size) fail(`Missing ${f}`);
const feed = parseLatestYml(readFileSync(feedFile, "utf8"));
const size = statSync(installer).size;
const sha512 = await hash(installer, "sha512", "base64");
if (feed.version !== plan.version || feed.path !== basename(installer) || feed.sha512 !== sha512)
  fail("latest.yml doesn't describe this installer (version, file name or SHA-512).");
if (feed.size !== undefined && feed.size !== size) fail("latest.yml's size doesn't match the installer.");
const productVersion = read("powershell", [
  "-NoProfile",
  "-Command",
  `(Get-Item -LiteralPath '${installer.replace(/'/g, "''")}').VersionInfo.ProductVersion`,
]);
if (!productVersion.startsWith(plan.version)) fail(`The installer says it is ${productVersion}.`);
const app = join(out, "win-unpacked", "resources");
const needed = [
  join(app, "addons"),
  join(app, "skills"),
  join(app, "app", "node_modules", "@anthropic-ai", `claude-agent-sdk-win32-x64`),
  join(app, "app", "node_modules", "onnxruntime-node"),
  join(app, "app", "node_modules", "phonemizer"),
  join(app, "app", "node_modules", "@lydell", "node-pty"),
];
for (const p of needed) if (!existsSync(p)) fail(`The packaged app lacks ${p}`);

step("Testing the packaged app");
const packaged = spawnSync("npx", ["playwright", "test", "e2e/packaged.spec.ts", "--reporter=line"], {
  cwd: root,
  shell: true,
  encoding: "utf8",
  env: { ...process.env, JIG_HIDDEN: "1" },
});
process.stdout.write(packaged.stdout ?? "");
if (packaged.status !== 0 || !/1 passed/.test(packaged.stdout ?? "") || /skipped/.test(packaged.stdout ?? ""))
  fail("The packaged app test didn't pass (a skip doesn't count).");

const sha256 = await hash(installer, "sha256", "hex");
const sums = join(out, "SHA256SUMS.txt");
writeFileSync(
  sums,
  `${(
    await Promise.all(
      [installer, blockmap, feedFile].map(async (f) => `${await hash(f, "sha256", "hex")}  ${basename(f)}`),
    )
  ).join("\n")}\n`,
);
if (read("git", ["rev-parse", "HEAD"]) !== sha || !gitClean())
  fail("The source changed while building: run the release again.");

// ── Tag, push, draft, publish ─────────────────────────────────────────────
step(`Tagging ${tag} and pushing`);
const localTag = (() => {
  try {
    return read("git", ["rev-parse", `${tag}^{commit}`]);
  } catch {
    return "";
  }
})();
if (localTag && localTag !== sha) fail(`The local tag ${tag} points at another commit.`);
if (!localTag) run("git", ["tag", "-a", tag, "-m", `Jig ${plan.version}`]);
if (!remoteTag) run("git", ["push", "--atomic", "origin", `${sha}:refs/heads/main`, `refs/tags/${tag}`]);

step("Creating the draft release");
const notesFile = join(root, "release", `jig-${plan.version}-notes.md`);
writeFileSync(notesFile, `${plan.notes}\n`);
const assets = [installer, blockmap, feedFile, sums];
if (!draft)
  run("gh", [
    "release",
    "create",
    tag,
    ...assets,
    "--repo",
    REPO,
    "--verify-tag",
    "--draft",
    "--title",
    `Jig ${plan.version}`,
    "--notes-file",
    notesFile,
  ]);
else {
  const have = new Set(
    (
      JSON.parse(read("gh", ["release", "view", tag, "--repo", REPO, "--json", "assets"])) as {
        assets: Array<{ name: string }>;
      }
    ).assets.map((a) => a.name),
  );
  const missing = assets.filter((a) => !have.has(basename(a)));
  if (missing.length) run("gh", ["release", "upload", tag, ...missing, "--repo", REPO]);
}

step("Verifying the draft");
const download = mkdtempSync(join(tmpdir(), "jig-release-"));
try {
  run("gh", [
    "release",
    "download",
    tag,
    "--repo",
    REPO,
    "--pattern",
    basename(installer),
    "--dir",
    download,
  ]);
  if ((await hash(join(download, basename(installer)), "sha256", "hex")) !== sha256)
    fail("The uploaded installer differs from the local one; the draft stays a draft.");
} finally {
  rmSync(download, { recursive: true, force: true });
}

step("Publishing");
run("gh", [
  "release",
  "edit",
  tag,
  "--repo",
  REPO,
  "--verify-tag",
  "--draft=false",
  "--prerelease=false",
  "--latest",
]);

step("Checking what installed Jig sees (no GitHub login)");
const latestRelease = (await (
  await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
).json()) as {
  tag_name?: string;
  html_url?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
};
if (latestRelease.tag_name !== tag) fail(`GitHub's latest release is ${latestRelease.tag_name}, not ${tag}.`);
const asset = (name: string) => latestRelease.assets?.find((a) => a.name === name)?.browser_download_url;
const publicFeed = asset("latest.yml");
const publicInstaller = asset(basename(installer));
if (!publicFeed || !publicInstaller || !asset(basename(blockmap))) fail("The release lacks an asset.");
if (parseLatestYml(await (await fetch(publicFeed)).text()).version !== plan.version)
  fail("The public latest.yml has another version.");
if (!(await fetch(publicInstaller, { method: "HEAD" })).ok) fail("The public installer doesn't download.");

// ── Record it ─────────────────────────────────────────────────────────────
step("Recording the release in docs/status.md");
const url = latestRelease.html_url ?? `https://github.com/${REPO}/releases/tag/${tag}`;
const status = join(root, "docs", "status.md");
writeFileSync(
  status,
  withStatus(
    readFileSync(status, "utf8"),
    plan.version,
    publishedParagraph(plan, { date: today(), url, sha, size, sha256 }),
  ),
);
run("git", ["add", "docs/status.md"]);
run("git", ["commit", "-q", "-m", `Record Jig ${plan.version} publication`]);
run("git", ["push", "origin", "HEAD:refs/heads/main"]);
rmSync(planFile, { force: true });

console.log(`\n✔ Jig ${plan.version} is published: ${url}`);
console.log(`  Installer ${size.toLocaleString("en-US")} bytes, SHA-256 ${sha256}`);
console.log("  Installed Jig offers it within a few seconds of opening.");
