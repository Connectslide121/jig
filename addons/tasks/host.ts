import type { AddonChatInfo, AddonHostApi } from "@jig/sdk";
import {
  addTasks,
  afterTurn,
  applyReport,
  canReportLate,
  chatFinished,
  chatToContinue,
  closeRun,
  type DropSlot,
  editTasks,
  emptyQueue,
  finishTask,
  historyFiles,
  interruptedTurn,
  isActive,
  joinQueues,
  listing,
  moveTasks,
  type NewTask,
  nextTask,
  nudgeFrom,
  nudgeText,
  openRun,
  type PermissionMode,
  parseNewTasks,
  parseReport,
  parseTaskEdits,
  pendingReportsNote,
  type Queue,
  type Run,
  recordRuns,
  reportTarget,
  requeue,
  resetTasks,
  STATUS_LABEL,
  setLeftOut,
  shouldPause,
  splitQueue,
  stepTasks,
  type Task,
  type TaskFile,
  taskContext,
  titleFor,
  unusedFiles,
} from "./lib/tasks";

/**
 * The task queues run here, in the add-on's host, so they go on whether the view is open or not. One
 * queue per project (project-scoped storage, key `queue`), each running on its own (D-248), and each
 * project's run history (key `history`): every run from Start until the queue finishes, kept as its
 * tasks ended. Changes go one at a time (`change`) and are announced (`changed`) so the view follows.
 * Main tells us when a chat we started changes status (`chatChanged`); a watcher (`tick`) catches up
 * after a restart. A task's files stay as long as the task or its run in the history does; `change`
 * deletes the ones nothing uses any more.
 */

const KEY = "queue";
const HISTORY = "history";
let chain: Promise<unknown> = Promise.resolve();
let migrated = false;

const scope = (projectId: string) => ({ scope: "project" as const, id: projectId });

async function load(api: AddonHostApi, projectId: string): Promise<Queue> {
  return { ...emptyQueue(), ...((await api.storage.get<Queue>(KEY, scope(projectId))) ?? {}) };
}

async function loadHistory(api: AddonHostApi, projectId: string): Promise<Run[]> {
  const runs = await api.storage.get<Run[]>(HISTORY, scope(projectId));
  return Array.isArray(runs) ? runs : [];
}

/** Runs `fn` after the changes before it (every queue's changes go one at a time). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn);
  chain = result.catch(() => undefined);
  return result;
}

/** Before queues were per project there was one (global `queue`): split it once into the projects'. */
async function migrate(api: AddonHostApi): Promise<void> {
  if (migrated) return;
  const old = await api.storage.get<Queue>(KEY);
  if (old?.tasks?.length) {
    const projects = await api.projects();
    if (!projects.length) return;
    const known = new Set(projects.map((p) => p.id));
    const fallback = projects[0]!.id;
    const fixed = { ...emptyQueue(), ...old };
    fixed.tasks = fixed.tasks.map((t) =>
      t.projectId && known.has(t.projectId) ? t : { ...t, projectId: fallback },
    );
    for (const [projectId, queue] of Object.entries(splitQueue(fixed, fallback)))
      await api.storage.set(KEY, joinQueues(await load(api, projectId), queue), scope(projectId));
  }
  if (old) await api.storage.set(KEY, null);
  migrated = true;
}

/** Runs `fn` on a project's queue after earlier changes, saves what it returns and tells the view. */
function change<T>(
  api: AddonHostApi,
  projectId: string,
  fn: (q: Queue) => Promise<[Queue, T]> | [Queue, T],
): Promise<T> {
  return serial(async () => {
    await migrate(api);
    const before = await load(api, projectId);
    const json = JSON.stringify(before);
    const [next, result] = await fn(before);
    // Saved (and the view told) only when something changed: the view's own reload calls list.
    if (JSON.stringify(next) !== json || JSON.stringify(await load(api, projectId)) !== json) {
      await api.storage.set(KEY, next, scope(projectId));
      const history = await loadHistory(api, projectId);
      const recorded = recordRuns(history, before, next);
      if (recorded !== history) await api.storage.set(HISTORY, recorded, scope(projectId));
      api.emit("changed", { projectId });
      void showWaiting(api);
      const unused = unusedFiles(before, next, historyFiles(recorded));
      if (unused.length) await api.attachments.remove(unused.map((path) => ({ path, mime: "" })));
    }
    return result;
  });
}

