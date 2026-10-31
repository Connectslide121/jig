import type { AddonChatInfo, AddonHostApi } from "@jig/sdk";
import {
  addTasks,
  chatFinished,
  chatToContinue,
  emptyQueue,
  finishTask,
  isActive,
  listing,
  moveTask,
  nextTask,
  type PermissionMode,
  parseNewTasks,
  parseReport,
  type Queue,
  requeue,
  STATUS_LABEL,
  shouldPause,
  type Task,
  taskContext,
} from "./lib/tasks";

/**
 * The task queue runs here, in the add-on's host, so it goes on whether its view is open or not. One
 * queue (global storage, key `queue`). Changes go one at a time (`change`) and are announced
 * (`changed`) so the view follows. Main tells us when a chat we started changes status
 * (`chatChanged`); a watcher (`tick`) catches up after a restart.
 */

const KEY = "queue";
let chain: Promise<unknown> = Promise.resolve();

async function load(api: AddonHostApi): Promise<Queue> {
  return { ...emptyQueue(), ...((await api.storage.get<Queue>(KEY)) ?? {}) };
}

/** Runs `fn` on the queue after earlier changes, saves what it returns and tells the view. */
function change<T>(api: AddonHostApi, fn: (q: Queue) => Promise<[Queue, T]> | [Queue, T]): Promise<T> {
  const run = async () => {
    const before = await load(api);
    const json = JSON.stringify(before);
    const [next, result] = await fn(before);
    // Saved (and the view told) only when something changed: the view's own reload calls list.
    if (JSON.stringify(next) !== json || JSON.stringify(await load(api)) !== json) {
      await api.storage.set(KEY, next);
      api.emit("changed");
    }
    return result;
  };
  const result = chain.then(run, run);
  chain = result.catch(() => undefined);
  return result;
}

const replace = (q: Queue, task: Task): Queue => ({
  ...q,
  tasks: q.tasks.map((t) => (t.id === task.id ? task : t)),
});

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
    });
  }
  return next;
}

