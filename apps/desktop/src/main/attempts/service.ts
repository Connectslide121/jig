import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AttemptChanges, AttemptRun, AttemptVerdict } from "../../shared/attempts";
import type { SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { readJson, writeJson } from "../state/jsonStore";
import {
  addWorktree,
  applyAttempt,
  attemptChanges,
  attemptDiff,
  headCommit,
  isDirty,
  removeWorktree,
} from "./git";
import { judgePrompt, parseVerdict } from "./judge";

export interface AttemptDeps {
  /** `~/.jig/attempts`: one JSON file per run, worktrees in `<id>/<n>`. */
  dir: string;
  createSession(input: { projectId: string; cwd: string; title: string }): Promise<SessionMeta>;
  send(sessionId: string, text: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  /** A one-shot question to Claude (no tools) through Claude Code. */
  ask(prompt: string, cwd: string): Promise<string>;
  onChange(run: AttemptRun): void;
}

const RunSchema = z.custom<AttemptRun>((v) => typeof v === "object" && v !== null && "id" in v);

/** The message each attempt's chat starts with. */
export function attemptPrompt(task: string, hint: string, index: number, count: number): string {
  return [
    task.trim(),
    `You are attempt ${index} of ${count} at this task. The other attempts work on the same task at the same time, each in its own copy of the repository. Your angle: ${hint}`,
    "Work only in this folder (a git worktree of the repository) and don't commit. When you're done, summarise in a few lines what you changed and why.",
  ].join("\n\n");
}

/**
 * "Try several ways": the same task, 2–4 Claude Code chats, each in its own git worktree from the
 * repository's last commit and with its own angle. Compare their changes, let Claude judge, keep one:
 * it's applied to your working copy (uncommitted), and every worktree is removed.
 */
export class AttemptService {
  private runs = new Map<string, AttemptRun>();
  private loaded?: Promise<void>;

  constructor(private readonly deps: AttemptDeps) {}

  private load() {
    this.loaded ??= (async () => {
      const files = await readdir(this.deps.dir).catch(() => [] as string[]);
      for (const f of files.filter((f) => f.endsWith(".json"))) {
        const run = await readJson(join(this.deps.dir, f), RunSchema, null).catch(() => null);
        if (run) this.runs.set(run.id, run);
      }
    })();
    return this.loaded;
  }

  private async save(run: AttemptRun) {
    this.runs.set(run.id, run);
    await writeJson(join(this.deps.dir, `${run.id}.json`), run);
    this.deps.onChange(run);
  }

  async get(id: string): Promise<AttemptRun> {
    await this.load();
    const run = this.runs.get(id);
    if (!run) throw new JigError("not_found", "These attempts no longer exist");
    return run;
  }

  async list(): Promise<AttemptRun[]> {
    await this.load();
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async start(input: {
    projectId: string;
    repo: string;
    task: string;
    hints: string[];
  }): Promise<AttemptRun> {
    await this.load();
    const task = input.task.trim();
    const hints = input.hints.map((h) => h.trim()).filter(Boolean);
    if (!task) throw new JigError("invalid_args", "Describe the task first");
    if (hints.length < 2 || hints.length > 4) throw new JigError("invalid_args", "Choose 2 to 4 attempts");
    const base = await headCommit(input.repo);
    const id = randomBytes(4).toString("hex");
    const run: AttemptRun = {
      id,
      projectId: input.projectId,
      repo: input.repo,
      base,
      task,
      createdAt: new Date().toISOString(),
      status: "running",
      attempts: [],
    };
    try {
      for (const [i, hint] of hints.entries()) {
        const index = i + 1;
        const worktree = join(this.deps.dir, id, String(index));
        const branch = `jig/attempt-${id}-${index}`;
        await addWorktree(input.repo, worktree, branch, base);
        const title = task.split("\n")[0]!.slice(0, 50);
        const session = await this.deps.createSession({
          projectId: input.projectId,
          cwd: worktree,
          title: `Attempt ${index}: ${title}`,
        });
        run.attempts.push({ index, hint, sessionId: session.id, worktree, branch });
      }
    } catch (error) {
      await this.cleanup(run);
      throw error;
    }
    await this.save(run);
    for (const a of run.attempts)
      await this.deps.send(a.sessionId, attemptPrompt(task, a.hint, a.index, run.attempts.length));
    return run;
  }

  /** Whether the repository has changes of its own (Keep applies on top of them). */
  async repoDirty(id: string): Promise<boolean> {
    return isDirty((await this.get(id)).repo);
  }

  async changes(id: string): Promise<AttemptChanges[]> {
    const run = await this.get(id);
    if (run.status !== "running") return [];
    return Promise.all(run.attempts.map((a) => attemptChanges(a.index, a.worktree, run.base)));
  }

  async diff(id: string, index: number, path?: string): Promise<string> {
    const run = await this.get(id);
    const a = run.attempts.find((x) => x.index === index);
    if (!a || run.status !== "running") throw new JigError("not_found", "No such attempt");
    return attemptDiff(a.worktree, run.base, path);
  }

  /** Claude compares the attempts' changes and recommends one (it only reads: no tools). */
  async judge(id: string): Promise<AttemptVerdict> {
    const run = await this.get(id);
    const changes = await this.changes(id);
    const diffs = await Promise.all(run.attempts.map((a) => attemptDiff(a.worktree, run.base)));
    const verdict = parseVerdict(
      await this.deps.ask(judgePrompt(run, changes, diffs), run.repo),
      run.attempts.length,
    );
    await this.save({ ...run, verdict });
    return verdict;
  }

  /** Applies one attempt to the repository's working copy, then removes every worktree. */
  async keep(id: string, index: number): Promise<AttemptRun> {
    const run = await this.get(id);
    const a = run.attempts.find((x) => x.index === index);
    if (!a || run.status !== "running") throw new JigError("not_found", "No such attempt");
    await applyAttempt(run.repo, a.worktree, run.base);
    await this.cleanup(run);
    const next: AttemptRun = { ...run, status: "kept", kept: index };
    await this.save(next);
    return next;
  }

  async discard(id: string): Promise<AttemptRun> {
    const run = await this.get(id);
    await this.cleanup(run);
    const next: AttemptRun = { ...run, status: "discarded" };
    await this.save(next);
    return next;
  }

  /** Stops the attempts' chats (they stay in the list) and removes their worktrees and branches. */
  private async cleanup(run: AttemptRun) {
    for (const a of run.attempts) {
      await this.deps.stop(a.sessionId).catch(() => {});
      await removeWorktree(run.repo, a.worktree, a.branch).catch(() => {});
    }
  }
}
