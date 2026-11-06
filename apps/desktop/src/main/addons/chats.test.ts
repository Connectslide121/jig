import { describe, expect, it, vi } from "vitest";
import type { ChatAttachment, SessionMeta, SessionSnapshot } from "../../shared/engine";
import { addonChats, chatInfo, chatTimeline } from "./chats";

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
  parked: [],
});

function setup(permitted = true, chatGptReady = true, builtin = true) {
  const deps = {
    chatGptReady: vi.fn(async () => chatGptReady),
    hasPermission: vi.fn(() => permitted),
    canRead: vi.fn(() => permitted),
    list: vi.fn(async () => [
      meta({ id: "old", projectId: "p1", updatedAt: "2025-01-01T00:00:00Z" }),
      meta({ id: "new", projectId: "p1", updatedAt: "2025-03-01T00:00:00Z" }),
      meta({ id: "other", projectId: "p2", updatedAt: "2025-03-01T00:00:00Z", provider: "codex" }),
      meta({ id: "draft", projectId: "p1", updatedAt: "2025-03-01T00:00:00Z", draft: true }),
    ]),
    isBuiltin: vi.fn(() => builtin),
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

  it("says when Jig closed in the middle of its last turn (D-394)", () => {
    expect(chatInfo(snap({ cutOffAt: "2025-01-01T10:07:00Z" })).cutOffAt).toBe("2025-01-01T10:07:00Z");
    expect(chatInfo(snap())).not.toHaveProperty("cutOffAt");
  });

  it("takes the last top-level answer, the queue and the error", () => {
    expect(chatInfo(snap({ lastError: "boom", projectId: "p1" }))).toEqual({
      id: "s1",
      title: "Fix the login",
      provider: "claude",
      model: "",
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
      chatInfo({ meta: meta({ status }), items, queue: [], parked: [] });
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
      provider: undefined,
      model: undefined,
      limitFallback: true,
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

  it("refuses empty text and unknown permission modes", async () => {
    const { chats } = setup();
    await expect(chats.send("tasks", { text: "  " })).rejects.toThrow(/Nothing/);
    await expect(chats.send("tasks", { text: "x", permissionMode: "yolo" as never })).rejects.toThrow(
      /Unknown permission mode/,
    );
  });

  it("starts a Don't ask chat only for the built-in Tasks add-on (D-363)", async () => {
    const { chats, deps } = setup();
    await chats.send("tasks", { text: "x", permissionMode: "bypassPermissions" });
    expect(deps.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ permissionMode: "bypassPermissions" }),
    );
    // Another add-on with the chat permission is refused, and nothing starts.
    deps.create.mockClear();
    await expect(chats.send("notes", { text: "x", permissionMode: "bypassPermissions" })).rejects.toThrow(
      /Only the built-in Tasks add-on/,
    );
    // So is one of yours that takes the id "tasks".
    const yours = setup(true, true, false);
    await expect(
      yours.chats.create("tasks", { projectId: "p1", permissionMode: "bypassPermissions" }),
    ).rejects.toThrow(/Only the built-in Tasks add-on/);
    expect(deps.create).not.toHaveBeenCalled();
    expect(yours.deps.create).not.toHaveBeenCalled();
  });

  it("starts a new chat on the provider and model asked for (D-330)", async () => {
    const { chats, deps } = setup();
    await chats.create("tasks", { projectId: "p1", provider: "chatgpt", model: "sol" });
    expect(deps.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "codex", model: "sol" }),
    );
    await chats.create("tasks", { projectId: "p1", provider: "claude", model: "claude-opus-5-5[1m]" });
    expect(deps.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "claude", model: "claude-opus-5-5[1m]" }),
    );
    await expect(chats.create("tasks", { provider: "gemini" as never })).rejects.toThrow(/Unknown provider/);
    await expect(chats.create("tasks", { model: "rm -rf /" })).rejects.toThrow(/model id/);
  });

  it("refuses a provider or model for a chat that exists: a chat keeps its provider", async () => {
    const { chats, deps } = setup();
    await expect(chats.send("tasks", { text: "x", sessionId: "s1", provider: "chatgpt" })).rejects.toThrow(
      /only for a new chat/,
    );
    await expect(chats.send("tasks", { text: "x", sessionId: "s1", model: "opus" })).rejects.toThrow(
      /only for a new chat/,
    );
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("fails clearly when ChatGPT isn't signed in", async () => {
    const { chats, deps } = setup(true, false);
    await expect(chats.create("tasks", { provider: "chatgpt" })).rejects.toThrow(/^ChatGPT isn't signed in/);
    expect(deps.create).not.toHaveBeenCalled();
    await chats.create("tasks", { provider: "claude" });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it("tells a chat's provider and model", () => {
    expect(chatInfo(snap({ provider: "codex", model: "sol" }))).toMatchObject({
      provider: "chatgpt",
      model: "sol",
    });
    expect(chatInfo(snap())).toMatchObject({ provider: "claude", model: "" });
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

describe("chatInfo: a limit (D-338)", () => {
  it("says the chat's limit, and who runs it", () => {
    const info = chatInfo({
      meta: {
        id: "s",
        provider: "claude",
        cwd: "/x",
        title: "T",
        createdAt: "",
        updatedAt: "",
        model: "",
        permissionMode: "default",
        status: "error",
        authSource: "subscription",
        costUsd: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        turns: 1,
        limit: { itemId: "l", provider: "codex", state: "waiting", resetsAt: "2026-11-04T14:00:00Z" },
      },
      items: [],
      queue: [],
      parked: [],
    });
    expect(info.limit).toEqual({ provider: "chatgpt", state: "waiting", resetsAt: "2026-11-04T14:00:00Z" });
  });
});

describe("chats read API (D-423)", () => {
  it("lists chats by project and time, without following them", async () => {
    const { chats, deps } = setup();
    expect((await chats.list("chat-time")).map((c) => c.sessionId)).toEqual(["old", "new", "other"]);
    const recent = await chats.list("chat-time", { projectId: "p1", since: "2025-02-01T00:00:00Z" });
    expect(recent.map((c) => c.sessionId)).toEqual(["new"]);
    expect((await chats.list("chat-time", { since: Date.parse("2025-02-01") }))[1]).toMatchObject({
      sessionId: "other",
      provider: "chatgpt",
    });
    await expect(chats.list("chat-time", { since: "soon" })).rejects.toThrow(/since/);
    chats.statusChanged(meta({ id: "new" }));
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("is refused without chat:read", async () => {
    const { chats } = setup(false);
    await expect(chats.list("x")).rejects.toThrow(/chat:read/);
    await expect(chats.timeline("x", "s1")).rejects.toThrow(/chat:read/);
  });

  it("gives turns, tool calls with their ends and steps, with long text cut", () => {
    const long = "x".repeat(1000);
    const timeline = chatTimeline([
      { kind: "user", id: "u", text: "hi", at: "2025-01-01T10:00:00Z" },
      {
        kind: "tool",
        id: "t",
        name: "Bash",
        input: { command: long, nested: { a: long } },
        status: "done",
        output: long,
        at: "2025-01-01T10:00:01Z",
        endedAt: "2025-01-01T10:00:05Z",
        durationMs: 4000,
      },
      {
        kind: "permission",
        id: "permission:t2",
        request: { requestId: "t2", toolName: "Bash", input: {}, canAlwaysAllow: false },
        status: "allowed",
        at: "2025-01-01T10:00:06Z",
      },
      { kind: "tool", id: "t2", name: "Bash", input: {}, status: "running", at: "2025-01-01T10:00:06Z" },
      { kind: "assistant", id: "a", text: "done", at: "2025-01-01T10:00:09Z", parentId: "t" },
      { kind: "result", id: "r", ok: true, durationMs: 10_000, at: "2025-01-01T10:00:10Z" },
    ]);
    expect(timeline.map((e) => e.kind)).toEqual(["step", "tool", "tool", "step", "turn"]);
    const tool = timeline[1] as Extract<(typeof timeline)[number], { kind: "tool" }>;
    expect(tool).toMatchObject({ endedAt: "2025-01-01T10:00:05Z", durationMs: 4000 });
    expect(String(tool.input.command).length).toBe(301);
    expect(String((tool.input.nested as { a: string }).a).length).toBe(301);
    expect(tool.outputStart?.length).toBe(300);
    expect(timeline[2]).toMatchObject({ askedPermission: true, status: "running" });
    expect(timeline[2]).not.toHaveProperty("endedAt");
    expect(timeline[3]).toMatchObject({ what: "assistant", parentId: "t" });
    expect(timeline[4]).toMatchObject({ durationMs: 10_000, ok: true });
    expect(JSON.stringify(timeline)).not.toContain('"hi"');
  });
});
