import {
  type RunsOnSource as AnyRunsOnSource,
  modelLabel,
  PROVIDER_LABEL,
  parseModel,
  parseProvider,
  parseProviderChoice,
  providerFields,
  providerOfModel,
  TASK_MODELS,
  TASK_PROVIDERS,
  type TaskProvider,
} from "../../shared/providers";

// Who runs a task's chat (D-330): shared with the other add-ons that start chats (a workflow's AI step).
export {
  modelLabel,
  PROVIDER_LABEL,
  parseProviderChoice,
  providerOfModel,
  TASK_MODELS,
  TASK_PROVIDERS,
  type TaskProvider,
};

/**
 * The task queue: prompts Claude takes one after another, each reporting back how it went (outcome,
 * summary, notes, follow-ups) so the results read as a table instead of one long chat.
 */

export type Outcome = "done" | "partial" | "failed" | "blocked";
export type TaskStatus = "queued" | "running" | "needs_you" | Outcome | "no_report" | "error" | "skipped";
/** How a task's chat asks before changes; "bypassPermissions" (Don't ask) only when you pick it (D-363). */
export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions";
/** Why a task's chat waits for you: the kind of card pending in it. */
export type WaitingFor = "permission" | "question" | "plan" | "limit";

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
  /**
   * The chat's title (D-418). Queued, on a task that starts a chat: the short title it gets (written in
   * `CHAT_TITLE_STYLE`; the chat card's header, and the chat's name once it starts). Once the chat ran: its
   * real title, as it was when the task ended.
   */
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
  /**
   * A stop line right after it (D-398): the run stops once it has ended, and the line is used up, so the
   * next Start runs the next block. Only on a task that ends its chat (a line never splits a chat) and
   * that is queued (not parked) or running; `normalizeQueue` keeps that true.
   */
  stopAfter?: boolean;
  /**
   * Parked (D-369): an idea kept in the pool at the end of the queue. It never runs, no tick includes
   * it, the first parked task always starts a chat (a later one may continue it, D-396), and nothing
   * that isn't parked comes after it. Missing = not parked.
   */
  parked?: boolean;
  /** When the queue asked its chat for the report, after a turn ended without one (once per task). */
  nudgedAt?: string;
  /** When the queue told its chat to carry on, after Jig closed in the middle of its turn (once per task, D-394). */
  resumedAt?: string;
  /** Its report came after it was marked No report or Interrupted (`addon_tasks_report` with taskId). */
  reportedLate?: boolean;
  /**
   * Its chat reported it again after it ended (D-353), e.g. once the user followed up: when, and the
   * report the new one replaced (only the last one; the chat has the rest).
   */
  revised?: { at: string; from: TaskReport };
  /**
   * You marked it done by hand (D-356, D-391), after it ended in Error, without a report, Partly done,
   * Failed or Blocked: when, what it was, its error, and the report its chat gave (`report`, kept for
   * its details). Its report is yours now (`summary`: your note), not a chat's.
   */
  markedDone?: { at: string; was: TaskStatus; error?: string; report?: TaskReport };
  /** Jig closed while its chat worked on it (status error); it can still be reported late. */
  interrupted?: boolean;
  /** While it needs you: what its chat waits for (D-326). */
  waitingFor?: WaitingFor;
  /** Runs on this provider instead of the queue's choice (D-330); ignored when it continues a chat. */
  provider?: TaskProvider;
  /** A model of `provider` (a family alias like `opus` or `sol`, or an exact id); empty = its default. */
  model?: string;
  /** The provider and model its chat ran on: set when it starts, and when it ends on another (D-338). */
  ranOn?: TaskProvider;
  ranModel?: string;
  /** Its chat started on this provider and hit its plan limit, so another one finished it (D-338). */
  startedOn?: TaskProvider;
  /** Its chat waits for its plan's limit to reset at this time, then carries on by itself (D-338). */
  limitResetsAt?: string;
}

export interface Queue {
  tasks: Task[];
  running: boolean;
  stopOnFailure: boolean;
  seq: number;
  /** The open run: from Start until the queue finishes (pausing keeps it open). */
  runId?: string;
  /** "Runs on": the provider of the queue's new chats; none = the project's default (D-330). */
  provider?: TaskProvider;
  /**
   * "Runs on": a model of `provider` for its new chats (a family alias like `opus` or `sol`, or an exact
   * id); none = that provider's default (D-408). Only set with `provider`, never another provider's.
   */
  model?: string;
  /**
   * Paused by Jig, not by you (D-395): it was running when Jig closed to install an update, and starts
   * again by itself after the restart. Start or Pause clears it.
   */
  held?: { reason: "update"; at: string };
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
  /** Commands, subagents and monitors still running in the background. */
  background?: number;
  /** When you last stopped one of its turns or rejected a tool call in it. */
  userStoppedAt?: string;
  /** Jig closed in the middle of its last turn (D-394): when it noticed. */
  cutOffAt?: string;
  /** Messages waiting in its queue. */
  queued?: number;
  /** Who runs it now. */
  provider?: TaskProvider;
  model?: string;
  /** Its plan's limit stopped it (D-338): it hasn't finished. */
  limit?: { provider: TaskProvider; state: "ask" | "waiting" | "continuing"; resetsAt?: string };
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

/** The modes a task can run in; "bypassPermissions" comes only from your choice in a dialog (D-363). */
export const PERMISSION_MODES: PermissionMode[] = ["acceptEdits", "default", "plan", "bypassPermissions"];

/** A permission mode the view sent, checked: undefined for none, else one of `PERMISSION_MODES`. */
export function parsePermissionMode(value: unknown): PermissionMode | undefined {
  if (value === undefined || value === null) return undefined;
  if (!PERMISSION_MODES.includes(value as PermissionMode))
    throw new Error(`Unknown permission mode ${value}`);
  return value as PermissionMode;
}

export const emptyQueue = (): Queue => ({ tasks: [], running: false, stopOnFailure: true, seq: 0 });

export function isActive(task: Task): boolean {
  return task.status === "running" || task.status === "needs_you";
}

export function isFinished(task: Task): boolean {
  return !isActive(task) && task.status !== "queued";
}

/**
 * A task's code as the user and Jig see it (D-418): `TQ-195` for the stored id `t195` (TQ = task queue).
 * Ids stay stored as they are; only what the UI, the tools and the chats read is formatted.
 */
export function taskCode(id: string): string {
  const n = /^t(\d+)$/.exec(id)?.[1];
  return n ? `TQ-${n}` : id;
}

/**
 * The stored id a tool was given: `TQ-195`, `tq195`, `TQ 195`, `#195`, the old `t195` and a bare `195`
 * all name `t195`; anything else is kept as it is (so "There is no task …" names it).
 */
export function taskIdOf(value: string): string {
  const s = value.trim();
  const n = /^(?:tq[-_ ]?|t|#)?(\d+)$/i.exec(s)?.[1];
  return n ? `t${Number(n)}` : s;
}

/**
 * How a chat's title is written, every time (D-418): "<Area>: <what changes>", in sentence case, at most
 * about 60 characters, high-level, without detail like ids, builds, numbers or measurements. Said to Jig in
 * the add and edit tools, so the queue's chat headers read alike.
 */
export const CHAT_TITLE_STYLE =
  '"<Area>: <what changes>" in sentence case, about 60 characters at most, high-level (what the chat is about, not the first task\'s wording), no ids, build numbers, measurements or trailing detail; e.g. "Tasks: clearer queue rows" or "Login: fix the expired-session redirect"';

/** A chat title as given (tool or dialog): one line, trimmed, at most 80 characters; undefined when empty. */
export function cleanChatTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const line = value.trim().split("\n")[0]!.trim();
  return line ? line.slice(0, 80) : undefined;
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
  /** Goes into the parked pool instead of the queue. */
  parked?: boolean;
  title?: string;
  /** The title of the chat it starts (D-418); ignored on a task that continues a chat. */
  chatTitle?: string;
  newChat?: boolean;
  attachments?: TaskFile[];
  provider?: TaskProvider;
  model?: string;
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
    /** Every task goes into the parked pool (D-369). */
    parked?: boolean;
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
        ...(cleanChatTitle(item.chatTitle) ? { chatTitle: cleanChatTitle(item.chatTitle) } : {}),
        ...(item.attachments?.length ? { attachments: item.attachments } : {}),
        projectId: options.projectId,
        newChat: item.newChat ?? options.newChat,
        permissionMode: options.permissionMode,
        status: "queued",
        ...(options.from ? { from: options.from } : {}),
        ...(options.addedBy ? { addedBy: options.addedBy } : {}),
        ...providerFields(item.provider, item.model),
        ...(options.parked || item.parked ? { parked: true } : {}),
      }),
    );
  // New tasks land before the pool; new parked ones at its end.
  return { ...queue, seq, tasks: poolLast([...queue.tasks, ...added]) };
}

