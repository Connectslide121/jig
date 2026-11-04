/**
 * The task queue: prompts Claude takes one after another, each reporting back how it went (outcome,
 * summary, notes, follow-ups) so the results read as a table instead of one long chat.
 */

export type Outcome = "done" | "partial" | "failed" | "blocked";
export type TaskStatus = "queued" | "running" | "needs_you" | Outcome | "no_report" | "error" | "skipped";
export type PermissionMode = "default" | "acceptEdits" | "plan";

export interface TaskReport {
  outcome: Outcome;
  summary: string;
  notes: string[];
  followUps: string[];
}

/** A file sent with a task's prompt (kept by the add-on with `ctx.attachments`, like a chat's). */
export interface TaskFile {
  path: string;
  mime: string;
  name?: string;
  kind?: "image" | "pdf" | "office" | "text";
}

export interface Task {
  id: string;
  title: string;
  prompt: string;
  /** Images and documents sent with the prompt; kept with the task so they open from its results. */
  attachments?: TaskFile[];
  projectId?: string;
  /** Starts its own chat; otherwise it continues the chat of the task before it. */
  newChat: boolean;
  permissionMode?: PermissionMode;
  status: TaskStatus;
  sessionId?: string;
  chatTitle?: string;
  sentAt?: string;
  finishedAt?: string;
  /** The chat's cost when the task started, to tell the task's own cost. */
  costAtStart?: number;
  costUsd?: number;
  /** The chat was busy with this task at some point (so "idle" afterwards means finished). */
  sawBusy?: boolean;
  report?: TaskReport;
  /** Claude's last answer, kept when it didn't report. */
  answer?: string;
  error?: string;
  /** The task whose follow-up this is. */
  from?: string;
  /** Queued by Claude from a chat (its session id), not by you. */
  addedBy?: string;
  /** The run it ran in (set when it starts), so the run's history keeps it. */
  runId?: string;
  /** Unticked: stays queued but Start passes it by, until it is ticked again. */
  leftOut?: boolean;
}

export interface Queue {
  tasks: Task[];
  running: boolean;
  stopOnFailure: boolean;
  seq: number;
  /** The open run: from Start until the queue finishes (pausing keeps it open). */
  runId?: string;
}

/** A run kept in the history: the tasks that ran in it, as they ended (or are now, while it runs). */
export interface Run {
  id: string;
  startedAt: string;
  /** Set when the queue finished; a run still open has none. */
  finishedAt?: string;
  tasks: Task[];
}

/** Runs kept per project; the oldest go first. */
export const HISTORY_LIMIT = 200;

export interface ChatState {
  id: string;
  title: string;
  status: "idle" | "starting" | "working" | "needs_you" | "error";
  costUsd: number;
  lastAnswer?: string;
  lastAnswerAt?: string;
  error?: string;
}

export const OUTCOMES: Outcome[] = ["done", "partial", "failed", "blocked"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  needs_you: "Needs you",
  done: "Done",
  partial: "Partly done",
  failed: "Failed",
  blocked: "Blocked",
  no_report: "No report",
  error: "Error",
  skipped: "Skipped",
};

export const emptyQueue = (): Queue => ({ tasks: [], running: false, stopOnFailure: true, seq: 0 });

export function isActive(task: Task): boolean {
  return task.status === "running" || task.status === "needs_you";
}

export function isFinished(task: Task): boolean {
  return !isActive(task) && task.status !== "queued";
}

/** A short title from a prompt: its first line, cut at a word. */
export function titleOf(prompt: string, max = 70): string {
  const line = prompt.trim().split("\n")[0]!.trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The prompts typed in the add dialog: the whole text, or each non-empty line (list marks dropped). */
export function parsePrompts(text: string, eachLine: boolean): string[] {
  if (!eachLine) return text.trim() ? [text.trim()] : [];
  return text
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^(?:[-*•]|\d+[.)]|\[ \])\s+/, "")
        .trim(),
    )
    .filter(Boolean);
}

export interface NewTask {
  prompt: string;
  title?: string;
  newChat?: boolean;
  attachments?: TaskFile[];
}