/** The project whose queue has a task running in this chat (session ids are remembered). */
const chatProjects = new Map<string, string>();

async function projectOfChat(
  api: AddonHostApi,
  sessionId: string,
  hint?: string,
  /** Also a chat whose tasks all ended (a late report), not only one running a task. */
  anyTask = false,
): Promise<string | undefined> {
  const has = async (projectId: string) =>
    (await load(api, projectId)).tasks.some((t) => t.sessionId === sessionId && (anyTask || isActive(t)));
  const known = chatProjects.get(sessionId) ?? hint;
  if (known && (await has(known))) return known;
  for (const p of await api.projects())
    if (p.id !== known && (await has(p.id))) {
      chatProjects.set(sessionId, p.id);
      return p.id;
    }
  return undefined;
}

const replace = (q: Queue, task: Task): Queue => ({
  ...q,
  tasks: q.tasks.map((t) => (t.id === task.id ? task : t)),
});

const ready = (api: AddonHostApi) => (migrated ? Promise.resolve() : serial(() => migrate(api)));

const OPEN = [{ label: "Open Tasks", view: "tasks" }];

/** A task's chat finished: record it, and pause or announce the end as needed. */
function settle(api: AddonHostApi, q: Queue, task: Task, chat: AddonChatInfo): Queue {
  const done = finishTask(task, chat);
  let next = replace(q, done);
  if (shouldPause(next, done)) {
    next = { ...next, running: false };
    api.notify({
      title: `Task queue paused: ${STATUS_LABEL[done.status].toLowerCase()}`,
      message: done.title,
      tone: "warning",
      system: true,
      actions: OPEN,
    });
  }
  return next;
}

/**
 * A task's chat stopped working (D-318): still busy in the background → wait; ended without a report
 * → ask it once for the report (a message from the task queue, not from you), and follow that turn;
 * otherwise record the task. Never asks when you stopped the turn or rejected a tool call yourself.
 */
async function turnEnded(api: AddonHostApi, q: Queue, task: Task, chat: AddonChatInfo): Promise<Queue> {
  const next = afterTurn(task, chat);
  if (next === "wait") return q;
  if (next === "finish" || !task.sessionId) return settle(api, q, task, chat);
  const asked: Task = { ...task, nudgedAt: new Date().toISOString(), sawBusy: false };
  const saved = replace(q, asked);
  // Saved before the message goes, so its turn is followed as this task's.
  if (task.projectId) await api.storage.set(KEY, saved, scope(task.projectId));
  try {
    await api.chats.send({
      sessionId: task.sessionId,
      text: nudgeText(saved, asked),
      from: nudgeFrom(saved, asked),
    });
    return saved;
  } catch {
    return settle(api, saved, asked, chat);
  }
}