/** A task in the parked pool: queued, kept as an idea, never run (D-369). */
export const isParked = (task: Task): boolean => task.status === "queued" && !!task.parked;

/**
 * The tasks with the parked pool at the end (D-369): the others in their order, then the parked ones in
 * theirs. Every change of the queue keeps this, so nothing that isn't parked comes after a parked task.
 * A parked task may continue the parked one before it (a parked chat, D-396), but the pool's first
 * always starts a chat, so no parked task continues a chat of the queue.
 */
export function poolLast(tasks: Task[]): Task[] {
  const pool = tasks.filter(isParked);
  if (!pool.length) return tasks;
  const rest = tasks.filter((t) => !isParked(t));
  const first = pool[0]!;
  if (!first.newChat) pool[0] = { ...first, newChat: true };
  const sorted = [...rest, ...pool];
  return sorted.every((t, i) => t === tasks[i]) ? tasks : sorted;
}

/**
 * Parks queued tasks (to the end of the pool) or unparks them (to the end of the queue before the
 * pool, after any stop line there). Tasks that continue each other's chat and go together stay one
 * chat (parking or unparking a whole chat, D-396); the first of them, and any other task that goes
 * alone, starts its own chat. A chat's first task that goes hands its chat to the next one, as a move
 * does. Throws, changing nothing, when one isn't queued.
 */
export function setParked(queue: Queue, ids: string[], parked: boolean): Queue {
  const wanted = new Set(ids);
  if (!wanted.size) throw new Error("Give at least one task to park or unpark");
  for (const id of wanted) {
    const task = queue.tasks.find((t) => t.id === id);
    if (!task) throw new Error(`There is no task ${taskCode(id)} in this queue`);
    if (task.status !== "queued")
      throw new Error(
        `Task ${taskCode(id)} is ${STATUS_LABEL[task.status].toLowerCase()}; only queued tasks can be ${parked ? "parked" : "unparked"}`,
      );
  }
  const changing = queue.tasks.filter((t) => wanted.has(t.id) && !!t.parked !== parked);
  if (!changing.length) return queue;
  const rest = withoutTasks(queue.tasks, new Set(changing.map((t) => t.id)));
  const going = new Set(changing.map((t) => t.id));
  const moved = changing.map((t): Task => {
    const { parked: _p, stopAfter: _s, ...plain } = t;
    // Stays in its chat only when the task before it goes too.
    const before = queue.tasks[queue.tasks.indexOf(t) - 1];
    const newChat = t.newChat || !before || !going.has(before.id);
    return parked ? { ...plain, parked: true, newChat } : { ...plain, newChat };
  });
  const firstParked = rest.findIndex(isParked);
  const at = parked || firstParked < 0 ? rest.length : firstParked;
  return normalizeQueue({ ...queue, tasks: [...rest.slice(0, at), ...moved, ...rest.slice(at)] });
}

/** A queued task Start can take: queued and not parked. */
export const isReady = (task: Task): boolean => task.status === "queued" && !task.parked;

/** The next task to run: the first queued one, unless one is still running. */
export function nextTask(queue: Queue): Task | undefined {
  if (queue.tasks.some(isActive)) return undefined;
  return queue.tasks.find(isReady);
}

// Stop lines (D-398): a divider between two tasks where a run pauses. A line is the flag `stopAfter` on
// the task above it, so it stays put when tasks are moved around it (`withoutTasks`, `moveTasks`).

/** A stop line that still counts: after a queued (not parked) or a running task. */
export const hasStopLine = (task: Task): boolean => !!task.stopAfter && (isReady(task) || isActive(task));

/**
 * The queued tasks Start takes: from the top until the next stop line (included: the task above it is
 * the last of the block). A line after the running task leaves none: the run stops when it ends.
 */
export function runBlock(queue: Pick<Queue, "tasks">): Task[] {
  const block: Task[] = [];
  for (const t of queue.tasks) {
    if (isReady(t)) block.push(t);
    if (hasStopLine(t)) break;
  }
  return block;
}

/**
 * The queue as it should be stored: stop lines only where they mean something. A line sits after the end
 * of a chat (one that would split a chat snaps to its end, `snap`), after a queued or running task; one
 * after a finished task is used up, except while the queue runs, when `advance` is about to take it
 * (`passStops`). Tasks of queues saved before stop lines may carry the old tick (`leftOut`): they are
 * plain queued tasks now (D-398).
 */
export function normalizeQueue(queue: Queue): Queue {
  const tasks = queue.tasks.map((t) => {
    const { leftOut: _old, ...rest } = t as Task & { leftOut?: boolean };
    return "leftOut" in t ? rest : t;
  });
  const flag = (i: number, on: boolean) => {
    const { stopAfter: _was, ...plain } = tasks[i]!;
    tasks[i] = on ? { ...plain, stopAfter: true } : plain;
  };
  tasks.forEach((t, i) => {
    if (!hasStopLine(t)) return;
    let end = i;
    while (tasks[end + 1] && !tasks[end + 1]!.newChat) end++;
    if (end === i) return;
    flag(i, false);
    flag(end, true);
  });
  tasks.forEach((t, i) => {
    if (t.stopAfter && !hasStopLine(t) && !(queue.running && isFinished(t))) flag(i, false);
  });
  return tasks.every((t, i) => t === queue.tasks[i]) ? queue : { ...queue, tasks };
}

/**
 * A stop line after a task, or none (`on` false): the line goes to the end of the task's chat. Only a
 * queued or running task can have one; a parked idea never runs, a finished one is behind the queue.
 */
export function setStop(queue: Queue, id: string, on: boolean): Queue {
  const task = queue.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`There is no task ${taskCode(id)} in this queue`);
  if (task.parked)
    throw new Error(
      `Task ${taskCode(id)} is parked, so it never runs: a stop line goes among the queued tasks`,
    );
  if (!isReady(task) && !isActive(task))
    throw new Error(
      `Task ${taskCode(id)} is ${STATUS_LABEL[task.status].toLowerCase()}; a stop line goes after a queued or running task`,
    );
  const chat = chatOf(queue, id);
  const end = chat[chat.length - 1]!;
  const tasks = queue.tasks.map((t) => {
    if (!chat.includes(t.id)) return t;
    const { stopAfter: _was, ...plain } = t;
    return on && t.id === end ? { ...plain, stopAfter: true } : plain;
  });
  return normalizeQueue({ ...queue, tasks });
}

/** A stop line taken from after one task and put after another (dragging a line). */
export function moveStop(queue: Queue, from: string, to: string): Queue {
  const source = queue.tasks.find((t) => t.id === from);
  if (!source || !hasStopLine(source)) throw new Error(`There is no stop line after task ${from}`);
  if (from === to) return queue;
  return setStop(setStop(queue, from, false), to, true);
}

/**
 * The run reached a stop line: the lines after tasks that ended are used up (they are taken off), and
 * `hit` says whether one was there. Called when no task is running (`advance`) and by Start, so a Start
 * after a pause or a failure never stops at a line it had already passed.
 */
export function passStops(queue: Queue): { queue: Queue; hit: boolean } {
  let hit = false;
  const tasks = queue.tasks.map((t) => {
    if (!t.stopAfter || !isFinished(t)) return t;
    hit = true;
    const { stopAfter: _used, ...rest } = t;
    return rest;
  });
  return hit ? { queue: { ...queue, tasks }, hit } : { queue, hit };
}