/** A file's name to show (its original name, else the end of its path). */
export const fileName = (file: TaskFile): string => file.name ?? file.path.split(/[\\/]/).pop() ?? "file";

/** A task's title: its prompt's first line, or its files' names when it has no text. */
export function titleFor(prompt: string, files: TaskFile[] = []): string {
  return titleOf(prompt) || titleOf(files.map(fileName).join(", ")) || "Untitled task";
}

export function addTasks(
  queue: Queue,
  items: Array<string | NewTask>,
  options: {
    projectId?: string;
    newChat: boolean;
    permissionMode?: PermissionMode;
    from?: string;
    addedBy?: string;
  },
): Queue {
  let seq = queue.seq;
  const added = items
    .map((item) => (typeof item === "string" ? { prompt: item } : item))
    .filter((item) => item.prompt.trim() || item.attachments?.length)
    .map(
      (item): Task => ({
        id: `t${++seq}`,
        title: item.title?.trim() || titleFor(item.prompt, item.attachments),
        prompt: item.prompt.trim(),
        ...(item.attachments?.length ? { attachments: item.attachments } : {}),
        projectId: options.projectId,
        newChat: item.newChat ?? options.newChat,
        permissionMode: options.permissionMode,
        status: "queued",
        ...(options.from ? { from: options.from } : {}),
        ...(options.addedBy ? { addedBy: options.addedBy } : {}),
      }),
    );
  return { ...queue, seq, tasks: [...queue.tasks, ...added] };
}

/** A queued task Start will take (ticked). */
export const isReady = (task: Task): boolean => task.status === "queued" && !task.leftOut;

/** The next task to run: the first ticked queued one, unless one is still running. */
export function nextTask(queue: Queue): Task | undefined {
  if (queue.tasks.some(isActive)) return undefined;
  return queue.tasks.find(isReady);
}

/** Ticks or unticks queued tasks (`ids`, or every queued one). Ticked is the default. */
export function setLeftOut(queue: Queue, leftOut: boolean, ids?: string[]): Queue {
  const wanted = ids && new Set(ids);
  return {
    ...queue,
    tasks: queue.tasks.map((t) => {
      if (t.status !== "queued" || (wanted && !wanted.has(t.id))) return t;
      const { leftOut: _was, ...rest } = t;
      return leftOut ? { ...rest, leftOut: true } : rest;
    }),
  };
}

/** A task as if it never ran: queued again in its place, its chat, times, cost and report gone. */
export function resetTask(task: Task): Task {
  const {
    sessionId: _s,
    chatTitle: _c,
    sentAt: _sent,
    finishedAt: _f,
    costAtStart: _ca,
    costUsd: _cost,
    sawBusy: _b,
    report: _r,
    answer: _a,
    error: _e,
    runId: _run,
    ...rest
  } = task;
  return { ...rest, status: "queued" };
}

/**
 * Tasks back in the queue as if they never ran, in their places (`ids`, or every task). With no ids the
 * whole queue starts over: it is paused and its open run is closed (the host drops it from the history).
 * A task that is running or needs you is put back too: its chat isn't stopped, only no longer followed.
 */
export function resetTasks(queue: Queue, ids?: string[]): Queue {
  const wanted = ids && new Set(ids);
  const tasks = queue.tasks.map((t) =>
    t.status === "queued" || (wanted && !wanted.has(t.id)) ? t : resetTask(t),
  );
  const next = { ...queue, tasks };
  return wanted ? next : closeRun({ ...next, running: false });
}

/**
 * The chat a task continues: the chat of the closest task before it that ran, when it doesn't start
 * its own (and that task is in the same project). Undefined = a new chat.
 */
export function chatToContinue(queue: Queue, task: Task): string | undefined {
  if (task.newChat) return undefined;
  const index = queue.tasks.findIndex((t) => t.id === task.id);
  for (let i = index - 1; i >= 0; i--) {
    const before = queue.tasks[i]!;
    if (!before.sessionId) continue;
    return before.projectId === task.projectId ? before.sessionId : undefined;
  }
  return undefined;
}

