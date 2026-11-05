import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { remove, toolDelete } from "./host";
import { emptyQueue, type Queue, type Task } from "./lib/tasks";

const task = (id: string, status: Task["status"], newChat = true): Task => ({
  id,
  title: `Task ${id}`,
  prompt: `do ${id}`,
  projectId: "shop",
  newChat,
  status,
});

function fakeApi(queue: Queue) {
  const data = new Map<string, unknown>([["queue@shop", queue]]);
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
  return { api, saved: () => data.get("queue@shop") as Queue };
}

it("deletes queued tasks from a chat, all or nothing, like the Queue tab's Remove", async () => {
  const { api, saved } = fakeApi({
    ...emptyQueue(),
    tasks: [task("t1", "done"), task("t2", "queued"), task("t3", "queued", false), task("t4", "queued")],
  });
  // A rule blocks one: nothing goes, and the reason says why.
  await expect(toolDelete({ ids: ["t4", "t1"], project: "Shop" } as never, api)).rejects.toThrow(
    "only queued tasks can be deleted",
  );
  expect(saved().tasks).toHaveLength(4);
  // The first task of a chat goes: the next one starts that chat.
  const said = await toolDelete({ ids: ["t2"], chat: { sessionId: "s1", projectId: "shop" } } as never, api);
  expect(said).toContain('Deleted task t2 "Task t2".');
  expect(saved().tasks.map((t) => [t.id, t.newChat])).toEqual([
    ["t1", true],
    ["t3", true],
    ["t4", true],
  ]);
  await expect(toolDelete({ ids: [], project: "Shop" } as never, api)).rejects.toThrow(/addon_tasks_list/);
  await expect(toolDelete({ ids: ["t3"], project: "Blog" } as never, api)).rejects.toThrow(
    "There is no project called Blog",
  );
  // The tab removes a finished task too, through the same code; one already gone is fine.
  await remove({ projectId: "shop", id: "t1" }, api);
  await remove({ projectId: "shop", id: "t1" }, api);
  expect(saved().tasks.map((t) => t.id)).toEqual(["t3", "t4"]);
});

it("is a tool the user approves on a card that names the tasks", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "addon.json"), "utf8"));
  const tool = manifest.contributes.tools.find((t: { id: string }) => t.id === "delete");
  expect(tool.readOnly).toBeUndefined();
  expect(tool.run).toBe("toolDelete");
  expect(Object.keys(tool.params)).toEqual(["ids", "project"]);
  for (const rule of [
    "still queued",
    "all or nothing",
    "finished ones stay",
    "next task of that chat starts",
  ])
    expect(tool.description).toContain(rule);
  expect(manifest.contributes.permissionRenderers).toContainEqual({
    tool: "delete",
    component: "DeleteTasks",
  });
});
