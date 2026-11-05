/**
 * How a queue's tasks add up (one helper for the Queue tab's strip, a chat card's header and the
 * all-queues dashboard): every task in exactly one count, in a fixed order, so the counts always sum
 * to the total. "Will run" is everything except the left-out and skipped tasks; progress is "done of
 * will run", so left-out tasks never make a queue look unfinished. Parked tasks (D-369) are ideas, not
 * queue work: they are counted on their own (`parked`) and in none of the rest.
 */

import {
  chatGroups,
  durationMs,
  isActive,
  isParked,
  STATUS_LABEL,
  type Task,
  type TaskStatus,
} from "./tasks";

/** The counts, in the order they are listed: what ran, what runs, what will, what won't. */
export const COUNT_ORDER = [
  "done",
  "partial",
  "failed",
  "blocked",
  "error",
  "no_report",
  "running",
  "needs_you",
  "upNext",
  "skipped",
  "leftOut",
] as const;
export type CountKey = (typeof COUNT_ORDER)[number];

/** The STATUS column's words; a queued task is "Up next", or "Left out" when it is unticked. */
export const COUNT_LABEL: Record<CountKey, string> = {
  ...(STATUS_LABEL as Record<Exclude<TaskStatus, "queued">, string>),
  upNext: "Up next",
  leftOut: "Left out",
};

/** Which count a task is in. */
export function countKey(task: Task): CountKey {
  if (task.status === "queued") return task.leftOut ? "leftOut" : "upNext";
  return task.status;
}

/** Counts that never run: they stay out of "will run" and off the progress line. */
const WONT_RUN: CountKey[] = ["leftOut", "skipped"];

export interface QueueCounts {
  /** Tasks per count; they add up to `total`. Parked tasks are in none of them. */
  by: Record<CountKey, number>;
  total: number;
  /** Every task except the left-out and skipped ones: progress is `by.done` of this. */
  willRun: number;
  /** The chats the tasks run in (tasks that continue the chat before them share it). */
  chats: number;
  /** Chats with at least one task that will still run (up next). */
  chatsUpNext: number;
  /** Time of every task, the running ones up to `now`. */
  ms: number;
  /** Cost of every task; undefined until one has a cost. */
  costUsd?: number;
  /** Tasks in the parked pool (D-369): never run, not in `total`. */
  parked: number;
}

export function countTasks(all: Task[], now = Date.now()): QueueCounts {
  const tasks = all.filter((t) => !isParked(t));
  const by = Object.fromEntries(COUNT_ORDER.map((k) => [k, 0])) as Record<CountKey, number>;
  let ms = 0;
  let costUsd: number | undefined;
  for (const t of tasks) {
    by[countKey(t)]++;
    ms += durationMs(t, now);
    if (t.costUsd !== undefined) costUsd = (costUsd ?? 0) + t.costUsd;
  }
  const groups = chatGroups({ tasks });
  return {
    by,
    total: tasks.length,
    willRun: tasks.length - WONT_RUN.reduce((n, k) => n + by[k], 0),
    chats: groups.length,
    chatsUpNext: groups.filter((g) => g.tasks.some(({ task }) => countKey(task) === "upNext")).length,
    ms,
    ...(costUsd !== undefined ? { costUsd } : {}),
    parked: all.length - tasks.length,
  };
}

/** The time of the tasks that aren't running (the dashboard adds the running one's as it ticks). */
export const settledMs = (tasks: Task[]): number =>
  tasks.reduce((n, t) => (isActive(t) ? n : n + durationMs(t)), 0);

/**
 * The lead: "5 of 6 done", "All 6 done", or why nothing will run ("All left out", "All skipped",
 * "None will run").
 */
export function progressText(c: QueueCounts): string {
  if (!c.willRun) {
    if (c.total && c.by.leftOut === c.total) return "All left out";
    if (c.total && c.by.skipped === c.total) return "All skipped";
    return "None will run";
  }
  return c.by.done === c.willRun ? `All ${c.willRun} done` : `${c.by.done} of ${c.willRun} done`;
}

/** The counts after the lead: every one that isn't zero, except done (in the lead) and up next (the rest of it). */
export function restCounts(c: QueueCounts): Array<{ key: CountKey; n: number }> {
  // "All left out" already says it: no "3 left out" after it.
  const said = (k: CountKey) => !c.willRun && c.by[k] === c.total;
  return COUNT_ORDER.filter((k) => k !== "done" && k !== "upNext" && c.by[k] && !said(k)).map((key) => ({
    key,
    n: c.by[key],
  }));
}

/** "3 left out", "1 running": a count with its label, as it reads in a sentence. */
export const countText = (key: CountKey, n: number): string => `${n} ${COUNT_LABEL[key].toLowerCase()}`;

/** "20 tasks in 16 chats". */
export function sizeText(c: QueueCounts): string {
  return `${c.total} ${c.total === 1 ? "task" : "tasks"} in ${c.chats} ${c.chats === 1 ? "chat" : "chats"}`;
}

/**
 * The progress line's parts, as fractions of the tasks that will run, in drawing order: done first,
 * then the rest that ran, then the running ones; what's left of the track is up next.
 */
export function progressParts(c: QueueCounts): Array<{ key: CountKey; share: number }> {
  if (!c.willRun) return [];
  return COUNT_ORDER.filter((k) => k !== "upNext" && !WONT_RUN.includes(k) && c.by[k]).map((key) => ({
    key,
    share: c.by[key] / c.willRun,
  }));
}