/** Whether the chat finished the task's turn: idle (or failed) after working on it. */
export function chatFinished(task: Task, chat: ChatState): boolean {
  if (chat.status !== "idle" && chat.status !== "error") return false;
  if (task.sawBusy || chat.status === "error") return true;
  return !!(chat.lastAnswerAt && task.sentAt && chat.lastAnswerAt >= task.sentAt);
}

/** The task once its chat is done: its status from Claude's report, or no_report / error without one. */
export function finishTask(task: Task, chat: ChatState, at = new Date().toISOString()): Task {
  const status: TaskStatus = task.report
    ? task.report.outcome
    : chat.status === "error"
      ? "error"
      : "no_report";
  return {
    ...task,
    status,
    finishedAt: at,
    chatTitle: chat.title,
    costUsd: Math.max(0, chat.costUsd - (task.costAtStart ?? 0)),
    ...(!task.report && chat.lastAnswer ? { answer: chat.lastAnswer.slice(0, 4000) } : {}),
    ...(chat.status === "error" && chat.error ? { error: chat.error } : {}),
  };
}

/** The queue stops after a task that didn't go well, when "stop when a task fails" is on. */
export function shouldPause(queue: Queue, task: Task): boolean {
  return queue.stopOnFailure && ["failed", "blocked", "error"].includes(task.status);
}

const list = (v: unknown, max = 20) =>
  (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [])
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, max);

/** Checks what Claude passed to the report tool. */
export function parseReport(args: {
  outcome?: unknown;
  summary?: unknown;
  notes?: unknown;
  followUps?: unknown;
}): TaskReport {
  const outcome = String(args.outcome ?? "") as Outcome;
  if (!OUTCOMES.includes(outcome)) throw new Error(`outcome must be one of ${OUTCOMES.join(", ")}`);
  const summary = String(args.summary ?? "").trim();
  if (!summary) throw new Error("A report needs a summary");
  return { outcome, summary, notes: list(args.notes), followUps: list(args.followUps) };
}

/**
 * Checks the tasks Claude passes to the add tool: strings, or `{ title?, prompt, newChat? }`. At most
 * 50 at once; a prompt must say what to do on its own (it may run in a new chat).
 */
export function parseNewTasks(value: unknown): NewTask[] {
  const items = Array.isArray(value) ? value : [];
  const tasks = items
    .map((item): NewTask | undefined => {
      if (typeof item === "string") return item.trim() ? { prompt: item.trim() } : undefined;
      if (!item || typeof item !== "object") return undefined;
      const o = item as Record<string, unknown>;
      const prompt = String(o.prompt ?? "").trim();
      if (!prompt) return undefined;
      return {
        prompt,
        ...(typeof o.title === "string" && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {}),
        ...(typeof o.newChat === "boolean" ? { newChat: o.newChat } : {}),
      };
    })
    .filter((t): t is NewTask => !!t);
  if (!tasks.length) throw new Error("Give at least one task with a prompt");
  if (tasks.length > 50) throw new Error("At most 50 tasks at once");
  return tasks;
}

/** Claude's changes to queued tasks (`addon_tasks_edit`). */
export interface TaskEdit {
  id: string;
  title?: string;
  /** Replaces the prompt. */
  prompt?: string;
  /** Added to the prompt as a new paragraph. */
  append?: string;
  leftOut?: boolean;
}

export function parseTaskEdits(value: unknown): TaskEdit[] {
  const items = Array.isArray(value) ? value : [];
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const edits = items.map((item): TaskEdit => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = text(o.id);
    if (!id) throw new Error("Each edit needs the task's id (addon_tasks_list shows them)");
    const edit: TaskEdit = { id };
    const title = text(o.title);
    if (title) edit.title = title.slice(0, 120);
    const prompt = text(o.prompt);
    if (prompt) edit.prompt = prompt;
    const append = text(o.append);
    if (append) edit.append = append;
    if (typeof o.leftOut === "boolean") edit.leftOut = o.leftOut;
    if (Object.keys(edit).length === 1) throw new Error(`Say what to change in task ${id}`);
    return edit;
  });
  if (!edits.length) throw new Error("Give at least one task to change");
  return edits;
}

