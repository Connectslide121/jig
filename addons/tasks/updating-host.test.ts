import type { AddonChatInfo, AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { add, chatChanged, list, start, updating } from "./host";
import type { Queue } from "./lib/tasks";

/** A host API with in-memory storage and chats that finish their turn as soon as they're sent to. */
function fakeApi() {
  const data = new Map<string, unknown>();
  const at = (key: string, opts?: { id?: string }) => `${key}@${opts?.id ?? ""}`;
  const chats = new Map<string, AddonChatInfo>();
  let n = 0;
  const api = {
    storage: {
      get: async (key: string, opts?: { id?: string }) => data.get(at(key, opts)),
      set: async (key: string, value: unknown, opts?: { id?: string }) => {
        data.set(at(key, opts), value);
      },
    },
    projects: async () => [{ id: "shop", name: "Shop", provider: "claude" }],
    emit: vi.fn(),
    notify: vi.fn(),
    setBadge: vi.fn(),
    attachments: { remove: vi.fn() },
    chats: {
      create: vi.fn(async () => {
        const id = `s${++n}`;
        chats.set(id, {
          id,
          title: "",
          provider: "claude",
          model: "",
          status: "idle",
          cwd: "",
          costUsd: 0,
          queued: 0,
          background: 0,
        });
        return { sessionId: id, provider: "claude" };
      }),
      send: vi.fn(async () => {}),
      get: async (id: string) => chats.get(id)!,
    },
  } as unknown as AddonHostApi;
  return { api, data, chats };
}

it("starts no task while Jig closes to install an update, and goes on after the restart (D-395)", async () => {
  const { api, data, chats } = fakeApi();
  await add({ projectId: "shop", prompts: ["first", "second"], newChat: true }, api);
  await start({ projectId: "shop" }, api);
  expect(api.chats.send).toHaveBeenCalledTimes(1);

  await updating({}, api);
  const held = data.get("queue@shop") as Queue;
  expect(held.running).toBe(false);
  expect(held.held?.reason).toBe("update");

  // The first task ends while Jig closes: it's recorded, but the second doesn't start.
  chats.set("s1", { ...chats.get("s1")!, lastAnswer: "Done", lastAnswerAt: new Date().toISOString() });
  await chatChanged({ sessionId: "s1", status: "working" }, api);
  await chatChanged({ sessionId: "s1", status: "idle" }, api);
  // (It ended without a report, so the queue asked for it; that message is the only one sent.)
  expect(api.chats.send).toHaveBeenCalledTimes(2);
  expect((await list({ projectId: "shop" }, api)).held).toBeTruthy();
  expect(api.chats.create).toHaveBeenCalledTimes(1);

  // After the restart (a fresh host) the queue runs again by itself.
  vi.resetModules();
  const restarted = await import("./host");
  const after = await restarted.list({ projectId: "shop" }, api);
  expect(after.running).toBe(true);
  expect(after.held).toBeUndefined();
});
