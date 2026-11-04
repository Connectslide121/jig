import { describe, expect, it, vi } from "vitest";
import type { ChatAttachment, SessionMeta, SessionSnapshot } from "../../shared/engine";
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
    sendFrom: vi.fn(async () => {}),
    icon: vi.fn(() => "list-todo"),
    copyAttachments: vi.fn(async (_addon: string, sessionId: string, list: ChatAttachment[]) =>
      list.map((a) => ({ ...a, path: `/att/${sessionId}/${a.name}` })),
    ),
    snapshot: vi.fn(async (id: string) => snap({ id })),
    notify: vi.fn(async () => undefined),
  };
  return { deps, chats: addonChats(deps) };
}

describe("chatInfo", () => {
  it("counts background work and tells when you last stopped a turn or rejected a tool", () => {
    const base = snap({ backgroundTasks: [{ id: "b1", description: "npm run dev", type: "local_bash" }] });
    const items: SessionSnapshot["items"] = [
      ...base.items,
      { kind: "result", id: "r1", at: "2025-01-01T10:03:00Z", ok: true, durationMs: 1, stopped: true },
      {
        kind: "permission",
        id: "p1",
        at: "2025-01-01T10:05:00Z",
        status: "denied",
        request: { requestId: "x", toolName: "Bash", input: {}, canAlwaysAllow: false },
      },
      {
        kind: "permission",
        id: "p2",
        at: "2025-01-01T10:06:00Z",
        status: "allowed",
        request: { requestId: "y", toolName: "Bash", input: {}, canAlwaysAllow: false },
      },
    ];
    const info = chatInfo({ ...base, items });
    expect(info.background).toBe(1);
    expect(info.userStoppedAt).toBe("2025-01-01T10:05:00Z");
    expect(chatInfo(snap()).userStoppedAt).toBeUndefined();
  });

  it("takes the last top-level answer, the queue and the error", () => {
    expect(chatInfo(snap({ lastError: "boom", projectId: "p1" }))).toEqual({
      id: "s1",
      title: "Fix the login",
      status: "idle",
      projectId: "p1",
      cwd: "/w/shop",
      costUsd: 0.25,
      queued: 1,
      background: 0,
      lastAnswer: "last",
      lastAnswerAt: "2025-01-01T10:01:00Z",
      error: "boom",
    });
  });

  it("says what a chat that needs you waits for: its last pending card", () => {
    const pending = (toolName: string, status: "pending" | "allowed" = "pending") => ({
      kind: "permission" as const,
      id: toolName,
      at: "2025-01-01T10:03:00Z",
      status,
      request: { requestId: toolName, toolName, input: {}, canAlwaysAllow: false },
    });
    const info = (items: SessionSnapshot["items"], status: SessionMeta["status"] = "needs_you") =>
      chatInfo({ meta: meta({ status }), items, queue: [] });
    expect(info([pending("Bash")]).waitingFor).toBe("permission");
    expect(info([pending("Bash", "allowed"), pending("AskUserQuestion")]).waitingFor).toBe("question");
    expect(info([pending("ExitPlanMode")]).waitingFor).toBe("plan");
    expect(info([pending("Bash")], "working").waitingFor).toBeUndefined();
    expect(info([pending("Bash", "allowed")]).waitingFor).toBeUndefined();
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
    expect(deps.send).toHaveBeenCalledWith("new", "do it", []);
    expect(deps.copyAttachments).not.toHaveBeenCalled();
  });

  it("copies the add-on's files into the chat and sends them with the text", async () => {
    const { chats, deps } = setup();
    const file = { path: "/att/addon-tasks/a.png", mime: "image/png", name: "a.png", kind: "image" as const };
    await chats.send("tasks", { text: "look", sessionId: "s1", attachments: [file] });
    expect(deps.copyAttachments).toHaveBeenCalledWith("tasks", "s1", [file]);
    expect(deps.send).toHaveBeenCalledWith("s1", "look", [{ ...file, path: "/att/s1/a.png" }]);
  });

  it("refuses empty text and bypassing permissions", async () => {
    const { chats } = setup();
    await expect(chats.send("tasks", { text: "  " })).rejects.toThrow(/Nothing/);
    await expect(
      chats.send("tasks", { text: "x", permissionMode: "bypassPermissions" as never }),
    ).rejects.toThrow(/permission mode/);
  });

  it("sends a message from the add-on with its line and icon, only to an existing chat", async () => {
    const { chats, deps } = setup();
    await chats.send("tasks", { text: "report please", sessionId: "s1", from: "Task queue:\n asked" });
    expect(deps.sendFrom).toHaveBeenCalledWith("s1", "report please", "Task queue: asked", "list-todo");
    expect(deps.send).not.toHaveBeenCalled();
    await expect(chats.send("tasks", { text: "x", from: "Task queue" })).rejects.toThrow(/sessionId/);
    await expect(chats.send("tasks", { text: "x", sessionId: "s1", from: " " })).rejects.toThrow(/from/);
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