/**
 * Applies edits to queued tasks only; the queue's own state (running, statuses, reports) is left as
 * it is, so this is safe while the queue runs. Throws, changing nothing, when a task isn't queued.
 */
export function editTasks(queue: Queue, edits: TaskEdit[]): Queue {
  const byId = new Map(queue.tasks.map((t) => [t.id, t]));
  for (const e of edits) {
    const task = byId.get(e.id);
    if (!task) throw new Error(`There is no task ${e.id} in this queue`);
    if (task.status !== "queued")
      throw new Error(
        `Task ${e.id} is ${STATUS_LABEL[task.status].toLowerCase()}; only queued tasks can be changed`,
      );
  }
  const wanted = new Map(edits.map((e) => [e.id, e]));
  return {
    ...queue,
    tasks: queue.tasks.map((t) => {
      const e = wanted.get(t.id);
      if (!e) return t;
      let prompt = e.prompt ?? t.prompt;
      if (e.append) prompt = prompt ? `${prompt}\n\n${e.append}` : e.append;
      let next: Task = { ...t, prompt, ...(e.title ? { title: e.title } : {}) };
      if (e.leftOut !== undefined) next = setLeftOut({ ...queue, tasks: [next] }, e.leftOut).tasks[0]!;
      return next;
    }),
  };
}

/**
 * Where moved tasks can land (D-307): before the task `before` (or at the end), and either joining the
 * chat of the task just above (`join`, inside its card) or starting their own chat (between cards).
 */
export interface DropSlot {
  before?: string;
  join: boolean;
}

/**
 * The queue without the tasks being moved. A chat's first task that moves away hands its chat to the
 * next task of its group, which then starts it (so its other tasks stay together); a task moved out
 * of a group keeps nothing of that chat.
 */
function withoutTasks(tasks: Task[], moving: Set<string>): Task[] {
  const rest: Task[] = [];
  let headMoved = false;
  for (const task of tasks) {
    const startsChat = task.newChat || rest.length === 0;
    if (moving.has(task.id)) {
      if (startsChat) headMoved = true;
      continue;
    }
    if (task.newChat) headMoved = false;
    rest.push(headMoved && !task.newChat ? { ...task, newChat: true } : task);
    headMoved = false;
  }
  return rest;
}

/**
 * The tasks a move takes, in queue order: only queued ones can move; several at once must be one
 * whole chat (a group card).
 */
function movingTasks(queue: Pick<Queue, "tasks">, ids: string[]): Task[] {
  const wanted = new Set(ids);
  const tasks = queue.tasks.filter((t) => wanted.has(t.id));
  if (!tasks.length || tasks.length !== wanted.size) throw new Error("There is no such task in this queue");
  if (tasks.some((t) => t.status !== "queued")) throw new Error("Only queued tasks can be moved");
  return tasks;
}

/** A slot's place in the list, top to bottom: a chat's end comes before the gap after its card. */
const slotOrder = (rest: Task[], slot: DropSlot) => {
  const k = slot.before ? rest.findIndex((t) => t.id === slot.before) : rest.length;
  return k * 2 + (slot.join ? 0 : 1);
};

/**
 * Where `ids` can be dropped, top to bottom. Never above or between running or finished tasks: only
 * after the last task that isn't queued. One task can join a chat (inside a card, or at its end) or
 * start its own (between cards); a whole chat only goes between cards, never into another chat.
 */
export function dropSlots(queue: Pick<Queue, "tasks">, ids: string[]): DropSlot[] {
  const moving = movingTasks(queue, ids);
  const rest = withoutTasks(queue.tasks, new Set(ids));
  const single = moving.length === 1;
  let lastFixed = -1;
  rest.forEach((t, i) => {
    if (t.status !== "queued") lastFixed = i;
  });
  const slots: DropSlot[] = [];
  for (let k = lastFixed + 1; k <= rest.length; k++) {
    const next = rest[k];
    const before = next?.id;
    if (next && !next.newChat) {
      // Inside a card: only a single task, which then continues that chat.
      if (single) slots.push({ before, join: true });
      continue;
    }
    if (single && k > 0) slots.push({ before, join: true });
    slots.push({ before, join: false });
  }
  return slots;
}

