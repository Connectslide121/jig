import { describe, expect, it, vi } from "vitest";
import type { SessionMeta, SessionSnapshot } from "../../shared/engine";
import { addonChats, chatInfo } from "./chats";

const meta = (over: Partial<SessionMeta> = {}): SessionMeta =>
  ({
    id: "s1",
    cwd: "/w/shop",
    title: "Fix the login",
    createdAt: "",
    updatedAt: "",
    model: "",
    permissionMode: "default",
    status: "idle",
    authSource: "subscription",
    costUsd: 0.25,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    turns: 1,
    ...over,
  }) as SessionMeta;

const snap = (over: Partial<SessionMeta> = {}): SessionSnapshot => ({
  meta: meta(over),
  items: [
    { kind: "assistant", id: "a1", text: "first", at: "2025-01-01T10:00:00Z" },
    { kind: "assistant", id: "a2", text: "sub", at: "2025-01-01T10:02:00Z", parentId: "tool" },
    { kind: "assistant", id: "a3", text: "last", at: "2025-01-01T10:01:00Z" },
  ],
  queue: [{ id: "q", text: "later" }],
});

function setup(permitted = true) {
  const deps = {
    hasPermission: vi.fn(() => permitted),
    create: vi.fn(async (input: { title?: string }) => meta({ id: "new", title: input.title ?? "New chat" })),
    send: vi.fn(async () => {}),
    snapshot: vi.fn(async (id: string) => snap({ id })),
    notify: vi.fn(async () => undefined),
  };
  return { deps, chats: addonChats(deps) };
}

describe("chatInfo", () => {
  it("takes the last top-level answer, the queue and the error", () => {
    expect(chatInfo(snap({ lastError: "boom", projectId: "p1" }))).toEqual({
      id: "s1",
      title: "Fix the login",
      status: "idle",
      projectId: "p1",
      cwd: "/w/shop",
      costUsd: 0.25,
      queued: 1,
      lastAnswer: "last",
      lastAnswerAt: "2025-01-01T10:01:00Z",
      error: "boom",
    });
  });
});

describe("addonChats", () => {
  it("needs the chat permission", async () => {
    const { chats } = setup(false);
    await expect(chats.send("tasks", { text: "hi" })).rejects.toThrow(/chat/);
    await expect(chats.get("tasks", "s1")).rejects.toThrow(/chat/);
    await expect(chats.create("tasks", {})).rejects.toThrow(/chat/);
  });

  it("creates a chat when none is given and sends to it", async () => {
    const { chats, deps } = setup();
    const result = await chats.send("tasks", {
      text: " do it ",
      projectId: "p1",
      title: "T",
      permissionMode: "plan",
    });
    expect(result.sessionId).toBe("new");
    expect(deps.create).toHaveBeenCalledWith({
      projectId: "p1",
      cwd: undefined,
      title: "T",
      permissionMode: "plan",
    });
    expect(deps.send).toHaveBeenCalledWith("new", "do it");
  });

  it("refuses empty text and bypassing permissions", async () => {
    const { chats } = setup();
    await expect(chats.send("tasks", { text: "  " })).rejects.toThrow(/Nothing/);
    await expect(
      chats.send("tasks", { text: "x", permissionMode: "bypassPermissions" as never }),
    ).rejects.toThrow(/permission mode/);
  });

  it("tells only the add-ons following a chat about its status", async () => {
    const { chats, deps } = setup();
    await chats.send("tasks", { text: "x", sessionId: "s1" });
    await chats.get("other", "s2");
    chats.statusChanged(meta({ id: "s1", status: "working" }));
    chats.statusChanged(meta({ id: "s3", status: "idle" }));
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith("tasks", { sessionId: "s1", status: "working" });
    chats.statusChanged(meta({ id: "s2", status: "idle" }));
    expect(deps.notify).toHaveBeenLastCalledWith("other", { sessionId: "s2", status: "idle" });
  });
});