/** Starts the next queued task when the queue runs and nothing else does; the run ends with the queue. */
async function advance(api: AddonHostApi, q: Queue): Promise<Queue> {
  while (q.running) {
    const task = nextTask(q);
    if (!task) {
      if (!q.tasks.some(isActive)) {
        const ran = q.tasks.filter((t) => t.runId && t.runId === q.runId);
        q = closeRun({ ...q, running: false });
        const project = (await api.projects()).find((p) => p.id === ran[0]?.projectId);
        api.notify({
          title: project ? `Task queue finished in ${project.name}` : "Task queue finished",
          message: `${ran.filter((t) => t.status === "done").length} of ${ran.length} done`,
          tone: "success",
          system: true,
          actions: OPEN,
        });
      }
      return q;
    }
    const continued = chatToContinue(q, task);
    try {
      const before = continued ? await api.chats.get(continued) : undefined;
      const sessionId =
        continued ??
        (
          await api.chats.create({
            projectId: task.projectId,
            title: task.title,
            permissionMode: task.permissionMode,
          })
        ).sessionId;
      if (task.projectId) chatProjects.set(sessionId, task.projectId);
      // Saved as running before the message goes, so the chat's first turn gets the task's instructions.
      q = replace(q, {
        ...task,
        status: "running",
        sessionId,
        sentAt: new Date().toISOString(),
        costAtStart: before?.costUsd ?? 0,
        sawBusy: false,
        ...(q.runId ? { runId: q.runId } : {}),
      });
      if (task.projectId) await api.storage.set(KEY, q, scope(task.projectId));
      // A chat whose earlier tasks still miss their report is told which, by id, before this one.
      const note = continued ? pendingReportsNote(q, continued) : "";
      const text = note ? (task.prompt ? `${note}\n\n${task.prompt}` : note) : task.prompt;
      await api.chats.send({ text, sessionId, attachments: task.attachments });
      return q;
    } catch (error) {
      const failed: Task = {
        ...task,
        status: "error",
        error: (error as Error).message,
        finishedAt: new Date().toISOString(),
        ...(q.runId ? { runId: q.runId } : {}),
      };
      q = replace(q, failed);
      if (shouldPause(q, failed)) {
        api.notify({
          title: "Task queue paused",
          message: failed.error,
          tone: "warning",
          system: true,
          actions: OPEN,
        });
        return { ...q, running: false };
      }
    }
  }
  return q;
}

/** Checks running tasks against their chats (after a restart nobody told us). */
async function reconcile(api: AddonHostApi, q: Queue): Promise<Queue> {
  for (const task of q.tasks.filter(isActive)) {
    if (!task.sessionId) continue;
    const chat = await api.chats.get(task.sessionId).catch(() => undefined);
    if (!chat) {
      q = replace(q, {
        ...task,
        status: "error",
        error: "Its chat is gone",
        finishedAt: new Date().toISOString(),
      });
    } else if (chatFinished(task, chat)) {
      q = await turnEnded(api, q, task, chat);
    } else if (interruptedTurn(task, chat) && !chat.queued) {
      // Idle with no answer since the task was sent: Jig closed before the chat got to it.
      q = replace(q, {
        ...task,
        status: "error",
        error: "Interrupted: Jig closed before the chat finished",
        interrupted: true,
        finishedAt: new Date().toISOString(),
      });
    }
  }
  return q;
}

/** The project a view call is about (it must still exist). */
async function projectArg(api: AddonHostApi, projectId: unknown): Promise<string> {
  if (typeof projectId !== "string" || !projectId) throw new Error("Say which project's queue");
  if (!(await api.projects()).some((p) => p.id === projectId))
    throw new Error("That project no longer exists");
  return projectId;
}

// Called from the view.

type ProjectArgs = { projectId: string };

export async function list(args: ProjectArgs, api: AddonHostApi): Promise<Queue> {
  const projectId = await projectArg(api, args?.projectId);
  return change(api, projectId, async (q) => {
    const next = await reconcile(api, q);
    return [next, next];
  });
}

/** Every project's queue at a glance (the view's project menu). */
export async function overview(
  _args: unknown,
  api: AddonHostApi,
): Promise<
  Array<{
    projectId: string;
    queued: number;
    active: number;
    needsYou: number;
    running: boolean;
    runs: number;
  }>
> {
  await ready(api);
  const out = [];
  for (const p of await api.projects()) {
    const q = await load(api, p.id);
    out.push({
      projectId: p.id,
      queued: q.tasks.filter((t) => t.status === "queued").length,
      active: q.tasks.filter(isActive).length,
      needsYou: q.tasks.filter((t) => t.status === "needs_you").length,
      running: q.running,
      runs: (await loadHistory(api, p.id)).length,
    });
  }
  return out;
}

/** A project's past runs, newest first. */
export async function history(args: ProjectArgs, api: AddonHostApi): Promise<Run[]> {
  const projectId = await projectArg(api, args?.projectId);
  await ready(api);
  return loadHistory(api, projectId);
}

/** Removes a finished run from the history (its files go when nothing else uses them). */
export async function forgetRun(args: ProjectArgs & { runId: string }, api: AddonHostApi): Promise<void> {
  const projectId = await projectArg(api, args?.projectId);
  await dropRun(api, projectId, args.runId, true);
}

