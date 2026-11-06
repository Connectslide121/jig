/**
 * The all-queues dashboard (D-326): every project's queue as one card, and a summary across them. The
 * host builds a card from a project's stored queue only (no chat reads), the tab sorts and sums them.
 */

import { countTasks, type QueueCounts, settledMs } from "./counts";
import {
  chatGroups,
  isActive,
  isFinished,
  isReady,
  type Queue,
  runBlock,
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
  limit: "Hit its plan's limit",
};

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
  /** What Start takes: the queued tasks up to the next stop line (D-398). */
  ready: number;
  /** The queue's tasks counted as the Queue tab's strip counts them (D-352), so the numbers agree. */
  counts: QueueCounts;
  /** Time of the tasks that aren't running now (the current task's runs on from its `sentAt`). */
  ms: number;
  /** Cost of the queue's tasks; undefined until one has a cost. */
  costUsd?: number;
  /** Some of its tasks ran on ChatGPT, whose costs are estimates at OpenAI API prices (D-414). */
  costEstimated?: boolean;
  /** The task running or waiting for you. */
  current?: DashboardTask & {
    chatTitle: string;
    sentAt?: string;
    waitingFor?: WaitingFor;
    /** Its chat waits for its plan's limit to reset at this time, then carries on (D-376). */
    limitResetsAt?: string;
  };
  /** The next queued titles (two at most) and how many more wait after them. */
  next: string[];
  more: number;
  /** The task that finished last. */
  last?: DashboardTask;
}

export function queueState(queue: Queue): QueueState {
  if (queue.tasks.some((t) => t.status === "needs_you")) return "needs_you";
  if (queue.running || queue.tasks.some(isActive)) return "running";
  if (queue.tasks.some(isReady)) return "paused";
  if (queue.tasks.some((t) => t.runId && isFinished(t))) return "finished";
  return "idle";
}

/**
 * A project's card, from its queue alone; undefined when the queue has no tasks (parked ones aside). `projectDefault`: who
 * runs the project's new chats when the queue doesn't say.
 */
export function queueCard(
  projectId: string,
  queue: Queue,
  projectDefault: TaskProvider = "claude",
): QueueCard | undefined {
  const counts = countTasks(queue.tasks);
  // Only parked ideas (D-369): nothing for the dashboard, as an empty queue.
  if (!counts.total) return undefined;
  const active = queue.tasks.find(isActive);
  const ready = runBlock(queue);
  const last = queue.tasks
    .filter((t) => isFinished(t) && t.finishedAt)
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  return {
    projectId,
    state: queueState(queue),
    provider: queue.provider ?? projectDefault,
    running: queue.running,
    ready: ready.length,
    counts,
    ms: settledMs(queue.tasks),
    ...(counts.costUsd !== undefined ? { costUsd: counts.costUsd } : {}),
    ...(queue.tasks.some((t) => t.ranOn === "chatgpt") ? { costEstimated: true } : {}),
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
    ...(task.status === "running" && task.limitResetsAt ? { limitResetsAt: task.limitResetsAt } : {}),
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
    tasksRunning: cards.reduce((n, c) => n + c.counts.by.running + c.counts.by.needs_you, 0),
    needsYou: cards.reduce((n, c) => n + c.counts.by.needs_you, 0),
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
