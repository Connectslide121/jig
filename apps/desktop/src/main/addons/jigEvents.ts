import { type FSWatcher, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { JigEventName, JigEventPayloads } from "@jig/sdk";
import type { SessionMeta, SessionStatus } from "../../shared/engine";
import { logger } from "../log";

/**
 * What happens in Jig, for add-ons (D-215): chats that finish, need you or fail; commits and branch
 * switches in the projects' repositories (watched in `.git`, wherever they're made); another active
 * project. `dispatch` hands each to the add-ons that listen.
 */
const log = logger("addons");

export type Dispatch = <N extends JigEventName>(name: N, payload: JigEventPayloads[N]) => void;

/** A chat's status change as an event: only away from working, so loading Jig never fires one. */
export function chatEventFor(
  previous: SessionStatus | undefined,
  meta: SessionMeta,
):
  | { name: "chat.finished" | "chat.needsYou" | "chat.failed"; payload: JigEventPayloads["chat.finished"] }
  | undefined {
  if (meta.kind === "builder" || previous === meta.status) return undefined;
  if (previous !== "working" && previous !== "starting") return undefined;
  const payload = { sessionId: meta.id, title: meta.title, projectId: meta.projectId, cwd: meta.cwd };
  if (meta.status === "idle") return { name: "chat.finished", payload };
  if (meta.status === "needs_you") return { name: "chat.needsYou", payload };
  if (meta.status === "error")
    return { name: "chat.failed", payload: { ...payload, error: meta.lastError?.split("\n")[0] } };
  return undefined;
}

export interface GitState {
  branch?: string;
  sha?: string;
  /** The last reflog entry's message ("commit: Fix login", "checkout: moving from a to b"). */
  message?: string;
}

/** `.git/HEAD`: the branch it points to, or undefined when detached. */
export function branchOf(head: string): string | undefined {
  const match = /^ref:\s*refs\/heads\/(.+)$/m.exec(head.trim());
  return match?.[1]?.trim();
}

/** The last entry of `.git/logs/HEAD`: the new commit and the message. */
export function lastReflog(text: string): { sha: string; message: string } | undefined {
  const line = text.trimEnd().split("\n").pop();
  if (!line) return undefined;
  const match = /^[0-9a-f]{40,64} ([0-9a-f]{40,64}) [^\t]*\t(.*)$/.exec(line);
  return match ? { sha: match[1]!, message: match[2]! } : undefined;
}

/** The events between two states of a repository (none for the first look). */
export function gitEvents(
  repo: string,
  before: GitState | undefined,
  after: GitState,
): Array<
  | { name: "git.commit"; payload: JigEventPayloads["git.commit"] }
  | { name: "git.branch"; payload: JigEventPayloads["git.branch"] }
> {
  if (!before) return [];
  const out: ReturnType<typeof gitEvents> = [];
  if (before.branch !== after.branch)
    out.push({ name: "git.branch", payload: { repo, from: before.branch, to: after.branch } });
  else if (after.sha && before.sha !== after.sha && /^commit\b/.test(after.message ?? ""))
    out.push({
      name: "git.commit",
      payload: {
        repo,
        branch: after.branch,
        sha: after.sha,
        message: (after.message ?? "").replace(/^commit( \([^)]*\))?:\s*/, ""),
      },
    });
  return out;
}

/** The git folder of a repository (`.git`, or where a worktree's `.git` file points). */
export async function gitDirOf(repo: string): Promise<string | undefined> {
  const dotGit = join(repo, ".git");
  const info = await stat(dotGit).catch(() => undefined);
  if (!info) return undefined;
  if (info.isDirectory()) return dotGit;
  const text = await readFile(dotGit, "utf8").catch(() => "");
  const target = /^gitdir:\s*(.+)$/m.exec(text)?.[1]?.trim();
  if (!target) return undefined;
  return isAbsolute(target) ? target : join(repo, target);
}

async function readState(gitDir: string): Promise<GitState> {
  const [head, reflog] = await Promise.all([
    readFile(join(gitDir, "HEAD"), "utf8").catch(() => ""),
    readFile(join(gitDir, "logs", "HEAD"), "utf8").catch(() => ""),
  ]);
  const last = lastReflog(reflog);
  return { branch: branchOf(head), sha: last?.sha, message: last?.message };
}

/** At most this many repositories are watched (one watcher each, on their `.git` folder). */
const MAX_REPOS = 50;

/** Watches the repositories' `.git` folders and reports commits and branch switches. */
export class GitEvents {
  private repos = new Map<string, { watcher?: FSWatcher; state?: GitState; timer?: NodeJS.Timeout }>();

  constructor(private readonly dispatch: Dispatch) {}

  async setRepos(paths: string[]): Promise<void> {
    const wanted = new Set(paths.slice(0, MAX_REPOS));
    for (const [repo, entry] of this.repos)
      if (!wanted.has(repo)) {
        clearTimeout(entry.timer);
        entry.watcher?.close();
        this.repos.delete(repo);
      }
    for (const repo of wanted) {
      if (this.repos.has(repo)) continue;
      const entry: { watcher?: FSWatcher; state?: GitState; timer?: NodeJS.Timeout } = {};
      this.repos.set(repo, entry);
      const gitDir = await gitDirOf(repo);
      if (!gitDir || this.repos.get(repo) !== entry) continue;
      entry.state = await readState(gitDir);
      try {
        entry.watcher = watch(gitDir, () => {
          clearTimeout(entry.timer);
          entry.timer = setTimeout(() => void this.check(repo, gitDir, entry), 300);
        });
        entry.watcher.on("error", () => {});
      } catch (error) {
        log.debug(`Can't watch ${gitDir}`, error);
      }
    }
  }

  private async check(repo: string, gitDir: string, entry: { state?: GitState }): Promise<void> {
    const next = await readState(gitDir);
    const events = gitEvents(repo, entry.state, next);
    entry.state = next;
    for (const e of events) this.dispatch(e.name, e.payload as never);
  }

  stop(): void {
    void this.setRepos([]);
  }
}