/** A task as if it never ran: queued again in its place, its chat, times, cost and report gone. */
export function resetTask(task: Task): Task {
  const {
    sessionId: _s,
    chatTitle,
    sentAt: _sent,
    finishedAt: _f,
    costAtStart: _ca,
    costUsd: _cost,
    sawBusy: _b,
    report: _r,
    answer: _a,
    error: _e,
    runId: _run,
    ranOn: _ranOn,
    ranModel: _ranModel,
    startedOn: _startedOn,
    limitResetsAt: _resets,
    ...rest
  } = task;
  // A task that starts its chat keeps the chat's title for when it runs again (D-418).
  return { ...rest, ...(task.newChat && chatTitle ? { chatTitle } : {}), status: "queued" };
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

/**
 * How long an idle chat with work still running in the background (a dev server, a long build) keeps
 * its task open before the queue asks it for the report anyway (D-318).
 */
export const BACKGROUND_WAIT_MS = 20 * 60_000;

/** The queue's last message to the task's chat: the task, its "carry on" or its request for the report. */
const lastSent = (task: Task) => task.nudgedAt ?? task.resumedAt ?? task.sentAt;

/** The chat answered since the queue's last message to it. */
function answeredSince(task: Task, chat: ChatState): boolean {
  const since = lastSent(task);
  return !!task.sawBusy || !!(chat.lastAnswerAt && since && chat.lastAnswerAt >= since);
}

/**
 * Whether the chat finished the task's turn: idle (or failed) after working on it, with nothing left
 * running in the background. A command or subagent still running wakes the chat when it ends, so the
 * task stays open until then, or until `BACKGROUND_WAIT_MS` passed since the last answer (D-318). A
 * question or permission waiting for you is `needs_you`, never finished.
 */
export function chatFinished(task: Task, chat: ChatState, now = Date.now()): boolean {
  // Stopped by its plan's limit: it waits for you, for the reset, or carries on elsewhere (D-338).
  if (chat.limit) return false;
  if (chat.status === "error") return true;
  if (chat.status !== "idle" || !answeredSince(task, chat)) return false;
  if (chat.background && !task.nudgedAt) {
    const last = Date.parse(chat.lastAnswerAt ?? task.sentAt ?? "");
    if (!(now - last >= BACKGROUND_WAIT_MS)) return false;
  }
  return true;
}

/** Idle without an answer since the task was sent: Jig closed before the chat got to it. */
export function interruptedTurn(task: Task, chat: ChatState): boolean {
  return chat.status === "idle" && !chat.background && !chat.queued && !answeredSince(task, chat);
}

/** You stopped one of the task's turns or rejected a tool call in it. */
const userStopped = (task: Task, chat: ChatState) =>
  !!(chat.userStoppedAt && task.sentAt && chat.userStoppedAt >= task.sentAt);

/**
 * Jig closed in the middle of the task's turn (D-394): the chat is idle again and says its last turn
 * was cut off after the queue's last message to it.
 */
export function cutOffTurn(task: Task, chat: ChatState): boolean {
  const since = lastSent(task);
  return chat.status === "idle" && !chat.limit && !!(chat.cutOffAt && since && chat.cutOffAt >= since);
}

/** What the queue does next with a running task's chat: see `afterTurn`. */
export type TurnStep = "wait" | "resume" | "nudge" | "finish" | "interrupted";

/**
 * What the queue does when a task's chat stops working (D-318, D-394), in this order:
 * - `resume`: Jig closed in the middle of the task's work (a quit, an update's restart). Tell the chat
 *   once to carry on and report (`resumedAt`), unless you stopped one of its turns yourself or the
 *   queue already asked for the report.
 * - `wait`: not finished yet (busy, work in the background, a plan limit).
 * - `finish`: record it: a report, a failed chat, a turn without one after the queue asked for it, or
 *   you stopped a turn or rejected a tool call yourself, so nothing restarts work you stopped.
 * - `nudge`: it ended without a report: ask once for it, never for more work. Also a second cut-off
 *   after it was told to carry on, once it had answered.
 * - `interrupted`: only when the queue catches up on its chats (`catchingUp`: its watcher, the view's
 *   read), idle without having answered at all since the queue's last message (Jig closed before the
 *   chat got to it, or a second cut-off before it answered): Interrupted, reportable late. A chat's own
 *   status change waits instead: the message it was just sent may not have started its turn yet.
 */
export function afterTurn(task: Task, chat: ChatState, now = Date.now(), catchingUp = false): TurnStep {
  if (cutOffTurn(task, chat) && !task.resumedAt && !task.nudgedAt && !task.report && !userStopped(task, chat))
    return "resume";
  if (!chatFinished(task, chat, now))
    return catchingUp && interruptedTurn(task, chat) ? "interrupted" : "wait";
  if (task.report || chat.status === "error" || task.nudgedAt) return "finish";
  if (userStopped(task, chat)) return "finish";
  return "nudge";
}

/** The message that tells a task's chat to carry on after Jig closed in the middle of its turn (D-394). */
export function resumeText(queue: Pick<Queue, "tasks">, task: Task): string {
  const n = queue.tasks.findIndex((t) => t.id === task.id) + 1;
  return [
    `Jig restarted while you were working on task ${n} (taskId "${taskCode(task.id)}"), so your last turn was cut off.`,
    "Carry on where you left off (check what was already done first), then report with addon_tasks_report.",
  ].join(" ");
}

/** The line the chat's transcript shows for that message. */
export function resumeFrom(_queue: Pick<Queue, "tasks">, task: Task): string {
  return `Task queue: Jig restarted, carry on with task ${taskCode(task.id)}`;
}

/** The message that asks a chat for a task's report: only the report, never more work (D-318). */
export function nudgeText(queue: Pick<Queue, "tasks">, task: Task): string {
  const n = queue.tasks.findIndex((t) => t.id === task.id) + 1;
  return [
    `The task queue asks for the report of task ${n} ("${task.title}", taskId "${taskCode(task.id)}").`,
    `If it's done, call addon_tasks_report with taskId "${taskCode(task.id)}".`,
    "If the work isn't finished, call it anyway with outcome partial or blocked and a one-line summary of where it stands.",
    "Don't continue the task's work unless the user asks.",
  ].join(" ");
}

/** The line the chat's transcript shows for that message. */
export function nudgeFrom(_queue: Pick<Queue, "tasks">, task: Task): string {
  return `Task queue: asked for the report of task ${taskCode(task.id)}`;
}

/** A task that ended without a report and can still get one: No report, or Interrupted by Jig closing. */
export function canReportLate(task: Task): boolean {
  return (
    task.status === "no_report" ||
    (task.status === "error" && (!!task.interrupted || !!task.error?.startsWith("Interrupted")))
  );
}

/** The statuses a task can be marked done from by hand (D-356, D-391). */
const MARKABLE: TaskStatus[] = ["error", "no_report", "partial", "failed", "blocked"];

/**
 * A task you can mark done by hand (D-356, D-391): it ended in Error or without a report (e.g. its
 * chat did the work and hit its plan's limit before reporting), or Partly done, Failed or Blocked
 * while the rest of its work got done elsewhere (e.g. in a follow-up task).
 */
export function canMarkDone(task: Task): boolean {
  return isFinished(task) && MARKABLE.includes(task.status);
}

/** What a task marked done by hand says when you leave the note empty. */
export const MARKED_DONE_SUMMARY = "Marked as done by you.";

/**
 * Marks a task done by hand (D-356): status Done, a report whose summary is your note (or
 * `MARKED_DONE_SUMMARY`), keeping its times and cost, and `markedDone` with what it was, its error and
 * its chat's report (D-391). Throws when it can't be (`canMarkDone`). Its own chat may still report it
 * later (a revision, D-353).
 */
export function markDone(queue: Queue, id: string, note = "", at = new Date().toISOString()): Queue {
  const task = queue.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`There is no task ${taskCode(id)} in this queue`);
  if (!canMarkDone(task))
    throw new Error(
      `Task ${taskCode(id)} is ${STATUS_LABEL[task.status].toLowerCase()}; only a task that ended in Error, without a report, Partly done, Failed or Blocked can be marked done`,
    );
  const { error, interrupted: _interrupted, waitingFor: _waiting, limitResetsAt: _reset, ...rest } = task;
  const summary = note.trim().split("\n")[0]!.trim().slice(0, 500) || MARKED_DONE_SUMMARY;
  const done: Task = {
    ...rest,
    status: "done",
    report: { outcome: "done", summary, notes: [], followUps: [] },
    markedDone: {
      at,
      was: task.status,
      ...(error ? { error } : {}),
      ...(task.report ? { report: task.report } : {}),
    },
  };
  return { ...queue, tasks: queue.tasks.map((t) => (t.id === id ? done : t)) };
}

/** A task that ended with a report, which its chat may replace (D-353). */
export function canRevise(task: Task): boolean {
  return !!task.report && isFinished(task) && task.status !== "skipped";
}

/** This chat's tasks that still miss their report, in queue order. */
export function unreported(queue: Pick<Queue, "tasks">, sessionId: string): Task[] {
  return queue.tasks.filter((t) => t.sessionId === sessionId && canReportLate(t));
}

const named = (queue: Pick<Queue, "tasks">, t: Task) =>
  `task ${queue.tasks.indexOf(t) + 1} "${t.title}" (taskId "${taskCode(t.id)}")`;

/**
 * Which task a chat's `addon_tasks_report` is for (D-318, D-353). With `taskId`: that task, when this
 * chat ran it and it is still running, misses its report, or ended with one (a revision); never
 * another chat's. Without: the chat's running task while it has no report; once it has one, the
 * chat's earliest task still missing one (a late report never lands on a newer task); with no running
 * task, the most recent one missing it, or else the chat's last reported task (a revision).
 */
