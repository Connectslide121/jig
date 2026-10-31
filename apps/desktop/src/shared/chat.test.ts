import { describe, expect, it } from "vitest";
import { applyUpdate, type ChatState, permissionItemId, reduceEvent } from "./chat";
import type { SessionMeta } from "./engine";

const meta = (): SessionMeta => ({
  id: "s",
  projectId: "p",
  cwd: "/",
  title: "t",
  createdAt: "",
  updatedAt: "",
  model: "",
  permissionMode: "default",
  status: "working",
  authSource: "unknown",
  costUsd: 0.5,
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  turns: 0,
});

const state = (): ChatState => ({ meta: meta(), items: [] });

describe("reduceEvent", () => {
  it("keeps opusplan selected when init reports a resolved Opus version", () => {
    const s = state();
    s.meta.model = "opusplan";
    reduceEvent(s, {
      type: "init",
      engineSessionId: "e",
      model: "claude-opus-version",
      permissionMode: "plan",
      authSource: "subscription",
      slashCommands: [],
    });
    expect(s.meta.model).toBe("opusplan");
    expect(s.meta.activeModel).toBe("claude-opus-version");
  });
  it("streams a block and finalises it", () => {
    const s = state();
    reduceEvent(s, { type: "block_start", id: "b", block: "text" });
    const updates = reduceEvent(s, { type: "block_delta", id: "b", text: "Hi" });
    expect(updates).toEqual([{ op: "append", id: "b", text: "Hi" }]);
    reduceEvent(s, { type: "block_end", id: "b", block: "text", text: "Hi!" });
    expect(s.items).toEqual([expect.objectContaining({ kind: "assistant", id: "b", text: "Hi!" })]);
    expect(s.items[0]).not.toHaveProperty("streaming", true);
    // Deltas for unknown blocks are ignored.
    expect(reduceEvent(s, { type: "block_delta", id: "zz", text: "x" })).toEqual([]);
  });

  it("warns when the session uses an API key", () => {
    const s = state();
    reduceEvent(s, {
      type: "init",
      engineSessionId: "e",
      model: "m",
      permissionMode: "default",
      authSource: "api_key",
      slashCommands: [],
    });
    expect(s.meta).toMatchObject({ engineSessionId: "e", activeModel: "m", authSource: "api_key" });
    expect(s.items[0]).toMatchObject({ kind: "notice", tone: "warning" });
  });

  it("tracks tools and permissions", () => {
    const s = state();
    reduceEvent(s, { type: "tool_use", id: "t", name: "Bash", input: { command: "ls" } });
    reduceEvent(s, {
      type: "permission",
      request: { requestId: "t", toolName: "Bash", input: {}, canAlwaysAllow: false },
    });
    expect(s.meta.status).toBe("needs_you");
    reduceEvent(s, { type: "permission_resolved", requestId: "t", status: "allowed" });
    expect(s.meta.status).toBe("working");
    reduceEvent(s, { type: "tool_result", toolUseId: "t", output: "a", isError: false });
    expect(s.items.find((i) => i.id === "t")).toMatchObject({ kind: "tool", status: "done", output: "a" });
    expect(s.items.find((i) => i.id === permissionItemId("t"))).toMatchObject({ status: "allowed" });
  });

  it("ends a turn: cost delta, usage sum, pending prompts cancelled, failed tools marked", () => {
    const s = state();
    reduceEvent(s, { type: "block_start", id: "b", block: "text" });
    reduceEvent(s, { type: "tool_use", id: "t", name: "Bash", input: {} });
    reduceEvent(s, {
      type: "permission",
      request: { requestId: "r", toolName: "Bash", input: {}, canAlwaysAllow: false },
    });
    reduceEvent(s, {
      type: "result",
      ok: false,
      durationMs: 5,
      totalCostUsd: 0.75,
      usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
      error: "boom",
    });
    expect(s.meta).toMatchObject({ status: "error", costUsd: 0.75, turns: 1, lastError: "boom" });
    expect(s.meta.usage).toEqual({
      inputTokens: 11,
      outputTokens: 3,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
    });
    expect(s.items.find((i) => i.kind === "result")).toMatchObject({ costUsd: 0.25, ok: false });
    expect(s.items.find((i) => i.kind === "tool")).toMatchObject({ status: "error" });
    expect(s.items.find((i) => i.kind === "permission")).toMatchObject({ status: "cancelled" });
    expect(s.items.find((i) => i.kind === "assistant")).toMatchObject({ streaming: false });
  });

  it("records errors and login problems, and goes idle on exit", () => {
    const s = state();
    reduceEvent(s, { type: "error", message: "Not logged in", code: "not_signed_in" });
    expect(s.meta).toMatchObject({ status: "error", needsLogin: true });
    const t = state();
    reduceEvent(t, { type: "tool_use", id: "x", name: "Read", input: {} });
    reduceEvent(t, { type: "exit" });
    expect(t.meta.status).toBe("idle");
    expect(t.items[0]).toMatchObject({ status: "error" });
  });
});

describe("background tasks", () => {
  it("drops a background task Claude Code says finished, even without a new list", () => {
    const s = state();
    reduceEvent(s, {
      type: "background_tasks",
      tasks: [{ id: "t1", description: "grep", type: "local_bash" }],
    });
    expect(s.meta.backgroundTasks).toHaveLength(1);
    reduceEvent(s, { type: "task", task: { id: "t1", status: "running", description: "" } });
    expect(s.meta.backgroundTasks).toHaveLength(1);
    reduceEvent(s, { type: "task", task: { id: "t1", status: "completed", description: "" } });
    expect(s.meta.backgroundTasks).toEqual([]);
  });
});

describe("applyUpdate", () => {
  it("upserts and appends", () => {
    const items = applyUpdate([], { op: "upsert", item: { kind: "assistant", id: "a", text: "x", at: "" } });
    applyUpdate(items, { op: "append", id: "a", text: "y" });
    applyUpdate(items, { op: "upsert", item: { kind: "user", id: "u", text: "q", at: "" } });
    expect(items.map((i) => (i.kind === "assistant" || i.kind === "user" ? i.text : ""))).toEqual([
      "xy",
      "q",
    ]);
    applyUpdate(items, { op: "append", id: "u", text: "ignored" });
    expect(items[1]).toMatchObject({ text: "q" });
  });
});