/** Where `ids` are now, as a slot (it may not be a valid drop slot, e.g. above a finished task). */
export function currentSlot(queue: Pick<Queue, "tasks">, ids: string[]): DropSlot {
  const moving = movingTasks(queue, ids);
  const first = moving[0]!;
  const i = queue.tasks.indexOf(first);
  const after = queue.tasks.slice(i).find((t) => !ids.includes(t.id));
  const rest = withoutTasks(queue.tasks, new Set(ids));
  const before = after && rest.find((t) => t.id === after.id);
  return { before: before?.id, join: i > 0 && !first.newChat };
}

/**
 * Moves `ids` (one task, or a whole chat) to `slot`, which must be one of `dropSlots`. The first moved
 * task starts its own chat unless the slot joins one; a chat's first task that moves away hands its
 * chat to its next task.
 */
export function moveTasks(queue: Queue, ids: string[], slot: DropSlot): Queue {
  const moving = movingTasks(queue, ids);
  const allowed = dropSlots(queue, ids);
  if (!allowed.some((s) => s.before === slot.before && s.join === slot.join))
    throw new Error("Tasks can only move among the queued tasks, below the ones that ran");
  const rest = withoutTasks(queue.tasks, new Set(ids));
  const at = slot.before ? rest.findIndex((t) => t.id === slot.before) : rest.length;
  const block = moving.map((t, i) => (i === 0 ? { ...t, newChat: !slot.join } : t));
  const tasks = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  return { ...queue, tasks };
}

/**
 * One step up or down (Alt+↑/↓, Move up/down) through the same slots a drag offers; Move to top and
 * bottom go to the first slot that starts a chat and to the end. Unchanged when it can't go further.
 */
export function stepTasks(queue: Queue, ids: string[], to: -1 | 1 | "top" | "bottom"): Queue {
  const slots = dropSlots(queue, ids);
  const rest = withoutTasks(queue.tasks, new Set(ids));
  const here = slotOrder(rest, currentSlot(queue, ids));
  const target =
    to === "top"
      ? slots.find((s) => !s.join)
      : to === "bottom"
        ? slots[slots.length - 1]
        : to === -1
          ? slots.filter((s) => slotOrder(rest, s) < here).pop()
          : slots.find((s) => slotOrder(rest, s) > here);
  if (!target || slotOrder(rest, target) === here) return queue;
  return moveTasks(queue, ids, target);
}

/** A finished task back in the queue (Run again): a new queued copy at the end, in a new chat. */
export function requeue(queue: Queue, id: string): Queue {
  const task = queue.tasks.find((t) => t.id === id);
  if (!task) return queue;
  return addTasks(queue, [{ prompt: task.prompt, title: task.title, attachments: task.attachments }], {
    projectId: task.projectId,
    newChat: true,
    permissionMode: task.permissionMode,
  });
}

/** Opens a run (Start) unless one is open. */
export function openRun(queue: Queue, at = new Date()): Queue {
  return queue.runId ? queue : { ...queue, runId: `r${at.getTime().toString(36)}` };
}

/** Closes the open run (the queue finished). */
export function closeRun(queue: Queue): Queue {
  if (!queue.runId) return queue;
  const { runId: _closed, ...rest } = queue;
  return rest;
}

/**
 * The history after a change of the queue: each run open before or after it gets the current state of
 * its tasks (tasks removed from the queue stay in the run as they were), newest run first. A run that
 * was open and isn't any more is finished at `at`. Runs without tasks aren't kept.
 */