export function reportTarget(queue: Pick<Queue, "tasks">, sessionId: string, taskId?: string): Task {
  const active = queue.tasks.find((t) => t.sessionId === sessionId && isActive(t));
  if (taskId) {
    const task = queue.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`There is no task ${taskCode(taskId)} in this chat's queue`);
    if (task.sessionId !== sessionId)
      throw new Error(
        `Task ${taskCode(taskId)} didn't run in this chat; a chat can only report its own tasks`,
      );
    if (task === active || canReportLate(task) || canRevise(task)) return task;
    throw new Error(
      `Task ${taskCode(taskId)} is ${STATUS_LABEL[task.status].toLowerCase()}; only a task that ran in this chat can be reported`,
    );
  }
  if (active && !active.report) return active;
  const missing = unreported(queue, sessionId);
  if (missing.length) return active ? missing[0]! : missing[missing.length - 1]!;
  if (active) return active;
  const last = queue.tasks.filter((t) => t.sessionId === sessionId && canRevise(t)).pop();
  if (last) return last;
  throw new Error("This chat isn't running a task from the task queue; there is nothing to report.");
}

/**
 * A report on `task`: a running task keeps running with it (its status comes when the chat ends). A
 * late one sets the status from the outcome and keeps the task's times and cost, marked
 * `reportedLate`; a revision (D-353) does the same for a task that ended with a report, keeping the
 * one it replaces in `revised`. A late or revised failed or blocked report pauses a running queue
 * when "stop when a task fails" is on, as an on-time one would, unless the chat already went on with
 * a later task (D-318); no report ever starts or un-pauses the queue.
 */
export function applyReport(
  queue: Queue,
  task: Task,
  report: TaskReport,
  at = new Date().toISOString(),
): { queue: Queue; late: boolean; revised: boolean; pause: boolean } {
  const swap = (q: Queue, t: Task): Queue => ({ ...q, tasks: q.tasks.map((x) => (x.id === t.id ? t : x)) });
  if (isActive(task))
    return { queue: swap(queue, { ...task, report }), late: false, revised: false, pause: false };
  const revised = canRevise(task);
  const { error: _error, interrupted: _interrupted, ...rest } = task;
  const done: Task = revised
    ? { ...rest, report, status: report.outcome, revised: { at, from: task.report! } }
    : { ...rest, report, status: report.outcome, reportedLate: true };
  const next = swap(queue, done);
  const index = queue.tasks.findIndex((t) => t.id === task.id);
  const movedOn = queue.tasks.slice(index + 1).some((t) => t.sessionId && t.sessionId === task.sessionId);
  // A task you marked done stays done for the queue: its chat's failed or blocked revision doesn't
  // pause it (D-391).
  const pause = queue.running && shouldPause(next, done) && !movedOn && !task.markedDone;
  return { queue: pause ? { ...next, running: false } : next, late: !revised, revised, pause };
}

/**
 * Said before a task sent into a chat whose earlier tasks still miss their report, so the chat
 * reports those first, by id (D-318). Empty when none do.
 */
export function pendingReportsNote(queue: Pick<Queue, "tasks">, sessionId: string): string {
  const missing = unreported(queue, sessionId);
  if (!missing.length) return "";
  const one = missing.length === 1;
  return `Before this task: ${missing.map((t) => named(queue, t)).join(", ")} in this chat ${
    one ? "has" : "have"
  } no report yet. Report ${one ? "it" : "each"} first with addon_tasks_report and its taskId, then do this task.`;
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
    costUsd: taskCost(task, chat),
    ...(!task.report && chat.lastAnswer ? { answer: chat.lastAnswer.slice(0, 4000) } : {}),
    ...(chat.status === "error" && chat.error ? { error: chat.error } : {}),
    ...finishedOn(task, chat),
  };
}

/**
 * What a finished task cost: the growth of its chat's cost. On ChatGPT that's an estimate at OpenAI API
 * prices (D-414); nothing there means its model has no known price, so the task has no cost ("—"),
 * not $0.00.
 */
export function taskCost(task: Task, chat: ChatState): number | undefined {
  const cost = Math.max(0, chat.costUsd - (task.costAtStart ?? 0));
  return cost === 0 && (chat.provider ?? task.ranOn) === "chatgpt" ? undefined : cost;
}

/** The provider that finished a task, when its chat continued with another after a limit (D-338). */
function finishedOn(task: Task, chat: ChatState): Partial<Task> {
  if (!chat.provider || !task.ranOn || chat.provider === task.ranOn) return {};
  return {
    ranOn: chat.provider,
    ...(chat.model ? { ranModel: chat.model } : { ranModel: undefined }),
    startedOn: task.startedOn ?? task.ranOn,
  };
}

/**
 * A task's chat its plan's limit stopped (D-338): with `ask` it needs you (the limit card), otherwise
 * it keeps running while the chat waits for the reset or carries on with the other provider.
 */
export function limitedTask(task: Task, limit: NonNullable<ChatState["limit"]>): Task {
  const { waitingFor: _was, limitResetsAt: _at, ...rest } = task;
  if (limit.state === "ask") return { ...rest, status: "needs_you", sawBusy: true, waitingFor: "limit" };
  return {
    ...rest,
    status: "running",
    sawBusy: true,
    ...(limit.state === "waiting" && limit.resetsAt ? { limitResetsAt: limit.resetsAt } : {}),
  };
}

/**
 * How long a queue held for an update stays held while Jig keeps running: the install didn't happen
 * (cancelled, failed), so it starts again rather than wait forever (D-395).
 */
export const UPDATE_HOLD_MS = 5 * 60_000;

/** Jig closes to install an update (D-395): a running queue pauses, remembering to start again. */
export function holdForUpdate(queue: Queue, at = new Date().toISOString()): Queue {
  return queue.running ? { ...queue, running: false, held: { reason: "update", at } } : queue;
}

/**
 * A queue held for an update starts again: after the restart (`restarted`: this Jig didn't hold it),
 * or once `UPDATE_HOLD_MS` passed without one. Otherwise it stays as it is.
 */
export function releaseHold(queue: Queue, restarted: boolean, now = Date.now()): Queue {
  if (!queue.held) return queue;
  if (!restarted && now - Date.parse(queue.held.at) < UPDATE_HOLD_MS) return queue;
  const { held: _held, ...rest } = queue;
  return { ...rest, running: true };
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
 * Checks the tasks Claude passes to the add tool: strings, or `{ title?, prompt, newChat?, provider?,
 * model? }`. At most 50 at once; a prompt must say what to do on its own (it may run in a new chat).
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
        ...(cleanChatTitle(o.chatTitle) ? { chatTitle: cleanChatTitle(o.chatTitle) } : {}),
        ...(typeof o.newChat === "boolean" ? { newChat: o.newChat } : {}),
        ...parseProviderChoice(o, `"${prompt.slice(0, 40)}"`),
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
  /** The title of the chat it starts (D-418); null takes it away (the header shows the task's title). */
  chatTitle?: string | null;
  /** Replaces the prompt. */
  prompt?: string;
  /** Added to the prompt as a new paragraph. */
  append?: string;
  /**
   * Parks it (to the pool at the end) or unparks it (to the end of the queue, before the pool); with
   * `wholeChat` its whole chat, kept together.
   */
  parked?: boolean;
  /**
   * True puts a stop line after it (after its chat's last task: a line never splits a chat), false takes
   * that line away (D-398). Works on a running task too.
   */
  stopAfter?: boolean;
  /** False continues the chat of the task before it, true starts a new one. */
  newChat?: boolean;
  /** Moves the task (or with `wholeChat` its whole chat) by the Queue tab's rules (D-307). */
  moveTo?: MoveTo;
  /** `moveTo` or `parked` takes every task of the task's chat, as dragging a chat card's header does. */
  wholeChat?: boolean;
  /** Its own provider; null = the queue's choice (D-330). */
  provider?: TaskProvider | null;
  /** A model of its provider; null = the provider's default. */
  model?: string | null;
}

/** Where Claude moves a queued task (`addon_tasks_edit`). */
export type MoveTo = "top" | "bottom" | { after: string } | { before: string };

function parseMoveTo(value: unknown, id: string): MoveTo {
  if (value === "top" || value === "bottom") return value;
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (typeof o.after === "string" && o.after.trim()) return { after: taskIdOf(o.after) };
  if (typeof o.before === "string" && o.before.trim()) return { before: taskIdOf(o.before) };
  throw new Error(
    `moveTo for task ${taskCode(id)} must be "top", "bottom", { after: <task id> } or { before: <task id> }`,
  );
}

