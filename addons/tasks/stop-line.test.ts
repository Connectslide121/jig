import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { chatChanged, list, start, stop } from "./host";
import { emptyQueue, type Queue, type Task } from "./lib/tasks";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  prompt: `do ${id}`,
  projectId: "shop",
  newChat: true,
  status: "queued",
  ...over,
});

function fakeApi(queue: Queue) {
  const data = new Map<string, unknown>([["queue@shop", queue]]);
  const at = (key: string, opts?: { id?: string }) => `${key}@${opts?.id ?? ""}`;
  let made = 0;
  const create = vi.fn(async () => ({ sessionId: `s${++made + 1}`, provider: "claude" }));
  const send = vi.fn(async () => undefined);
  const notify = vi.fn();
  const api = {
    storage: {
      get: async (key: string, opts?: { id?: string }) => data.get(at(key, opts)),
      set: async (key: string, value: unknown, opts?: { id?: string }) => {
        data.set(at(key, opts), value);
      },
    },
    projects: async () => [{ id: "shop", name: "Shop" }],
    emit: vi.fn(),
    setBadge: vi.fn(),
    notify,
    chats: {
      list: async () => [],
      get: async (id: string) => ({ id, title: "A chat", status: "idle", costUsd: 0 }),
      create,
      send,
    },
    attachments: { remove: vi.fn() },
  } as unknown as AddonHostApi;
  return { api, saved: () => data.get("queue@shop") as Queue, create, notify };
}

/** The queue as a picture: a finished task in capitals-free "done", a stop line as |. */
const draw = (q: Queue) =>
  q.tasks
    .map((t) => `${t.id}${t.status === "queued" ? "" : `:${t.status}`}${t.stopAfter ? "|" : ""}`)
    .join(" ");

/** Task `a` is running (reported, its chat idle again) with a stop line after it, b and c wait. */
const aRunning = (): Queue => ({
  ...emptyQueue(),
  running: true,
  runId: "r1",
  tasks: [
    task("a", {
      status: "running",
      sessionId: "s1",
      sentAt: "2026-11-06T10:00:00Z",
      sawBusy: true,
      runId: "r1",
      stopAfter: true,
      report: { outcome: "done", summary: "ok", notes: [], followUps: [] },
    }),
    task("b"),
    task("c"),
  ],
});

it("ends the run at a stop line, uses the line up, and the next Start runs the next block", async () => {
  const { api, saved, create, notify } = fakeApi(aRunning());
  await chatChanged({ sessionId: "s1", status: "idle" }, api);
  // a finished, the line is gone, the run is closed and the queue paused: b hasn't started.
  expect(draw(saved())).toBe("a:done b c");
  expect(saved().running).toBe(false);
  expect(saved().runId).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Stopped at the stop line: 1 of 1 done",
      title: "Task queue stopped at a stop line in Shop",
    }),
  );
  await start({ projectId: "shop" }, api);
  expect(draw(saved())).toBe("a:done b:running c");
  expect(saved().running).toBe(true);
  expect(create).toHaveBeenCalledTimes(1);
});

it("finishes as usual when the line was the last thing in the queue", async () => {
  const q = aRunning();
  q.tasks = [q.tasks[0]!];
  const { api, saved, notify } = fakeApi(q);
  await chatChanged({ sessionId: "s1", status: "idle" }, api);
  expect(saved().running).toBe(false);
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: "1 of 1 done" }));
});

it("a Start after a pause passes a line that was already reached", async () => {
  const q: Queue = {
    ...emptyQueue(),
    running: false,
    tasks: [task("a", { status: "done", stopAfter: true, runId: "r1" }), task("b"), task("c")],
  };
  const { api, saved } = fakeApi(q);
  await start({ projectId: "shop" }, api);
  expect(draw(saved())).toBe("a:done b:running c");
});

it("places, moves and removes lines from the view, and loads a queue saved with the old tick", async () => {
  const old = {
    ...emptyQueue(),
    tasks: [task("a"), { ...task("b"), leftOut: true }, task("c")],
  } as unknown as Queue;
  const { api, saved } = fakeApi(old);
  const loaded = await list({ projectId: "shop" }, api);
  expect(loaded.tasks.every((t) => !("leftOut" in t))).toBe(true);
  await stop({ projectId: "shop", id: "a", on: true }, api);
  expect(draw(saved())).toBe("a| b c");
  await stop({ projectId: "shop", id: "a", to: "b" }, api);
  expect(draw(saved())).toBe("a b| c");
  await stop({ projectId: "shop", id: "b", on: false }, api);
  expect(draw(saved())).toBe("a b c");
  expect(saved().tasks.every((t) => !("leftOut" in t))).toBe(true);
  await expect(stop({ projectId: "shop", id: "zz", on: true }, api)).rejects.toThrow(/no task zz/);
});
