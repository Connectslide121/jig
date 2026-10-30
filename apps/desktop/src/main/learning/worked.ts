import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  type ActivityEvent,
  activeMinutes,
  parseLogPatch,
  summarizeWork,
  type WorkedSummary,
  workedText,
} from "@jig/learning";
import type { WorkedState } from "../../shared/learning";

const run = promisify(execFile);

/**
 * Key of the lines Claude typed into shell commands (`python`, heredocs, `sed`): they could end up in
 * any file, so they count in every file (`claudeWrittenLines`, D-162).
 */
export const ANYWHERE = "*";

/** Paths compared the same way on every OS (Windows: case and separators). */
export const pathKey = (path: string) => {
  const p = resolve(path);
  return process.platform === "win32" ? p.toLowerCase() : p;
};

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-c", "core.quotepath=off", ...args], {
    cwd,
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    windowsHide: true,
  });
  return stdout;
}

/**
 * "How you worked" (Learning 2e): your commits of the last 7 days in `repos`, lines by Claude (the
 * hashes recorded from its Edit/Write calls) vs by hand, churn and fixes per origin, and an estimate
 * of chat time. Commits by other people are left out (`--author` = the repository's user.email).
 */
export async function computeWorked(
  repos: string[],
  events: ActivityEvent[],
  now = new Date(),
  /** Lines Claude wrote outside Jig's chats, by file (`claudeWrittenLines`, D-162). */
  elsewhere: Map<string, Set<string>> = new Map(),
): Promise<WorkedState> {
  const ai = new Map<string, Set<string>>();
  for (const [file, hashes] of elsewhere) if (file !== ANYWHERE) ai.set(file, new Set(hashes));
  const anywhere = elsewhere.get(ANYWHERE);
  for (const e of events) {
    if (e.kind !== "ai.lines" || !e.detail?.lines) continue;
    const set = ai.get(pathKey(e.text)) ?? new Set();
    for (const h of e.detail.lines.split(",")) set.add(h);
    ai.set(pathKey(e.text), set);
  }
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const read = new Date(now.getTime() - 21 * 86_400_000).toISOString();
  const total: WorkedSummary = { commits: 0, ai: 0, hand: 0, churn: { ai: 0, hand: 0 }, fixes: [] };
  let measured = 0;
  // Each repository once, by its top folder (a folder Claude wrote in may be deep inside one).
  const tops = new Set<string>();
  for (const r of repos) {
    const top = (await git(r, ["rev-parse", "--show-toplevel"]).catch(() => "")).trim();
    if (top) tops.add(pathKey(top));
  }
  for (const repo of tops) {
    try {
      const email = (await git(repo, ["config", "user.email"]).catch(() => "")).trim();
      const out = await git(repo, [
        // Paths as they are (not quoted with octal escapes), so they match the recorded files.
        "-c",
        "core.quotePath=false",
        "log",
        `--since=${read}`,
        "-n",
        "400",
        "--no-merges",
        "-p",
        "--unified=0",
        "--format=%x1e%H%x1f%cI%x1f%s",
        ...(email ? [`--author=${email}`] : []),
      ]);
      const s = summarizeWork(
        parseLogPatch(out),
        (path) => {
          const own = ai.get(pathKey(join(repo, path)));
          if (!own && !anywhere) return undefined;
          return { has: (hash) => own?.has(hash) === true || anywhere?.has(hash) === true };
        },
        since,
      );
      if (s.commits) measured++;
      total.commits += s.commits;
      total.ai += s.ai;
      total.hand += s.hand;
      total.churn.ai += s.churn.ai;
      total.churn.hand += s.churn.hand;
      total.fixes.push(...s.fixes);
    } catch {
      // Not a repository (any more), or git failed: leave it out.
    }
  }
  const chatTimes = events
    .filter((e) => (e.kind === "prompt" || e.kind === "session.tool") && e.at >= since)
    .map((e) => e.at);
  return {
    at: now.toISOString(),
    text: workedText(total, activeMinutes(chatTimes)),
    commits: total.commits,
    ai: total.ai,
    hand: total.hand,
    churn: total.churn,
    repos: measured,
  };
}