export function parseTaskEdits(value: unknown): TaskEdit[] {
  const items = Array.isArray(value) ? value : [];
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const edits = items.map((item): TaskEdit => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const given = text(o.id);
    if (!given) throw new Error("Each edit needs the task's id (addon_tasks_list shows them)");
    const id = taskIdOf(given);
    const edit: TaskEdit = { id };
    const title = text(o.title);
    if (title) edit.title = title.slice(0, 120);
    if (o.chatTitle === null || o.chatTitle === "") edit.chatTitle = null;
    else if (cleanChatTitle(o.chatTitle)) edit.chatTitle = cleanChatTitle(o.chatTitle);
    const prompt = text(o.prompt);
    if (prompt) edit.prompt = prompt;
    const append = text(o.append);
    if (append) edit.append = append;
    if (typeof o.stopAfter === "boolean") edit.stopAfter = o.stopAfter;
    if (typeof o.parked === "boolean") edit.parked = o.parked;
    if (typeof o.newChat === "boolean") edit.newChat = o.newChat;
    if (o.moveTo !== undefined && o.moveTo !== null) edit.moveTo = parseMoveTo(o.moveTo, id);
    if (o.wholeChat === true) {
      if (!edit.moveTo && edit.parked === undefined)
        throw new Error(`wholeChat for task ${taskCode(id)} needs a moveTo or parked`);
      edit.wholeChat = true;
    }
    // "default" (or null) goes back to the queue's choice; a null model to the provider's default.
    const choice = parseProviderChoice(
      { provider: o.provider === "default" ? undefined : o.provider, model: o.model },
      `task ${taskCode(id)}`,
    );
    if (o.provider === null || o.provider === "default") edit.provider = null;
    else if (choice.provider) edit.provider = choice.provider;
    if (o.model === null || o.model === "") edit.model = null;
    else if (choice.model) edit.model = choice.model;
    if (Object.keys(edit).length === 1) throw new Error(`Say what to change in task ${taskCode(id)}`);
    return edit;
  });
  if (!edits.length) throw new Error("Give at least one task to change");
  return edits;
}

/**
 * Applies edits to queued tasks only, one after another; the queue's own state (running, statuses,
 * reports) is left as it is, so this is safe while the queue runs. Throws, changing nothing, when a
 * task isn't queued or a change breaks the Queue tab's rules (`setNewChat`, `moveTo`).
 */
export function editTasks(queue: Queue, edits: TaskEdit[]): Queue {
  const byId = new Map(queue.tasks.map((t) => [t.id, t]));
  for (const e of edits) {
    const task = byId.get(e.id);
    if (!task) throw new Error(`There is no task ${taskCode(e.id)} in this queue`);
    // A stop line may also go after the running task ("stop after t160").
    if (isActive(task) && Object.keys(e).every((k) => k === "id" || k === "stopAfter")) continue;
    if (task.status !== "queued")
      throw new Error(
        `Task ${taskCode(e.id)} is ${STATUS_LABEL[task.status].toLowerCase()}; only queued tasks can be changed`,
      );
  }
  let next = queue;
  for (const e of edits) {
    next = {
      ...next,
      tasks: next.tasks.map((t) => {
        if (t.id !== e.id) return t;
        let prompt = e.prompt ?? t.prompt;
        if (e.append) prompt = prompt ? `${prompt}\n\n${e.append}` : e.append;
        const { chatTitle: _old, ...rest } = t;
        const chatTitle = e.chatTitle === undefined ? t.chatTitle : (e.chatTitle ?? undefined);
        return setProviderChoice(
          { ...rest, prompt, ...(e.title ? { title: e.title } : {}), ...(chatTitle ? { chatTitle } : {}) },
          e.provider,
          e.model,
        );
      }),
    };
    if (e.parked !== undefined) {
      // A whole chat goes together, its queued tasks (D-396); a task alone starts its own chat.
      const ids = e.wholeChat
        ? chatOf(next, e.id).filter((id) => next.tasks.find((t) => t.id === id)?.status === "queued")
        : [e.id];
      next = setParked(next, ids, e.parked);
    }
    if (e.moveTo) next = moveTo(next, e.id, e.moveTo, { newChat: e.newChat, wholeChat: e.wholeChat });
    else if (e.wholeChat && e.newChat !== undefined)
      throw new Error(
        `wholeChat for task ${taskCode(e.id)} can't change newChat: it only goes with parked or moveTo`,
      );
    else if (e.newChat !== undefined) next = setNewChat(next, e.id, e.newChat);
    if (e.stopAfter !== undefined) next = setStop(next, e.id, e.stopAfter);
  }
  checkProviderChoices(
    next,
    edits.filter((e) => e.provider || e.model).map((e) => e.id),
  );
  return next;
}

/**
 * Whether a queued task starts its own chat (true) or continues the chat of the task before it, as the
 * edit dialog's "Continue the chat of the task before" switch does. The task right after a running or
 * finished one may continue that chat (a drag can drop it there too); the first task in the queue has
 * no chat before it, so it can't. The tasks after it that continue its chat go with it.
 */
export function setNewChat(queue: Queue, id: string, newChat: boolean): Queue {
  const index = queue.tasks.findIndex((t) => t.id === id);
  const task = queue.tasks[index];
  if (!task) throw new Error(`There is no task ${taskCode(id)} in this queue`);
  if (task.status !== "queued")
    throw new Error(`Task ${taskCode(id)} has started; only queued tasks can be changed`);
  if (!newChat && task.parked && !queue.tasks[index - 1]?.parked)
    throw new Error(
      `Task ${taskCode(id)} is the first parked task, so there is no parked chat before it to continue: a parked task never continues a chat of the queue`,
    );
  if (!newChat && index === 0)
    throw new Error(
      `Task ${taskCode(id)} is the first in the queue, so there is no chat before it to continue`,
    );
  // A stop line before a task that now continues the chat above it moves to that chat's end.
  return normalizeQueue({ ...queue, tasks: queue.tasks.map((t) => (t.id === id ? { ...t, newChat } : t)) });
}

/** The ids of the chat a task is in (a chat card), in queue order. */
export function chatOf(queue: Pick<Queue, "tasks">, id: string): string[] {
  const group = chatGroups(queue).find((g) => g.tasks.some((x) => x.task.id === id));
  return group ? group.tasks.map((x) => x.task.id) : [id];
}

/**
 * Moves a queued task, or its whole chat (`wholeChat`), to the top, the bottom, or before or after
 * another task, through the slots a drag offers (`dropSlots`, D-307): never above or between tasks
 * that ran. A task that lands inside a chat continues it; between chats it starts its own, unless
 * `newChat` is false (it then continues the chat above: the end of that chat, or the task that ran
 * last). A whole chat only lands between chats. Throws with the reason when the place isn't allowed.
 */
export function moveTo(
  queue: Queue,
  id: string,
  to: MoveTo,
  options: { newChat?: boolean; wholeChat?: boolean } = {},
): Queue {
  if (!queue.tasks.some((t) => t.id === id))
    throw new Error(`There is no task ${taskCode(id)} in this queue`);
  const ids = options.wholeChat ? chatOf(queue, id) : [id];
  if (options.wholeChat && options.newChat === false)
    throw new Error("A whole chat only moves between chats; it can't continue another chat");
  // A task stays on its side of the parked pool's divider: parking and unparking are their own change.
  const parked = !!queue.tasks.find((t) => t.id === id)?.parked;
  const slots = dropSlots(queue, ids).filter((s) => !!s.parked === parked);
  const join = options.newChat === false;
  const rest = withoutTasks(queue.tasks, new Set(ids));
  const what = options.wholeChat ? `The chat of task ${taskCode(id)}` : `Task ${taskCode(id)}`;
  let slot: DropSlot | undefined;
  // The top continues a chat only right below the tasks that ran (the first slot), never further down.
  if (to === "top") slot = join ? (slots[0]?.join ? slots[0] : undefined) : slots.find((s) => !s.join);
  else if (to === "bottom") slot = slots.filter((s) => s.join === join).pop();
  else {
    const target = "after" in to ? to.after : to.before;
    if (ids.includes(target)) throw new Error(`${what} can't move next to itself`);
    const k = rest.findIndex((t) => t.id === target);
    if (k < 0) throw new Error(`There is no task ${target} in this queue`);
    const before = "before" in to ? target : rest[k + 1]?.id;
    const firstParked = rest.find(isParked)?.id;
    if (!parked && rest[k]!.parked && before !== firstParked)
      throw new Error(
        `${what} isn't parked, so it can't go into the parked pool at the end of the queue: park it with parked: true, or move it before the first parked task`,
      );
    if (parked && !rest[k]!.parked && before !== firstParked)
      throw new Error(
        `${what} is parked, so it stays in the parked pool at the end of the queue: unpark it first with parked: false`,
      );
    const inside = before !== undefined && rest.find((t) => t.id === before)?.newChat === false;
    if (inside && options.newChat === true)
      throw new Error(
        `${what} can't start its own chat there: task ${before} continues the chat above it. Move it between chats, or leave newChat out to join that chat`,
      );
    // Beside a stop line: "before" a task lands under the line above it, "after" a task above the line.
    const fits = slots.filter((s) => s.before === before && s.join === (inside || join));
    slot = "before" in to ? fits[fits.length - 1] : fits[0];
  }
  if (!slot)
    throw new Error(
      `${what} can't go there: queued tasks only move below the tasks that are running or finished${
        options.wholeChat ? ", and a whole chat only between chats" : ""
      }${join ? ", and the first task in the queue can't continue a chat" : ""}`,
    );
  return moveTasks(queue, ids, slot);
}