/** Takes a run out of the history and deletes the files only it used; `finishedOnly` keeps open runs. */
function dropRun(api: AddonHostApi, projectId: string, runId: string, finishedOnly: boolean): Promise<void> {
  return serial(async () => {
    await migrate(api);
    const runs = await loadHistory(api, projectId);
    const run = runs.find((r) => r.id === runId);
    if (!run) return;
    if (finishedOnly && !run.finishedAt)
      throw new Error("This run is still going; it can be removed once the queue finishes");
    const left = runs.filter((r) => r !== run);
    await api.storage.set(HISTORY, left, scope(projectId));
    const queue = await load(api, projectId);
    const used = new Set([
      ...historyFiles(left),
      ...queue.tasks.flatMap((t) => (t.attachments ?? []).map((a) => a.path)),
    ]);
    const unused = [...new Set(historyFiles([run]))].filter((path) => !used.has(path));
    if (unused.length) await api.attachments.remove(unused.map((path) => ({ path, mime: "" })));
    api.emit("changed", { projectId });
  });
}

/** Explicitly reviewed cross-add-on work: idempotent by source and always pauses the queue. */
export async function addReviewed(
  args: { title: string; prompt: string; projectId: string; source: string },
  api: AddonHostApi,
): Promise<void> {
  if (
    !args.title?.trim() ||
    !args.prompt?.trim() ||
    !args.projectId ||
    !args.source ||
    args.prompt.length > 100_000
  )
    throw new Error("Invalid reviewed task");
  if (!(await api.projects()).some((p) => p.id === args.projectId))
    throw new Error("Task project no longer exists");
  await change(api, args.projectId, (q) => {
    if (q.tasks.some((t) => t.from === args.source)) return [q, undefined];
    return [
      addTasks({ ...q, running: false }, [{ title: args.title, prompt: args.prompt }], {
        projectId: args.projectId,
        newChat: true,
        permissionMode: "plan",
        from: args.source,
      }),
      undefined,
    ];
  });
}

export async function add(
  args: {
    /** Prompts, or tasks that say whether they start a new chat (the Add tasks dialog's chats). */
    prompts: Array<string | NewTask>;
    projectId: string;
    newChat: boolean;
    permissionMode?: PermissionMode;
    from?: string;
  },
  api: AddonHostApi,
): Promise<Queue> {
  const projectId = await projectArg(api, args?.projectId);
  return change(api, projectId, async (q) => {
    const next = await advance(api, addTasks(q, args.prompts, { ...args, projectId }));
    return [next, next];
  });
}

export async function update(
  args: ProjectArgs & {
    id: string;
    prompt?: string;
    title?: string;
    newChat?: boolean;
    permissionMode?: PermissionMode;
    attachments?: TaskFile[];
  },
  api: AddonHostApi,
): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), (q) => {
    const task = q.tasks.find((t) => t.id === args.id);
    if (task?.status !== "queued") throw new Error("Only a queued task can be changed");
    const attachments = args.attachments ?? task.attachments ?? [];
    const prompt =
      args.prompt?.trim() || (args.prompt !== undefined && attachments.length ? "" : task.prompt);
    return [
      replace(q, {
        ...task,
        prompt,
        attachments: attachments.length ? attachments : undefined,
        title: args.title?.trim() || (args.prompt !== undefined ? titleFor(prompt, attachments) : task.title),
        newChat: args.newChat ?? task.newChat,
        permissionMode: args.permissionMode ?? task.permissionMode,
      }),
      undefined,
    ];
  });
}

export async function remove(args: ProjectArgs & { id: string }, api: AddonHostApi): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), (q) => {
    const task = q.tasks.find((t) => t.id === args.id);
    if (task && isActive(task)) throw new Error("A running task can't be removed; skip it in its chat first");
    return [{ ...q, tasks: q.tasks.filter((t) => t.id !== args.id) }, undefined];
  });
}

