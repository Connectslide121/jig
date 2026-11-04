/**
 * The all-queues dashboard (D-326): every project's queue as one card, and a summary across them. The
 * host builds a card from a project's stored queue only (no chat reads), the tab sorts and sums them.
 */

import {
  chatGroups,
  durationMs,
  isActive,
  isFinished,
  isReady,
  type Queue,
  type Task,
  type TaskProvider,
  type TaskStatus,
  type WaitingFor,
} from "./tasks";

/** What a project's queue is doing, in the order the dashboard sorts by. */
export type QueueState = "needs_you" | "running" | "paused" | "finished" | "idle";

export const STATE_ORDER: QueueState[] = ["needs_you", "running", "paused", "finished", "idle"];

export const STATE_LABEL: Record<QueueState, string> = {
  needs_you: "Needs you",
  running: "Running",
  paused: "Paused",
  finished: "Finished",
  idle: "Idle",
};

export type { WaitingFor };

export const WAITING_LABEL: Record<WaitingFor, string> = {
  permission: "Waits for a permission",
  question: "Asks you a question",
  plan: "Waits for you to approve a plan",
};

/** The progress bar's parts, in the order they are drawn. */
export const SEGMENTS = ["done", "problem", "needsYou", "running", "queued", "skipped"] as const;
export type Segment = (typeof SEGMENTS)[number];

export function segmentOf(status: TaskStatus): Segment {
  if (status === "done" || status === "partial") return "done";
  if (status === "needs_you") return "needsYou";
  if (status === "running") return "running";
  if (status === "queued") return "queued";
  if (status === "skipped") return "skipped";
  return "problem";
}

export interface DashboardTask {
  id: string;
  title: string;
  status: TaskStatus;
  sessionId?: string;
}

/** One project's queue on the dashboard. */
export interface QueueCard {
  projectId: string;
  state: QueueState;
  /** Who runs the queue's new chats: its "Runs on", else the project's default (D-330). */
  provider: TaskProvider;
  /** The queue's own switch: Start or Pause. */
  running: boolean;
  /** Queued and ticked: what Start takes. */
  ready: number;
  /** The current run's tasks per part of the bar, and how many of them finished. */
  segments: Record<Segment, number>;
  total: number;
  finished: number;
  /** Time of the run's tasks that aren't running now (the current task's runs on from its `sentAt`). */
  ms: number;
  /** Cost of the run's finished tasks; undefined until one has a cost. */
  costUsd?: number;
  /** The task running or waiting for you. */
  current?: DashboardTask & { chatTitle: string; sentAt?: string; waitingFor?: WaitingFor };
  /** The next queued titles (two at most) and how many more wait after them. */
  next: string[];
  more: number;
  /** The task that finished last. */
  last?: DashboardTask;
}

/**
 * The tasks of the run the card is about: the open run's tasks and the ticked queued ones that it will
 * take; with no open run, the ones Start would take, or else the last run's tasks.
 */
export function runTasks(queue: Queue): Task[] {
  if (queue.runId) return queue.tasks.filter((t) => t.runId === queue.runId || isReady(t));
  const ready = queue.tasks.filter(isReady);
  if (ready.length) return ready;
  const last = queue.tasks
    .filter((t) => t.runId && t.sentAt)
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))[0]?.runId;
  return last ? queue.tasks.filter((t) => t.runId === last) : [];
}

export function queueState(queue: Queue): QueueState {
  if (queue.tasks.some((t) => t.status === "needs_you")) return "needs_you";
  if (queue.running || queue.tasks.some(isActive)) return "running";
  if (queue.tasks.some(isReady)) return "paused";
  if (queue.tasks.some((t) => t.runId && isFinished(t))) return "finished";
  return "idle";
}

/**
 * A project's card, from its queue alone; undefined when the queue has no tasks. `projectDefault`: who
 * runs the project's new chats when the queue doesn't say.
 */
