import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { addReviewed } from "./host";
import { emptyQueue, type Queue } from "./lib/tasks";

it("queues reviewed cross-project work once, pauses an existing queue and never starts a chat", async () => {
  // Storage per key and project, like the host's scoped storage.
  const data = new Map<string, unknown>([["queue@shop", { ...emptyQueue(), running: true }]]);
  const at = (key: string, opts?: { id?: string }) => `${key}@${opts?.id ?? ""}`;
  const queue = (projectId: string) => data.get(at("queue", { id: projectId })) as Queue;
  const create = vi.fn();
  const send = vi.fn();
  const api = {
    storage: {
      get: async (key: string, opts?: { id?: string }) => data.get(at(key, opts)),
      set: async (key: string, value: unknown, opts?: { id?: string }) => {
        data.set(at(key, opts), value);
      },
    },
    projects: async () => [{ id: "shop" }, { id: "portal" }],
    emit: vi.fn(),
    setBadge: vi.fn(),
    notify: vi.fn(),
    chats: { create, send },
    attachments: { remove: vi.fn() },
  } as unknown as AddonHostApi;
  const first = {
    title: "Review API",
    prompt: "Review the API",
    projectId: "shop",
    source: "meeting:one:action-one",
  };
  await addReviewed(first, api);
  await addReviewed(first, api);
  await addReviewed({ ...first, projectId: "portal", source: "meeting:one:action-two" }, api);
  // Each project's queue gets its own task; the running one is paused.
  expect(queue("shop").running).toBe(false);
  expect(queue("shop").tasks.map((t) => t.title)).toEqual(["Review API"]);
  expect(queue("portal").tasks.map((t) => t.projectId)).toEqual(["portal"]);
  const tasks = [...queue("shop").tasks, ...queue("portal").tasks];
  expect(tasks.every((t) => t.status === "queued" && t.permissionMode === "plan")).toBe(true);
  expect(create).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  await expect(addReviewed({ ...first, projectId: "deleted" }, api)).rejects.toThrow("no longer exists");
});
