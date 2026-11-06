import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { park, toolAdd, toolEdit, update } from "./host";
import { emptyQueue, type Queue, type Task } from "./lib/tasks";

const task = (id: string, newChat: boolean, parked = false): Task => ({
  id,
  title: `Task ${id}`,
  prompt: `do ${id}`,
  projectId: "shop",
  newChat,
  status: "queued",
  ...(parked ? { parked: true } : {}),
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

/** The queue as a picture: a parked task marked with ~, a chat's first task in capitals. */
const draw = (q: Queue) =>
  q.tasks.map((t) => `${t.parked ? "~" : ""}${t.newChat ? t.id.toUpperCase() : t.id}`).join("");

const chat = { sessionId: "s1", projectId: "shop" };

it("parks and unparks a whole chat from the view, keeping it together (D-396)", async () => {
  const { api, saved } = fakeApi({
    ...emptyQueue(),
    tasks: [task("a", true), task("b", false), task("c", true)],
  });
  await park({ projectId: "shop", ids: ["a", "b"], on: true }, api);
  expect(draw(saved())).toBe("C~A~b");
  await park({ projectId: "shop", ids: ["a", "b"], on: false }, api);
  expect(draw(saved())).toBe("CAb");
  expect(saved().tasks.every((t) => !t.parked && true)).toBe(true);
});

it("lets Claude park a chat with wholeChat and add a parked chat with sameChat", async () => {
  const { api, saved } = fakeApi({
    ...emptyQueue(),
    tasks: [task("a", true), task("b", false), task("c", true)],
  });
  await toolEdit({ chat, tasks: [{ id: "b", parked: true, wholeChat: true }] } as never, api);
  expect(draw(saved())).toBe("C~A~b");
  const said = await toolAdd({ chat, tasks: ["one", "two"], parked: true, sameChat: true } as never, api);
  expect(said).toContain("as one parked chat");
  expect(draw(saved())).toBe("C~A~b~t1~t2");
  // Parked with the same chat into an empty pool: the first one still starts a chat.
  const empty = fakeApi({ ...emptyQueue(), tasks: [task("a", true)] });
  await toolAdd({ chat, tasks: ["one", "two"], parked: true, sameChat: true } as never, empty.api);
  expect(draw(empty.saved())).toBe("A~T1~t2");
  // Unparking the chat again: wholeChat puts it back as a chat of the queue.
  await toolEdit({ chat, tasks: [{ id: "t2", parked: false, wholeChat: true }] } as never, empty.api);
  expect(draw(empty.saved())).toBe("AT1t2");
  expect(empty.saved().tasks.some((t) => t.parked)).toBe(false);
});

it("lets a parked task continue the parked one before it, never a chat of the queue", async () => {
  const { api, saved } = fakeApi({
    ...emptyQueue(),
    tasks: [task("a", true), task("x", true, true), task("y", true, true)],
  });
  await update({ projectId: "shop", id: "y", newChat: false }, api);
  expect(draw(saved())).toBe("A~X~y");
  // The pool's first can't continue the queue's chat: it keeps starting its own.
  await update({ projectId: "shop", id: "x", newChat: false }, api);
  expect(draw(saved())).toBe("A~X~y");
  await expect(toolEdit({ chat, tasks: [{ id: "x", newChat: false }] } as never, api)).rejects.toThrow(
    /first parked task/,
  );
});