export function queueCard(
  projectId: string,
  queue: Queue,
  projectDefault: TaskProvider = "claude",
): QueueCard | undefined {
  if (!queue.tasks.length) return undefined;
  const run = runTasks(queue);
  const segments = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<Segment, number>;
  let ms = 0;
  let costUsd: number | undefined;
  for (const t of run) {
    segments[segmentOf(t.status)]++;
    if (!isActive(t)) ms += durationMs(t);
    if (t.costUsd !== undefined) costUsd = (costUsd ?? 0) + t.costUsd;
  }
  const active = queue.tasks.find(isActive);
  const ready = queue.tasks.filter(isReady);
  const last = queue.tasks
    .filter((t) => isFinished(t) && t.finishedAt)
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  return {
    projectId,
    state: queueState(queue),
    provider: queue.provider ?? projectDefault,
    running: queue.running,
    ready: ready.length,
    segments,
    total: run.length,
    finished: run.filter(isFinished).length,
    ms,
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(active ? { current: current(queue, active) } : {}),
    next: ready.slice(0, 2).map((t) => t.title),
    more: Math.max(0, ready.length - 2),
    ...(last ? { last: brief(last) } : {}),
  };
}

const brief = (t: Task): DashboardTask => ({
  id: t.id,
  title: t.title,
  status: t.status,
  ...(t.sessionId ? { sessionId: t.sessionId } : {}),
});

/** The running task with its chat's name: its own, an earlier task's in the same chat, or its title. */
function current(queue: Queue, task: Task): NonNullable<QueueCard["current"]> {
  const group = chatGroups(queue).find((g) => g.tasks.some((x) => x.task === task));
  const chatTitle = task.chatTitle ?? (group?.sessionId === task.sessionId ? group?.chatTitle : undefined);
  return {
    ...brief(task),
    chatTitle: chatTitle ?? task.title,
    ...(task.sentAt ? { sentAt: task.sentAt } : {}),
    ...(task.status === "needs_you" && task.waitingFor ? { waitingFor: task.waitingFor } : {}),
  };
}

/** The run's time now: its other tasks' plus the current task's so far. */
export function cardTime(card: QueueCard, now = Date.now()): number {
  const since = card.current?.sentAt ? Math.max(0, now - Date.parse(card.current.sentAt)) : 0;
  return card.ms + since;
}

/** Needs you, running, paused with tasks queued, finished, the rest; projects keep their order within. */
export function sortCards<T extends { state: QueueState }>(cards: T[]): T[] {
  return cards
    .map((card, i) => ({ card, i }))
    .sort((a, b) => STATE_ORDER.indexOf(a.card.state) - STATE_ORDER.indexOf(b.card.state) || a.i - b.i)
    .map((x) => x.card);
}

/** Tasks of one project that finished today (local time), each counted once (queue and history overlap). */
export function finishedToday(tasks: Task[], now = new Date()): { count: number; costUsd: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const seen = new Set<string>();
  let count = 0;
  let costUsd = 0;
  for (const t of tasks) {
    if (seen.has(t.id) || !isFinished(t) || !t.finishedAt || Date.parse(t.finishedAt) < start) continue;
    seen.add(t.id);
    count++;
    costUsd += t.costUsd ?? 0;
  }
  return { count, costUsd };
}

export interface DashboardSummary {
  queuesRunning: number;
  tasksRunning: number;
  needsYou: number;
  queued: number;
  finishedToday: number;
  costToday: number;
}

/** The strip at the top: across every card, and today's totals the host counted per project. */
export function summarize(
  cards: QueueCard[],
  today: { count: number; costUsd: number }[] = [],
): DashboardSummary {
  return {
    queuesRunning: cards.filter((c) => c.state === "running" || c.state === "needs_you").length,
    tasksRunning: cards.reduce((n, c) => n + c.segments.running + c.segments.needsYou, 0),
    needsYou: cards.reduce((n, c) => n + c.segments.needsYou, 0),
    queued: cards.reduce((n, c) => n + c.ready, 0),
    finishedToday: today.reduce((n, d) => n + d.count, 0),
    costToday: today.reduce((n, d) => n + d.costUsd, 0),
  };
}

/** What the host's `dashboard` returns. */
export interface Dashboard {
  cards: QueueCard[];
  summary: DashboardSummary;
  /** Projects whose queue has no tasks (no card). */
  empty: number;
}
