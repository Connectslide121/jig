import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { history, markDone, toolMarkDone } from "./host";
import { emptyQueue, type Queue, type Run, type Task } from "./lib/tasks";

it("marks an errored or partly done task done by hand, from the menu or a chat's tool, and History follows (D-356, D-391)", async () => {
  const task = (id: string, status: Task["status"]): Task => ({
    id,
    title: `Task ${id}`,
    prompt: `do ${id}`,
    projectId: "shop",
    newChat: true,
    status,
    runId: "r1",
    sentAt: "2026-11-05T10:00:00Z",
    finishedAt: "2026-11-05T10:10:00Z",
    ...(status === "error" ? { error: "ChatGPT's usage limit" } : {}),
  });
  const queue: Queue = {
    ...emptyQueue(),
    tasks: [
      task("t1", "error"),
      task("t2", "no_report"),
      task("t3", "done"),
      {
        ...task("t4", "partial"),
        report: { outcome: "partial", summary: "Half of it", notes: [], followUps: ["The rest"] },
      },
    ],
  };
  const runs: Run[] = [
    { id: "r1", startedAt: "2026-11-05T10:00:00Z", finishedAt: "2026-11-05T11:00:00Z", tasks: queue.tasks },
  ];
  const data = new Map<string, unknown>([
    ["queue@shop", queue],
    ["history@shop", runs],
  ]);
  const at = (key: string, opts?: { id?: string }) => `${key}@${opts?.id ?? ""}`;
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
    notify: vi.fn(),
    chats: { list: async () => [] },
    attachments: { remove: vi.fn() },
  } as unknown as AddonHostApi;
  const saved = () => data.get("queue@shop") as Queue;

  await markDone({ projectId: "shop", id: "t1", note: "Committed on main" }, api);
  expect(saved().tasks[0]).toMatchObject({ status: "done", report: { summary: "Committed on main" } });
  expect(saved().tasks[0]!.markedDone?.was).toBe("error");
  // The closed run in History changes with it.
  const [run] = await history({ projectId: "shop" }, api);
  expect(run!.tasks[0]!.status).toBe("done");

  // From another chat, when the user asks: by id, in a named project.
  const said = await toolMarkDone(
    { taskId: "t2", project: "Shop", chat: { sessionId: "other" } } as never,
    api,
  );
  expect(said).toContain('Marked task 2 ("Task t2") as done');
  expect(saved().tasks[1]!.status).toBe("done");
  await expect(toolMarkDone({ taskId: "t3", project: "Shop" } as never, api)).rejects.toThrow(
    "only a task that ended in Error",
  );
  await expect(toolMarkDone({ project: "Shop" } as never, api)).rejects.toThrow("Say which task");

  // A Partly done task whose rest got done elsewhere (D-391): its chat's report stays with it.
  await toolMarkDone({ taskId: "t4", project: "Shop", note: "The rest ran as t9" } as never, api);
  expect(saved().tasks[3]).toMatchObject({
    status: "done",
    report: { outcome: "done", summary: "The rest ran as t9" },
    markedDone: { was: "partial", report: { outcome: "partial", summary: "Half of it" } },
  });
});