export function recordRuns(
  history: Run[],
  before: Queue,
  after: Queue,
  at = new Date().toISOString(),
): Run[] {
  const ids = [...new Set([before.runId, after.runId].filter((id): id is string => !!id))];
  let next = history;
  for (const id of ids) {
    const tasks = after.tasks.filter((t) => t.runId === id);
    const old = next.find((r) => r.id === id);
    const merged = [...(old?.tasks ?? [])];
    for (const task of tasks) {
      const i = merged.findIndex((t) => t.id === task.id);
      if (i < 0) merged.push(task);
      else merged[i] = task;
    }
    if (!merged.length) continue;
    const startedAt =
      old?.startedAt ??
      tasks
        .map((t) => t.sentAt)
        .filter((s): s is string => !!s)
        .sort()[0] ??
      at;
    const finishedAt = after.runId === id ? undefined : (old?.finishedAt ?? at);
    const run: Run = { id, startedAt, ...(finishedAt ? { finishedAt } : {}), tasks: merged };
    if (old && JSON.stringify(old) === JSON.stringify(run)) continue;
    next = [run, ...next.filter((r) => r.id !== id)];
  }
  return next === history ? history : next.slice(0, HISTORY_LIMIT);
}

/**
 * The one queue Jig kept before queues were per project, split by project (D-248): each project's
 * tasks with the settings; tasks without a project go to `fallback`. Running state is not carried over.
 */
export function splitQueue(queue: Queue, fallback: string): Record<string, Queue> {
  const out: Record<string, Queue> = {};
  for (const task of queue.tasks) {
    const id = task.projectId ?? fallback;
    out[id] ??= { ...emptyQueue(), stopOnFailure: queue.stopOnFailure, seq: queue.seq };
    out[id].tasks.push({ ...task, projectId: id });
  }
  return out;
}

/** Joins a migrated queue into a project's: its tasks after the project's own, renumbered after them. */
export function joinQueues(into: Queue, from: Queue): Queue {
  if (!into.tasks.length) return { ...from, running: into.running, runId: into.runId };
  const shift = (id: string) => `t${Number(id.slice(1)) + into.seq}`;
  const ids = new Set(from.tasks.map((t) => t.id));
  const tasks = from.tasks.map((t) => ({
    ...t,
    id: shift(t.id),
    ...(t.from && ids.has(t.from) ? { from: shift(t.from) } : {}),
  }));
  return { ...into, seq: into.seq + from.seq, tasks: [...into.tasks, ...tasks] };
}

/** Every file the history's tasks use (kept as long as their run is). */
export function historyFiles(history: Run[]): string[] {
  return history.flatMap((r) => r.tasks.flatMap((t) => (t.attachments ?? []).map((a) => a.path)));
}

/** How a run went: tasks done, failed (failed, blocked or error) and in all. */
export function runOutcome(run: Run): { done: number; failed: number; total: number } {
  return {
    done: run.tasks.filter((t) => t.status === "done").length,
    failed: run.tasks.filter((t) => ["failed", "blocked", "error"].includes(t.status)).length,
    total: run.tasks.length,
  };
}

/**
 * Files no task uses any more (after tasks were removed or changed): `before`'s files that are not in
 * `after` and not in `keep` (files still in the Add tasks dialog, or kept by the history). To delete.
 */
export function unusedFiles(before: Queue, after: Queue, keep: string[] = []): string[] {
  const used = new Set([...keep, ...after.tasks.flatMap((t) => (t.attachments ?? []).map((a) => a.path))]);
  return [...new Set(before.tasks.flatMap((t) => (t.attachments ?? []).map((a) => a.path)))].filter(
    (p) => !used.has(p),
  );
}

/** What Claude is told in the chat running a task (each turn, while the task runs). */
export function taskContext(queue: Queue, sessionId: string): string {
  const task = queue.tasks.find((t) => t.sessionId === sessionId && isActive(t));
  if (!task) return "";
  const n = queue.tasks.indexOf(task) + 1;
  const waiting = queue.tasks.filter((t) => t.status === "queued");
  const shown = waiting.slice(0, MAX_QUEUED_IN_CONTEXT);
  return [
    `This chat is running task ${n} of ${queue.tasks.length} in the user's task queue: "${task.title}".`,
    "Do the task fully without stopping to ask unless you really must. When you are done, or can't go on,",
    "call the addon_tasks_report tool once: outcome (done, partial, failed or blocked), a short summary of",
    "what you did, notes the user should know (decisions, risks, anything surprising), and follow-up",
    "tasks you suggest (each a prompt that could be queued). The user reads these reports in a table.",
    ...(waiting.length
      ? [
          "Already queued, so never suggest these (or work they cover) as follow-ups, and leave their work to them:",
          ...shown.map((t) => `- ${t.title}${t.leftOut ? " (left out of this run)" : ""}`),
          ...(waiting.length > shown.length ? [`- … and ${waiting.length - shown.length} more`] : []),
        ]
      : []),
  ].join("\n");
}