/**
 * Where moved tasks can land (D-307): before the task `before` (or at the end), and either joining the
 * chat of the task just above (`join`, inside its card) or starting their own chat (between cards).
 */
export interface DropSlot {
  before?: string;
  join: boolean;
  /** In the parked pool (D-369): what lands there is parked; a parked task dropped elsewhere is unparked. */
  parked?: boolean;
  /**
   * Below the stop line that sits just above `before` (D-398). Without it a drop in that gap lands above
   * the line, which then stays after the dropped tasks.
   */
  pastStop?: boolean;
}

/** Whether two slots are the same place. */
export const sameSlot = (a?: DropSlot, b?: DropSlot): boolean =>
  !!a &&
  !!b &&
  a.before === b.before &&
  a.join === b.join &&
  !!a.parked === !!b.parked &&
  !!a.pastStop === !!b.pastStop;

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
      // A stop line after a task that goes stays where it was: after the task before it (D-398).
      const last = rest[rest.length - 1];
      if (task.stopAfter && last && !last.stopAfter && (isReady(last) || isActive(last)))
        rest[rest.length - 1] = { ...last, stopAfter: true };
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
  // Before the first parked task: the queue's end comes before the top of the pool; in a gap with a
  // stop line, the drop above the line comes before the one below it.
  return k * 8 + (slot.join ? 0 : slot.parked ? 4 : slot.pastStop ? 2 : 1);
};

/**
 * Where `ids` can be dropped, top to bottom. Never above or between running or finished tasks: only
 * after the last task that isn't queued. One task can join a chat (inside a card, or at its end) or
 * start its own (between cards); a whole chat only goes between cards, never into another chat. Below
 * the queue, one task can also go into the parked pool (`parked` slots, D-369), between parked tasks.
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
  const pool = rest.findIndex(isParked);
  const end = pool < 0 ? rest.length : pool;
  for (let k = lastFixed + 1; k <= end; k++) {
    const next = rest[k];
    const before = next?.id;
    if (next && !next.newChat) {
      // Inside a card: only a single task, which then continues that chat.
      if (single) slots.push({ before, join: true });
      continue;
    }
    if (single && k > 0) slots.push({ before, join: true });
    slots.push({ before, join: false });
    // A stop line in this gap (D-398): a drop can also land below it.
    const above = rest[k - 1];
    if (above && hasStopLine(above)) slots.push({ before, join: false, pastStop: true });
  }
  // The pool, the same way (D-396): inside a parked chat only a single task, which then continues it;
  // the pool's first slot starts a chat, as no parked task continues a chat of the queue. A parked
  // chat is made by parking one, or by the edit dialog's "continue the chat" switch, not by a drop.
  for (let k = end; k <= rest.length; k++) {
    const next = rest[k];
    const before = next?.id;
    if (next && !next.newChat) {
      if (single) slots.push({ before, join: true, parked: true });
      continue;
    }
    // At the end of a parked chat of several tasks; a single idea isn't joined by a drop or a step.
    if (single && k > end && rest[k - 1]?.newChat === false) slots.push({ before, join: true, parked: true });
    slots.push({ before, join: false, parked: true });
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
  const join = i > 0 && !first.newChat;
  // Right below a stop line.
  const line = !join && !first.parked && i > 0 && hasStopLine(queue.tasks[i - 1]!);
  return {
    before: before?.id,
    join,
    ...(first.parked ? { parked: true } : {}),
    ...(line ? { pastStop: true } : {}),
  };
}

/**
 * Moves `ids` (one task, or a whole chat) to `slot`, which must be one of `dropSlots`. The first moved
 * task starts its own chat unless the slot joins one; a chat's first task that moves away hands its
 * chat to its next task. A task dropped into the parked pool is parked; a parked one dropped in the
 * queue is unparked, left out until you tick it (D-369).
 */
export function moveTasks(queue: Queue, ids: string[], slot: DropSlot): Queue {
  const moving = movingTasks(queue, ids);
  const allowed = dropSlots(queue, ids);
  if (!allowed.some((s) => sameSlot(s, slot)))
    throw new Error("Tasks can only move among the queued tasks, below the ones that ran");
  const rest = withoutTasks(queue.tasks, new Set(ids));
  const at = slot.before ? rest.findIndex((t) => t.id === slot.before) : rest.length;
  // A stop line stays where it is while tasks move (its task's flag was handed back by `withoutTasks`).
  const block = moving.map((t, i): Task => {
    const { parked: _p, stopAfter: _s, ...plain } = t;
    const kept = slot.parked ? { ...plain, parked: true } : plain;
    return i === 0 ? { ...kept, newChat: !slot.join } : kept;
  });
  const head = rest.slice(0, at);
  // Dropped above a stop line: the line stays after the dropped tasks (below it, it stays where it was).
  const above = head[head.length - 1];
  if (!slot.parked && !slot.pastStop && above && hasStopLine(above)) {
    const { stopAfter: _moved, ...plain } = above;
    head[head.length - 1] = plain;
    block[block.length - 1] = { ...block[block.length - 1]!, stopAfter: true };
  }
  return normalizeQueue({ ...queue, tasks: [...head, ...block, ...rest.slice(at)] });
}

/**
 * One step up or down (Alt+↑/↓, Move up/down) through the same slots a drag offers; Move to top and
 * bottom go to the first slot that starts a chat and to the end. Unchanged when it can't go further.
 * A queued task stays above the parked pool and a parked one inside it.
 */