/** Deletes files the view kept but no task took (a cancelled dialog, a removed file). */
export async function discard({ paths }: { paths: string[] }, api: AddonHostApi): Promise<void> {
  await ready(api);
  const used = new Set<string>();
  for (const p of await api.projects()) {
    for (const t of (await load(api, p.id)).tasks) for (const a of t.attachments ?? []) used.add(a.path);
    for (const path of historyFiles(await loadHistory(api, p.id))) used.add(path);
  }
  const unused = (paths ?? []).filter((p) => typeof p === "string" && !used.has(p));
  if (unused.length) await api.attachments.remove(unused.map((path) => ({ path, mime: "" })));
}

/**
 * Moves queued tasks (one, or a whole chat): `slot` puts them where a drag dropped them, `to` steps
 * them (Alt+↑/↓, Move up/down/to top/to bottom). Both keep to the rules in `dropSlots` (D-307).
 */
export async function move(
  args: ProjectArgs & { ids: string[]; slot?: DropSlot; to?: -1 | 1 | "top" | "bottom" },
  api: AddonHostApi,
): Promise<void> {
  const ids = Array.isArray(args?.ids) ? args.ids.filter((id) => typeof id === "string") : [];
  await change(api, await projectArg(api, args?.projectId), (q) => [
    args.slot
      ? moveTasks(q, ids, { before: args.slot.before, join: !!args.slot.join })
      : stepTasks(q, ids, args.to ?? 1),
    undefined,
  ]);
}

export async function skip(args: ProjectArgs & { id: string }, api: AddonHostApi): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), (q) => {
    const task = q.tasks.find((t) => t.id === args.id);
    if (task?.status !== "queued") return [q, undefined];
    return [replace(q, { ...task, status: "skipped" }), undefined];
  });
}

export async function runAgain(args: ProjectArgs & { id: string }, api: AddonHostApi): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), async (q) => [
    await advance(api, requeue(q, args.id)),
    undefined,
  ]);
}

/** A task from a past run back in the queue: a new queued copy, with its files. */
export async function runFromHistory(
  args: ProjectArgs & { runId: string; id: string },
  api: AddonHostApi,
): Promise<void> {
  const projectId = await projectArg(api, args?.projectId);
  await ready(api);
  const task = (await loadHistory(api, projectId))
    .find((r) => r.id === args.runId)
    ?.tasks.find((t) => t.id === args.id);
  if (!task) throw new Error("That task is no longer in the history");
  await change(api, projectId, async (q) => [
    await advance(
      api,
      addTasks(q, [{ prompt: task.prompt, title: task.title, attachments: task.attachments }], {
        projectId,
        newChat: true,
        permissionMode: task.permissionMode,
      }),
    ),
    undefined,
  ]);
}

/**
 * Tasks back in the queue as if they never ran (`ids`), or the whole queue (no ids): then it is paused
 * and its open run leaves the history too. A running task's chat isn't stopped, only no longer followed.
 */
export async function reset(args: ProjectArgs & { ids?: string[] }, api: AddonHostApi): Promise<void> {
  const projectId = await projectArg(api, args?.projectId);
  const ids = Array.isArray(args.ids) ? args.ids.filter((id) => typeof id === "string") : undefined;
  const dropped = await change(api, projectId, async (q) => {
    const next = resetTasks(q, ids);
    if (!ids) return [next, q.runId];
    // A task taken back while its chat runs pauses the queue, so it isn't sent again at once.
    const wasActive = q.tasks.some((t) => ids.includes(t.id) && isActive(t));
    return [wasActive ? { ...next, running: false } : await advance(api, next), undefined];
  });
  if (dropped) await dropRun(api, projectId, dropped, false);
}

/**
 * Ask for a report (a No report or Interrupted task's ⋯ and details): sends its chat the queue's
 * request for the report; the chat answers with a late one (D-318). Only to an idle chat.
 */
export async function askReport(args: ProjectArgs & { id: string }, api: AddonHostApi): Promise<void> {
  const projectId = await projectArg(api, args?.projectId);
  await ready(api);
  const q = await load(api, projectId);
  const task = q.tasks.find((t) => t.id === args.id);
  if (!task || !canReportLate(task) || !task.sessionId)
    throw new Error("Only a task that ended without a report can be asked for one");
  const chat = await api.chats.get(task.sessionId).catch(() => undefined);
  if (!chat) throw new Error("Its chat is gone");
  if (chat.status !== "idle" && chat.status !== "error")
    throw new Error("Its chat is busy; ask again once it's idle");
  chatProjects.set(task.sessionId, projectId);
  await api.chats.send({ sessionId: task.sessionId, text: nudgeText(q, task), from: nudgeFrom(q, task) });
}