/** Most queued tasks named in a running task's instructions. */
const MAX_QUEUED_IN_CONTEXT = 15;

export function counts(queue: Queue): {
  queued: number;
  /** Queued and ticked: what Start takes. */
  ready: number;
  finished: number;
  total: number;
} {
  return {
    queued: queue.tasks.filter((t) => t.status === "queued").length,
    ready: queue.tasks.filter(isReady).length,
    finished: queue.tasks.filter(isFinished).length,
    total: queue.tasks.length,
  };
}

/** How long a task ran (still running: until now), in ms; 0 before it starts. */
export function durationMs(task: Task, now = Date.now()): number {
  if (!task.sentAt) return 0;
  return Math.max(0, (task.finishedAt ? Date.parse(task.finishedAt) : now) - Date.parse(task.sentAt));
}

export function formatMs(ms: number): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function duration(task: Task, now = Date.now()): string {
  return task.sentAt ? formatMs(durationMs(task, now)) || "0s" : "";
}

/** The tasks of one chat, in queue order, with their place in the queue. */
export interface ChatGroup {
  tasks: Array<{ task: Task; index: number }>;
  /** The chat once it started (the first task with one). */
  sessionId?: string;
  chatTitle?: string;
  projectId?: string;
}

/**
 * The queue as chats: a task that starts its own chat (or comes first, or is in another project than
 * the one before) begins a group; the others join the group before, as they continue its chat.
 */
export function chatGroups(queue: Pick<Queue, "tasks">): ChatGroup[] {
  const groups: ChatGroup[] = [];
  queue.tasks.forEach((task, index) => {
    const last = groups[groups.length - 1];
    if (!last || task.newChat || last.projectId !== task.projectId)
      groups.push({ tasks: [], projectId: task.projectId });
    const group = groups[groups.length - 1]!;
    group.tasks.push({ task, index });
    if (!group.sessionId && task.sessionId) {
      group.sessionId = task.sessionId;
      group.chatTitle = task.chatTitle;
    }
    if (task.chatTitle && task.sessionId === group.sessionId) group.chatTitle = task.chatTitle;
  });
  return groups;
}

/** How many tasks are in each status, and the summed time and cost. */
export function tally(
  tasks: Task[],
  now = Date.now(),
): {
  byStatus: Partial<Record<TaskStatus, number>>;
  finished: number;
  ms: number;
  /** Undefined until a task has a cost (one that cost nothing has 0). */
  costUsd?: number;
} {
  const byStatus: Partial<Record<TaskStatus, number>> = {};
  let ms = 0;
  let costUsd: number | undefined;
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    ms += durationMs(t, now);
    if (t.costUsd !== undefined) costUsd = (costUsd ?? 0) + t.costUsd;
  }
  return { byStatus, finished: tasks.filter(isFinished).length, ms, costUsd };
}

/** One line per task for Claude (the list tool). */
export function listing(queue: Queue): string {
  if (!queue.tasks.length) return "The task queue is empty.";
  const lines = queue.tasks.map(
    (t, i) =>
      `${i + 1}. [${STATUS_LABEL[t.status]}${t.status === "queued" && t.leftOut ? ", left out" : ""}] ${t.title} (id ${t.id}${t.newChat ? "" : ", continues the previous chat"})` +
      (t.report ? ` — ${t.report.summary}` : ""),
  );
  return [`The task queue is ${queue.running ? "running" : "paused"}.`, ...lines].join("\n");
}