export function stepTasks(queue: Queue, ids: string[], to: -1 | 1 | "top" | "bottom"): Queue {
  // Steps stay on the task's side of the parked pool's divider; Park and Unpark cross it.
  const parked = !!movingTasks(queue, ids)[0]!.parked;
  const slots = dropSlots(queue, ids).filter((s) => !!s.parked === parked);
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

/**
 * Why a task can't be removed, or undefined when it can. A running task or one that needs you never
 * can (skip it in its chat first); with `queuedOnly` (Claude's `addon_tasks_delete`) only queued ones
 * can, so finished tasks stay with their run.
 */
function removeBlocked(task: Task | undefined, id: string, queuedOnly: boolean): string | undefined {
  if (!task) return `There is no task ${taskCode(id)} in this queue`;
  if (isActive(task))
    return queuedOnly
      ? `Task ${taskCode(id)} is ${STATUS_LABEL[task.status].toLowerCase()}; only queued tasks can be deleted`
      : "A running task can't be removed; skip it in its chat first";
  if (queuedOnly && task.status !== "queued")
    return `Task ${taskCode(id)} has finished (${STATUS_LABEL[task.status].toLowerCase()}); only queued tasks can be deleted, finished ones stay as the queue's history`;
  return undefined;
}

/**
 * Removes tasks from the queue, all or nothing (the Queue tab's Remove and Claude's delete tool): throws
 * with the reason when one of them can't go (`removeBlocked`). A chat's first task that goes hands its
 * chat to the next task of its chat card, which then starts it, as when it is moved away (`withoutTasks`).
 */
export function removeTasks(queue: Queue, ids: string[], options: { queuedOnly?: boolean } = {}): Queue {
  const wanted = new Set(ids);
  if (!wanted.size) throw new Error("Give at least one task to delete");
  for (const id of wanted) {
    const reason = removeBlocked(
      queue.tasks.find((t) => t.id === id),
      id,
      !!options.queuedOnly,
    );
    if (reason) throw new Error(reason);
  }
  return normalizeQueue({ ...queue, tasks: withoutTasks(queue.tasks, wanted) });
}

/** The ids Claude passes to `addon_tasks_delete`: task ids, trimmed, each once, at most 50. */
export function parseTaskIds(value: unknown): string[] {
  const ids = [
    ...new Set(
      (Array.isArray(value) ? value : [value])
        .map((v) => (typeof v === "string" ? taskIdOf(v) : ""))
        .filter(Boolean),
    ),
  ];
  if (!ids.length) throw new Error("Give the ids of the tasks to delete (addon_tasks_list shows them)");
  if (ids.length > 50) throw new Error("At most 50 tasks at once");
  return ids;
}

/**
 * What the approval card of `addon_tasks_delete` says: its title, the tasks it deletes (id and title,
 * in queue order) and, when a rule blocks it, why (the tool would refuse it, so the card only declines).
 */
export function deletePermission(
  queue: Pick<Queue, "tasks">,
  ids: string[],
  projectName?: string,
): { title: string; tasks: Array<{ id: string; title: string }>; blocked?: string } {
  const wanted = new Set(ids);
  const tasks = queue.tasks.filter((t) => wanted.has(t.id)).map((t) => ({ id: t.id, title: t.title }));
  let blocked: string | undefined;
  for (const id of wanted) {
    blocked = removeBlocked(
      queue.tasks.find((t) => t.id === id),
      id,
      true,
    );
    if (blocked) break;
  }
  const n = wanted.size;
  const what = n === 1 ? "a queued task" : `${n} queued tasks`;
  return {
    title: `Delete ${what}${projectName ? ` from ${projectName}'s queue` : ""}`,
    tasks,
    ...(blocked ? { blocked } : {}),
  };
}

/** A finished task back in the queue (Run again): a new queued copy at the end, in a new chat. */
export function requeue(queue: Queue, id: string): Queue {
  const task = queue.tasks.find((t) => t.id === id);
  if (!task) return queue;
  return addTasks(queue, [{ ...rerunOf(task) }], {
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
  // A task of a closed run that changed since (a late report) changes in that run too, in its place.
  const was = new Map(before.tasks.map((t) => [t.id, JSON.stringify(t)]));
  for (const task of after.tasks) {
    if (!task.runId || ids.includes(task.runId) || was.get(task.id) === JSON.stringify(task)) continue;
    const run = next.find((r) => r.id === task.runId);
    if (!run?.tasks.some((t) => t.id === task.id)) continue;
    const updated = { ...run, tasks: run.tasks.map((t) => (t.id === task.id ? task : t)) };
    next = next.map((r) => (r === run ? updated : r));
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
  return { ...into, seq: into.seq + from.seq, tasks: poolLast([...into.tasks, ...tasks]) };
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
  if (!task) {
    // A chat whose task ended keeps a short line, so a follow-up that changes the outcome is reported.
    const last = queue.tasks.filter((t) => t.sessionId === sessionId && canRevise(t)).pop();
    return last
      ? `This chat ran ${named(queue, last)} in the user's task queue, reported ${STATUS_LABEL[last.status].toLowerCase()}. If the user follows up and its outcome changes, call addon_tasks_report again with taskId "${taskCode(last.id)}"; the new report replaces the old one.`
      : "";
  }
  const n = queue.tasks.indexOf(task) + 1;
  const waiting = queue.tasks.filter((t) => t.status === "queued");
  const shown = waiting.slice(0, MAX_QUEUED_IN_CONTEXT);
  const thisRun = new Set(runBlock(queue).map((t) => t.id));
  const missing = unreported(queue, sessionId);
  return [
    `This chat is running task ${n} of ${queue.tasks.length} in the user's task queue: "${task.title}" (taskId "${taskCode(task.id)}").`,
    "Do the task fully without stopping to ask unless you really must. When you are done, or can't go on,",
    "call the addon_tasks_report tool once: outcome (done, partial, failed or blocked), a short summary of",
    "what you did, notes the user should know (decisions, risks, anything surprising), and follow-up",
    "tasks you suggest (each a prompt that could be queued). The user reads these reports in a table.",
    ...(missing.length
      ? [
          "Earlier tasks of this chat still have no report: report each first with addon_tasks_report and its taskId:",
          ...missing.map((t) => `- ${named(queue, t)}`),
        ]
      : []),
    "If the user follows up after you reported and the outcome changes, report again with the task's id; the new report replaces the old one.",
    "Report only with addon_tasks_report; never change the task queue's data with jig_set_addon_data.",
    ...(waiting.length
      ? [
          "Already queued, so never suggest these (or work they cover) as follow-ups, and leave their work to them:",
          ...shown.map(
            (t) =>
              `- ${t.title}${t.parked ? " (parked: an idea the user keeps for later)" : thisRun.has(t.id) ? "" : " (after a stop line: the user runs that block later)"}`,
          ),
          ...(waiting.length > shown.length ? [`- … and ${waiting.length - shown.length} more`] : []),
        ]
      : []),
  ].join("\n");
}

/** Most queued tasks named in a running task's instructions. */
const MAX_QUEUED_IN_CONTEXT = 15;

export function counts(queue: Queue): {
  /** Queued and not parked. */
  queued: number;
  /** What Start takes: the queued tasks up to the next stop line (D-398). */
  ready: number;
  /** In the parked pool (D-369). */
  parked: number;
  finished: number;
  total: number;
} {
  return {
    queued: queue.tasks.filter((t) => t.status === "queued" && !t.parked).length,
    parked: queue.tasks.filter(isParked).length,
    ready: runBlock(queue).length,
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
  /** Its title (D-418): the chat's real one once it started, else the one its first task gives it. */
  chatTitle?: string;
  projectId?: string;
}

/** A chat card's header (D-418): the chat's title, else (older tasks, the Add dialog left empty) its first task's. */
export const groupTitle = (group: ChatGroup): string => group.chatTitle || group.tasks[0]?.task.title || "";

/**
 * Whether a task's row would repeat its chat card's header (D-418): the chat's only task, titled like the
 * chat. Its row then shows its code and its outcome, not the title a second time.
 */
export const repeatsHeader = (group: ChatGroup, task: Task): boolean =>
  group.tasks.length === 1 && groupTitle(group).trim().toLowerCase() === task.title.trim().toLowerCase();

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
    if (!group.tasks.length && task.chatTitle) group.chatTitle = task.chatTitle;
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

/** How a task's provider reads in Claude's listings: "on ChatGPT (sol)", "on Claude, the chat's". */
function runsOnText(queue: Queue, task: Task, projectDefault: TaskProvider): string {
  const on = runsOn(queue, task, projectDefault);
  const from = {
    task: "",
    ran: "",
    chat: ", the chat's",
    queue: ", the queue's",
    project: ", the project's",
  }[on.from];
  return `on ${PROVIDER_LABEL[on.provider]}${on.model ? ` (${on.model})` : ""}${from}`;
}

/** The queue's "Runs on", for Claude. */
const queueRunsOn = (queue: Queue) =>
  queue.provider
    ? `New chats run on ${PROVIDER_LABEL[queue.provider]}${queue.model ? ` (${queue.model})` : ""}.`
    : "New chats run on the project's default.";

/** ", parked" after a queued task's status in Claude's listings. */
const stateText = (t: Task) => (t.status === "queued" && t.parked ? ", parked" : "");

/** The line Claude's listings show where a run stops (D-398). */
export const STOP_LINE_TEXT = "--- stop ---";

/** One line per task for Claude (the list tool), a stop line where a run stops; `projectDefault`: the project's provider. */
export function listing(queue: Queue, projectDefault: TaskProvider = "claude"): string {
  if (!queue.tasks.length) return `The task queue is empty. ${queueRunsOn(queue)}`;
  const lines = queue.tasks.flatMap((t, i) => [
    `${i + 1}. [${STATUS_LABEL[t.status]}${stateText(t)}${t.reportedLate ? ", reported late" : ""}${t.markedDone ? `, marked done by the user (was ${STATUS_LABEL[t.markedDone.was].toLowerCase()})` : ""}${t.revised ? `, revised from ${STATUS_LABEL[t.revised.from.outcome].toLowerCase()}` : ""}] ${t.title} (id ${taskCode(t.id)}${t.newChat ? "" : ", continues the previous chat"}, ${runsOnText(queue, t, projectDefault)})` +
      (t.report ? ` — ${t.report.summary}` : ""),
    ...(hasStopLine(t) ? [STOP_LINE_TEXT] : []),
  ]);
  return [`The task queue is ${queue.running ? "running" : "paused"}. ${queueRunsOn(queue)}`, ...lines].join(
    "\n",
  );
}

/** One short line per task (id, status, title), for listing every project's queue at once. */
export function compactListing(queue: Queue): string {
  const lines = queue.tasks.flatMap((t) => [
    `- ${taskCode(t.id)} [${STATUS_LABEL[t.status]}${stateText(t)}] ${t.title}`,
    ...(hasStopLine(t) ? [`- ${STOP_LINE_TEXT}`] : []),
  ]);
  return [
    `${queue.tasks.length} task${queue.tasks.length === 1 ? "" : "s"}, ${queue.running ? "running" : "paused"}. ${queueRunsOn(queue)}`,
    ...lines,
  ].join("\n");
}

// Who runs a task's chat (D-330).

/** A finished task as a new queued one (Run again): the same prompt, files and provider choice. */
function rerunOf(task: Task): NewTask {
  return {
    prompt: task.prompt,
    title: task.title,
    ...(task.newChat && task.chatTitle ? { chatTitle: task.chatTitle } : {}),
    attachments: task.attachments,
    ...(task.provider ? { provider: task.provider } : {}),
    ...(task.model ? { model: task.model } : {}),
  };
}

/** Whether a task continues the chat of the task before it (it isn't the first of its chat card). */
export function continuesChat(queue: Pick<Queue, "tasks">, task: Task): boolean {
  const group = chatGroups(queue).find((g) => g.tasks.some((x) => x.task.id === task.id));
  return !!group && group.tasks[0]!.task.id !== task.id;
}

/**
 * Where a task's provider comes from: its own choice, the queue's, the project's default, the chat it
 * continues, or (once it started) the chat it ran in.
 */
export type RunsOnSource = Exclude<AnyRunsOnSource, "step">;

export interface RunsOn {
  provider: TaskProvider;
  /** The model asked for; none = the provider's default (the project's model for its own provider). */
  model?: string;
  /** Its chat started on this other provider and was handed over to `provider` (D-338). */
  startedOn?: TaskProvider;
  from: RunsOnSource;
}

/** The providers a task's chat ran on, in handover order: the one it started on first (D-338). */
export const handoverOrder = (on: Pick<RunsOn, "provider" | "startedOn">): TaskProvider[] =>
  on.startedOn ? [on.startedOn, on.provider] : [on.provider];

/**
 * The provider a task runs on (D-330): once it started, the one its chat ran on; a task that continues
 * a chat, that chat's (only you hand a chat over, D-339), so its own choice is ignored; otherwise its
 * own choice, then the queue's "Runs on", then the project's default (`projectDefault`: the project's
 * provider, else Jig's).
 */
export function runsOn(
  queue: Pick<Queue, "tasks" | "provider" | "model">,
  task: Task,
  projectDefault: TaskProvider,
): RunsOn {
  if (task.ranOn)
    return {
      provider: task.ranOn,
      ...(task.ranModel ? { model: task.ranModel } : {}),
      ...(task.startedOn && task.startedOn !== task.ranOn ? { startedOn: task.startedOn } : {}),
      from: "ran",
    };
  const group = chatGroups(queue).find((g) => g.tasks.some((x) => x.task.id === task.id));
  const tasks = group?.tasks.map((x) => x.task) ?? [];
  if (tasks[0] && tasks[0] !== task) {
    // The chat it continues: the one a task of its card ran in, else the one its first task will start.
    const chat = runsOn(queue, tasks.find((t) => t.ranOn) ?? tasks[0], projectDefault);
    return { provider: chat.provider, ...(chat.model ? { model: chat.model } : {}), from: "chat" };
  }
  return newChatRunsOn(queue, task, projectDefault);
}

/**
 * Who runs a new chat (D-330, D-408): its own provider and model, else the queue's, else the project's
 * default. The queue's model applies only to its own provider: a chat with its own provider takes it
 * when it's that provider's, else that provider's default model.
 */
export function newChatRunsOn(
  queue: Pick<Queue, "provider" | "model">,
  own: { provider?: TaskProvider; model?: string },
  projectDefault: TaskProvider,
): RunsOn {
  const model = (provider: TaskProvider) => {
    const m = own.model ?? queueModel(queue);
    return m && providerOfModel(m) === provider ? { model: m } : {};
  };
  if (own.provider) return { provider: own.provider, ...model(own.provider), from: "task" };
  if (queue.provider) return { provider: queue.provider, ...model(queue.provider), from: "queue" };
  return { provider: projectDefault, from: "project" };
}

/** The queue's model, when it belongs to the queue's provider (D-408). */
export function queueModel(queue: Pick<Queue, "provider" | "model">): string | undefined {
  return queue.provider && queue.model && providerOfModel(queue.model) === queue.provider
    ? queue.model
    : undefined;
}

/**
 * The queue's "Runs on" after a change (D-408). `undefined` keeps what it was, `null` goes back to the
 * default: a `null` provider is the project's default (and drops the model), a `null` model the
 * provider's default model. A model alone names its provider; a provider change drops a model that
 * isn't that provider's.
 */
export function setQueueRunsOn<Q extends Pick<Queue, "provider" | "model">>(
  queue: Q,
  provider: TaskProvider | null | undefined,
  model: string | null | undefined,
): Q {
  const { provider: _p, model: _m, ...rest } = queue;
  if (provider === null && !model) return rest as Q;
  const nextProvider =
    provider === undefined ? (model ? providerOfModel(model) : queue.provider) : (provider ?? undefined);
  const nextModel = model === undefined ? queue.model : (model ?? undefined);
  return { ...rest, ...providerFields(nextProvider, nextModel) } as Q;
}

/** A run's tasks per provider they ran on: most tasks first; `unrecorded` started before Jig kept it. */
export interface RunProviders {
  counts: Array<{ provider: TaskProvider; tasks: number }>;
  unrecorded: number;
}

/**
 * Which providers a run's tasks actually ran on: each started task's `ranOn` (the chat's provider when
 * it started, or the one that finished it after a handover), plus `startedOn` when its chat was handed
 * over mid-task (D-338), so such a task counts for both. Never the queue's setting: a task from before
 * `ranOn` was kept counts as unrecorded, and a run with none recorded has no providers.
 */
export function runProviders(tasks: Task[]): RunProviders {
  const n: Record<TaskProvider, number> = { claude: 0, chatgpt: 0 };
  let unrecorded = 0;
  for (const task of tasks) {
    if (!task.ranOn) {
      if (task.sentAt) unrecorded++;
      continue;
    }
    for (const p of new Set([task.ranOn, task.startedOn ?? task.ranOn])) n[p]++;
  }
  const counts = TASK_PROVIDERS.filter((p) => n[p] > 0)
    .map((provider) => ({ provider, tasks: n[provider] }))
    .sort((a, b) => b.tasks - a.tasks);
  return { counts, unrecorded };
}

/** A run's providers in words: "ChatGPT · 5 tasks, Claude · 1"; empty when none was recorded. */
export function runProvidersText({ counts, unrecorded }: RunProviders): string {
  if (!counts.length) return "";
  const parts = counts.map(
    (c, i) =>
      `${PROVIDER_LABEL[c.provider]} · ${c.tasks}${i === 0 ? (c.tasks === 1 ? " task" : " tasks") : ""}`,
  );
  if (unrecorded) parts.push(`${unrecorded} not recorded`);
  return parts.join(", ");
}

/** What a task's error starts with when it was to run on ChatGPT while Codex isn't signed in. */
export const CHATGPT_SIGNED_OUT = "ChatGPT isn't signed in";

/**
 * A task whose chat couldn't start: blocked when ChatGPT isn't signed in (sign in, then run it again),
 * an error otherwise. Both pause the queue when "stop when a task fails" is on.
 */
export function startFailed(task: Task, message: string, at = new Date().toISOString()): Task {
  const signedOut = message.startsWith(CHATGPT_SIGNED_OUT);
  return {
    ...task,
    status: signedOut ? "blocked" : "error",
    error: signedOut ? `${CHATGPT_SIGNED_OUT}: sign in on Get Started, then run it again` : message,
    finishedAt: at,
  };
}

/**
 * Throws when a queued task with its own provider or model continues a chat (D-330): a task can't change
 * a chat's provider (only you hand it over, D-339), so the choice could never apply. `ids`: the tasks to check (just added or edited).
 */
export function checkProviderChoices(queue: Pick<Queue, "tasks">, ids: string[]): void {
  for (const task of queue.tasks) {
    if (!ids.includes(task.id) || (!task.provider && !task.model) || task.status !== "queued") continue;
    if (continuesChat(queue, task))
      throw new Error(
        `Task ${taskCode(task.id)} continues the chat before it, so it runs on that chat's provider: leave provider and model out, or start a new chat (newChat true)`,
      );
  }
}

/** The queue's "Runs on" as Claude or the view gives it: "default" (or none) = the project's default. */
export function parseQueueProvider(value: unknown): TaskProvider | undefined {
  if (value === "default" || value === undefined || value === null || value === "") return undefined;
  return parseProvider(value, "the queue");
}

/**
 * The queue's "Runs on" change as Claude or the view gives it (D-408), for `setQueueRunsOn`: left out =
 * unchanged; provider "default" (or null) = the project's default, model "default" (or null) = the
 * provider's default model. A model of the other provider than the one given is refused.
 */
export function parseQueueRunsOn(
  provider: unknown,
  model: unknown,
): { provider: TaskProvider | null | undefined; model: string | null | undefined } {
  const p = provider === undefined ? undefined : (parseQueueProvider(provider) ?? null);
  const m =
    model === undefined ? undefined : model === "default" ? null : (parseModel(model, "the queue") ?? null);
  if (p && m && providerOfModel(m) !== p)
    throw new Error(`model ${m} for the queue isn't a ${PROVIDER_LABEL[p]} model`);
  return { provider: p, model: m };
}

/**
 * A task's provider choice changed: `null` provider goes back to the queue's choice (and drops the
 * model); `null` model to the provider's default; a model alone names its provider.
 */
export function setProviderChoice(
  task: Task,
  provider: TaskProvider | null | undefined,
  model: string | null | undefined,
): Task {
  if (provider === undefined && model === undefined) return task;
  const { provider: _p, model: _m, ...rest } = task;
  const nextProvider =
    provider === undefined ? (model ? providerOfModel(model) : task.provider) : (provider ?? undefined);
  const nextModel =
    model === undefined ? (provider === undefined ? task.model : undefined) : (model ?? undefined);
  if (provider === null && model === undefined) return rest;
  return { ...rest, ...providerFields(nextProvider, nextModel) };
}