/** Ticks (`on`) or unticks queued tasks: unticked ones stay queued but Start passes them by. */
export async function select(
  args: ProjectArgs & { ids?: string[]; on: boolean },
  api: AddonHostApi,
): Promise<void> {
  const ids = Array.isArray(args.ids) ? args.ids.filter((id) => typeof id === "string") : undefined;
  await change(api, await projectArg(api, args?.projectId), (q) => [setLeftOut(q, !args.on, ids), undefined]);
}

export async function start(args: ProjectArgs, api: AddonHostApi): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), async (q) => [
    await advance(api, openRun({ ...q, running: true })),
    undefined,
  ]);
}

export async function pause(args: ProjectArgs, api: AddonHostApi): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), (q) => [{ ...q, running: false }, undefined]);
}

export async function setStopOnFailure(
  args: ProjectArgs & { on: boolean },
  api: AddonHostApi,
): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), (q) => [
    { ...q, stopOnFailure: args.on },
    undefined,
  ]);
}

/** Clears finished tasks from the queue; their runs stay in the history. */
export async function clearFinished(args: ProjectArgs, api: AddonHostApi): Promise<void> {
  await change(api, await projectArg(api, args?.projectId), (q) => [
    { ...q, tasks: q.tasks.filter((t) => t.status === "queued" || isActive(t)) },
    undefined,
  ]);
}

// Main tells us about the chats we started.

export async function chatChanged(
  { sessionId, status }: { sessionId: string; status: AddonChatInfo["status"] },
  api: AddonHostApi,
): Promise<void> {
  await ready(api);
  const projectId = await projectOfChat(api, sessionId);
  if (!projectId) return;
  await change(api, projectId, async (q) => {
    const task = q.tasks.find((t) => t.sessionId === sessionId && isActive(t));
    if (!task) return [q, undefined];
    if (status === "working" || status === "starting")
      return [replace(q, { ...task, status: "running", sawBusy: true }), undefined];
    if (status === "needs_you") {
      api.notify({
        title: "A queued task needs you",
        message: task.title,
        tone: "warning",
        system: true,
        actions: OPEN,
      });
      return [replace(q, { ...task, status: "needs_you", sawBusy: true }), undefined];
    }
    const chat = await api.chats.get(sessionId);
    return [await advance(api, await turnEnded(api, q, task, chat)), undefined];
  });
}

/** The Tasks view's badge: how many tasks wait for you in all projects (badges are kept in memory, so `tick` sets it again). */
async function showWaiting(api: AddonHostApi): Promise<void> {
  let waiting = 0;
  for (const p of await api.projects())
    waiting += (await load(api, p.id)).tasks.filter((t) => t.status === "needs_you").length;
  api.setBadge("tasks", waiting);
}

/** Every minute: catches up on chats that finished while nobody told us (a restart), and goes on. */
export async function tick(_args: unknown, api: AddonHostApi): Promise<void> {
  await ready(api);
  await showWaiting(api);
  for (const p of await api.projects()) {
    const q = await load(api, p.id);
    if (!q.running && !q.tasks.some(isActive)) continue;
    await change(api, p.id, async (current) => [
      await advance(api, await reconcile(api, current)),
      undefined,
    ]);
  }
}

// Claude's side: what the chat running a task is told, and its tools.

type ChatArgs = { chat?: { sessionId?: string; projectId?: string } };

export async function context(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const sessionId = args.chat?.sessionId;
  if (!sessionId) return "";
  await ready(api);
  const projectId = await projectOfChat(api, sessionId, args.chat?.projectId);
  return projectId ? taskContext(await load(api, projectId), sessionId) : "";
}

/**
 * A chat reports its task: the one it runs, or (D-318) one of its own tasks that ended without a
 * report (`taskId`, or the rules in `reportTarget`). A late report sets the task's status at once.
 */
