import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { addReviewed } from "./host";
import { emptyQueue, type Queue } from "./lib/tasks";

it("queues reviewed cross-project work once, pauses an existing queue and never starts a chat", async () => {
  let queue: Queue = { ...emptyQueue(), running: true };
  const create = vi.fn();
  const send = vi.fn();
  const api = {
    storage: {
      get: async () => queue,
      set: async (_key: string, value: Queue) => {
        queue = value;
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
  expect(queue.running).toBe(false);
  expect(queue.tasks.map((t) => t.projectId)).toEqual(["shop", "portal"]);
  expect(queue.tasks.every((t) => t.status === "queued" && t.permissionMode === "plan")).toBe(true);
  expect(create).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  await expect(addReviewed({ ...first, projectId: "deleted" }, api)).rejects.toThrow("no longer exists");
});
