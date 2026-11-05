/**
 * Reserves the next decision number (D-361): appends `## D-xxx: <title>` to docs/decisions.md at once,
 * so a chat that runs it a second later gets the number after. The next number is one above the
 * highest in the log of every worktree and local branch, read under a lock in the git directory.
 * `--check` fails when two headings in the log share a number (run by `npm run verify`).
 * Run with: npm run decision -- "Title of the decision"   |   npm run decision -- --check
 */
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendEntry, decisionEntry, decisionId, duplicateDecisions, nextDecision } from "./decision-lib.ts";

const LOG = "docs/decisions.md";
/** A lock older than this was left by a crashed run. */
const STALE_MS = 30_000;

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (a: string[]) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const tryGit = (a: string[]) => {
  try {
    return git(a);
  } catch {
    return "";
  }
};
const readOr = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

/** The log as every worktree has it on disk and every local branch has it committed. */
function allCopies(): string[] {
  const worktrees = tryGit(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
  const branches = tryGit(["for-each-ref", "--format=%(refname)", "refs/heads"]).split("\n").filter(Boolean);
  return [
    readOr(join(root, LOG)),
    ...worktrees.map((w) => readOr(join(w, LOG))),
    ...branches.map((b) => tryGit(["show", `${b}:${LOG}`])),
  ];
}

/** Runs `fn` while holding a lock file shared by every worktree of this repository. */
async function withLock<T>(fn: () => T): Promise<T> {
  const lock = resolve(root, git(["rev-parse", "--git-common-dir"]), "jig-decision.lock");
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { force: true });
      } catch {}
      if (Date.now() > deadline) throw new Error(`Another run holds ${lock}; delete it if none is running.`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

const args = process.argv.slice(2);
const path = join(root, LOG);

if (args.includes("--check")) {
  const dupes = duplicateDecisions(readFileSync(path, "utf8"));
  if (dupes.length) {
    console.error(
      `${LOG}: ${dupes.map(decisionId).join(", ")} used twice. Renumber the newer one with npm run decision.`,
    );
    process.exit(1);
  }
} else {
  const title = args.join(" ");
  try {
    decisionEntry(0, title); // throws on a bad title before taking the lock
    const n = await withLock(() => {
      const next = nextDecision(allCopies());
      writeFileSync(path, appendEntry(readFileSync(path, "utf8"), decisionEntry(next, title)));
      return next;
    });
    console.log(
      `${decisionId(n)} reserved: its heading is at the end of ${LOG}. Fill in the entry and use ${decisionId(n)} in code and docs.`,
    );
  } catch (e) {
    console.error((e as Error).message);
    console.error('Usage: npm run decision -- "Title of the decision"');
    process.exit(1);
  }
}