export async function toolReport(
  args: ChatArgs & {
    outcome?: string;
    summary?: string;
    notes?: unknown;
    followUps?: unknown;
    taskId?: unknown;
  },
  api: AddonHostApi,
): Promise<string> {
  const sessionId = args.chat?.sessionId;
  const report = parseReport(args);
  const taskId = typeof args.taskId === "string" && args.taskId.trim() ? args.taskId.trim() : undefined;
  await ready(api);
  const projectId = sessionId ? await projectOfChat(api, sessionId, args.chat?.projectId, true) : undefined;
  if (!sessionId || !projectId)
    throw new Error("This chat hasn't run a task from the task queue; there is nothing to report.");
  return change(api, projectId, (q) => {
    const task = reportTarget(q, sessionId, taskId);
    const n = q.tasks.indexOf(task) + 1;
    const { queue, late, pause } = applyReport(q, task, report);
    if (pause)
      api.notify({
        title: `Task queue paused: task ${n} reported ${STATUS_LABEL[report.outcome].toLowerCase()}`,
        message: task.title,
        tone: "warning",
        system: true,
        actions: OPEN,
      });
    return [
      queue,
      late
        ? `Reported task ${n} ("${task.title}") late: ${report.outcome}.${pause ? " The queue is paused." : ""} The user sees it in the task queue.`
        : `Reported task ${n}: ${report.outcome}. The user sees it in the task queue.`,
    ];
  });
}

export async function toolAdd(
  args: ChatArgs & { tasks?: unknown; project?: string; sameChat?: boolean; start?: boolean },
  api: AddonHostApi,
): Promise<string> {
  const tasks = parseNewTasks(args.tasks);
  let projectId = args.chat?.projectId;
  if (args.project) {
    const wanted = args.project.trim().toLowerCase();
    const found = (await api.projects()).find(
      (p) => p.name.toLowerCase() === wanted || p.id === args.project,
    );
    if (!found) throw new Error(`There is no project called ${args.project}`);
    projectId = found.id;
  }
  if (!projectId) throw new Error("Say which project the tasks are for (this chat has none)");
  return change(api, projectId, async (q) => {
    let next = addTasks(q, tasks, { projectId, newChat: !args.sameChat, addedBy: args.chat?.sessionId });
    if (args.start) next = await advance(api, openRun({ ...next, running: true }));
    return [
      next,
      `Queued ${tasks.length} task${tasks.length === 1 ? "" : "s"}${
        args.start ? " and started the queue" : "; the user starts the queue from its view"
      }.\n${listing(next)}`,
    ];
  });
}

/** Claude changes queued tasks; the queue's own state (running, other tasks) stays as it is. */
export async function toolEdit(
  args: ChatArgs & { tasks?: unknown; project?: string },
  api: AddonHostApi,
): Promise<string> {
  const edits = parseTaskEdits(args.tasks);
  let projectId = args.chat?.projectId;
  if (args.project) {
    const wanted = args.project.trim().toLowerCase();
    const found = (await api.projects()).find(
      (p) => p.name.toLowerCase() === wanted || p.id === args.project,
    );
    if (!found) throw new Error(`There is no project called ${args.project}`);
    projectId = found.id;
  }
  if (!projectId) throw new Error("Say which project's queue to change (this chat has none)");
  return change(api, projectId, (q) => {
    const next = editTasks(q, edits);
    return [next, `Changed ${edits.length} task${edits.length === 1 ? "" : "s"}.\n${listing(next)}`];
  });
}

/** The chat's project's queue, or every project's that has tasks when the chat has none. */
export async function toolList(args: ChatArgs, api: AddonHostApi): Promise<string> {
  await ready(api);
  const projects = await api.projects();
  const own = args?.chat?.projectId;
  const shown = own ? projects.filter((p) => p.id === own) : projects;
  const parts: string[] = [];
  for (const p of shown) {
    const q = await load(api, p.id);
    if (own || q.tasks.length) parts.push(`${p.name}: ${listing(q)}`);
  }
  return parts.join("\n\n") || "Every task queue is empty.";
}