/** Starts the next queued task when the queue runs and nothing else does. */
async function advance(api: AddonHostApi, q: Queue): Promise<Queue> {
  while (q.running) {
    const task = nextTask(q);
    if (!task) {
      if (!q.tasks.some(isActive)) {
        q = { ...q, running: false };
        const done = q.tasks.filter((t) => t.status === "done").length;
        api.notify({
          title: "Task queue finished",
          message: `${done} of ${q.tasks.length} done`,
          tone: "success",
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
      // Saved as running before the message goes, so the chat's first turn gets the task's instructions.
      q = replace(q, {
        ...task,
        status: "running",
        sessionId,
        sentAt: new Date().toISOString(),
        costAtStart: before?.costUsd ?? 0,
        sawBusy: false,
      });
      await api.storage.set(KEY, q);
      await api.chats.send({ text: task.prompt, sessionId });
      return q;
    } catch (error) {
      const failed: Task = {
        ...task,
        status: "error",
        error: (error as Error).message,
        finishedAt: new Date().toISOString(),
      };
      q = replace(q, failed);
      if (shouldPause(q, failed)) {
        api.notify({ title: "Task queue paused", message: failed.error, tone: "warning" });
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
      q = settle(api, q, task, chat);
    } else if (chat.status === "idle" && !chat.queued) {
      // Idle with no answer since the task was sent: Jig closed before the chat got to it.
      q = replace(q, {
        ...task,
        status: "error",
        error: "Interrupted: Jig closed before the chat finished",
        finishedAt: new Date().toISOString(),
      });
    }
  }
  return q;
}

// Called from the view.

export async function list(_args: unknown, api: AddonHostApi): Promise<Queue> {
  return change(api, async (q) => {
    const next = await reconcile(api, q);
    return [next, next];
  });
}

export async function add(
  args: {
    prompts: string[];
    projectId?: string;
    newChat: boolean;
    permissionMode?: PermissionMode;
    from?: string;
  },
  api: AddonHostApi,
): Promise<Queue> {
  return change(api, async (q) => {
    const next = await advance(api, addTasks(q, args.prompts, args));
    return [next, next];
  });
}

export async function update(
  args: { id: string; prompt?: string; title?: string; newChat?: boolean; permissionMode?: PermissionMode },
  api: AddonHostApi,
): Promise<void> {
  await change(api, (q) => {
    const task = q.tasks.find((t) => t.id === args.id);
    if (task?.status !== "queued") throw new Error("Only a queued task can be changed");
    const prompt = args.prompt?.trim() || task.prompt;
    return [
      replace(q, {
        ...task,
        prompt,
        title: args.title?.trim() || (args.prompt ? prompt.split("\n")[0]!.slice(0, 70) : task.title),
        newChat: args.newChat ?? task.newChat,
        permissionMode: args.permissionMode ?? task.permissionMode,
      }),
      undefined,
    ];
  });
}

export async function remove({ id }: { id: string }, api: AddonHostApi): Promise<void> {
  await change(api, (q) => {
    const task = q.tasks.find((t) => t.id === id);
    if (task && isActive(task)) throw new Error("A running task can't be removed; skip it in its chat first");
    return [{ ...q, tasks: q.tasks.filter((t) => t.id !== id) }, undefined];
  });
}

export async function move({ id, delta }: { id: string; delta: -1 | 1 }, api: AddonHostApi): Promise<void> {
  await change(api, (q) => [moveTask(q, id, delta), undefined]);
}

export async function skip({ id }: { id: string }, api: AddonHostApi): Promise<void> {
  await change(api, (q) => {
    const task = q.tasks.find((t) => t.id === id);
    if (task?.status !== "queued") return [q, undefined];
    return [replace(q, { ...task, status: "skipped" }), undefined];
  });
}

export async function runAgain({ id }: { id: string }, api: AddonHostApi): Promise<void> {
  await change(api, async (q) => [await advance(api, requeue(q, id)), undefined]);
}

export async function start(_args: unknown, api: AddonHostApi): Promise<void> {
  await change(api, async (q) => [await advance(api, { ...q, running: true }), undefined]);
}

export async function pause(_args: unknown, api: AddonHostApi): Promise<void> {
  await change(api, (q) => [{ ...q, running: false }, undefined]);
}

export async function setStopOnFailure({ on }: { on: boolean }, api: AddonHostApi): Promise<void> {
  await change(api, (q) => [{ ...q, stopOnFailure: on }, undefined]);
}

export async function clearFinished(_args: unknown, api: AddonHostApi): Promise<void> {
  await change(api, (q) => [
    { ...q, tasks: q.tasks.filter((t) => t.status === "queued" || isActive(t)) },
    undefined,
  ]);
}

// Main tells us about the chats we started.

export async function chatChanged(
  { sessionId, status }: { sessionId: string; status: AddonChatInfo["status"] },
  api: AddonHostApi,
): Promise<void> {
  await change(api, async (q) => {
    const task = q.tasks.find((t) => t.sessionId === sessionId && isActive(t));
    if (!task) return [q, undefined];
    if (status === "working" || status === "starting")
      return [replace(q, { ...task, status: "running", sawBusy: true }), undefined];
    if (status === "needs_you") {
      api.notify({ title: "A queued task needs you", message: task.title, tone: "warning" });
      return [replace(q, { ...task, status: "needs_you", sawBusy: true }), undefined];
    }
    const chat = await api.chats.get(sessionId);
    if (!chatFinished(task, chat)) return [q, undefined];
    return [await advance(api, settle(api, q, task, chat)), undefined];
  });
}

/** Every minute: catches up on chats that finished while nobody told us (a restart), and goes on. */
export async function tick(_args: unknown, api: AddonHostApi): Promise<void> {
  const q = await load(api);
  if (!q.running && !q.tasks.some(isActive)) return;
  await change(api, async (current) => [await advance(api, await reconcile(api, current)), undefined]);
}

// Claude's side: what the chat running a task is told, and its tools.

type ChatArgs = { chat?: { sessionId?: string; projectId?: string } };

export async function context(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const sessionId = args.chat?.sessionId;
  return sessionId ? taskContext(await load(api), sessionId) : "";
}

export async function toolReport(
  args: ChatArgs & { outcome?: string; summary?: string; notes?: unknown; followUps?: unknown },
  api: AddonHostApi,
): Promise<string> {
  const sessionId = args.chat?.sessionId;
  const report = parseReport(args);
  return change(api, (q) => {
    const task = q.tasks.find((t) => t.sessionId === sessionId && isActive(t));
    if (!task)
      throw new Error("This chat isn't running a task from the task queue; there is nothing to report.");
    return [
      replace(q, { ...task, report }),
      `Reported: ${report.outcome}. The user sees it in the task queue.`,
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
  return change(api, async (q) => {
    let next = addTasks(q, tasks, { projectId, newChat: !args.sameChat, addedBy: args.chat?.sessionId });
    if (args.start) next = await advance(api, { ...next, running: true });
    return [
      next,
      `Queued ${tasks.length} task${tasks.length === 1 ? "" : "s"}${
        args.start ? " and started the queue" : "; the user starts the queue from its view"
      }.\n${listing(next)}`,
    ];
  });
}

export async function toolList(_args: ChatArgs, api: AddonHostApi): Promise<string> {
  return listing(await load(api));
}
