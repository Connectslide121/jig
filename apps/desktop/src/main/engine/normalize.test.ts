import { describe, expect, it } from "vitest";
import { authSourceFrom, contextFrom, Normalizer, toolOutputText } from "./normalize";

const stream = (event: unknown, parent: string | null = null) => ({
  type: "stream_event",
  event,
  parent_tool_use_id: parent,
  uuid: "u",
  session_id: "s",
});

describe("Normalizer", () => {
  it("reports init with the auth source", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "system",
        subtype: "init",
        session_id: "abc",
        model: "claude-x",
        apiKeySource: "none",
        permissionMode: "default",
        slash_commands: ["/compact"],
      }),
    ).toEqual([
      {
        type: "init",
        engineSessionId: "abc",
        model: "claude-x",
        permissionMode: "default",
        authSource: "subscription",
        slashCommands: ["/compact"],
      },
    ]);
    expect(authSourceFrom("ANTHROPIC_API_KEY")).toBe("api_key");
    expect(authSourceFrom("/login managed key")).toBe("api_key");
    expect(authSourceFrom(undefined)).toBe("unknown");
  });

  it("streams text and thinking, then the complete message replaces them under the same ids", () => {
    const n = new Normalizer();
    const out = [
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "thinking" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }),
      stream({ type: "content_block_start", index: 1, content_block: { type: "text" } }),
      stream({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hel" } }),
      stream({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "lo" } }),
      stream({ type: "content_block_delta", index: 1, delta: { type: "signature_delta", signature: "x" } }),
      stream({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t1" } }),
    ].flatMap((m) => n.handle(m));
    expect(out).toEqual([
      { type: "block_start", id: "m1:thinking:0", block: "thinking", parentId: undefined },
      { type: "block_delta", id: "m1:thinking:0", text: "hmm" },
      { type: "block_start", id: "m1:text:0", block: "text", parentId: undefined },
      { type: "block_delta", id: "m1:text:0", text: "Hel" },
      { type: "block_delta", id: "m1:text:0", text: "lo" },
    ]);
    // The SDK delivers complete blocks one assistant message at a time.
    const done = [
      {
        type: "assistant",
        message: { id: "m1", content: [{ type: "thinking", thinking: "hmm." }] },
        parent_tool_use_id: null,
      },
      {
        type: "assistant",
        message: { id: "m1", content: [{ type: "text", text: "Hello" }] },
        parent_tool_use_id: null,
      },
      {
        type: "assistant",
        message: {
          id: "m1",
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }],
        },
        parent_tool_use_id: null,
      },
    ].flatMap((m) => n.handle(m));
    expect(done).toEqual([
      { type: "block_end", id: "m1:thinking:0", block: "thinking", text: "hmm.", parentId: undefined },
      { type: "block_end", id: "m1:text:0", block: "text", text: "Hello", parentId: undefined },
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" }, parentId: undefined },
    ]);
  });

  it("works without streaming and tags subagent blocks with their parent tool", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "assistant",
        message: {
          id: "m2",
          content: [
            { type: "text", text: "Hi" },
            { type: "text", text: "again" },
          ],
        },
        parent_tool_use_id: "task1",
      }),
    ).toEqual([
      { type: "block_end", id: "m2:text:0", block: "text", text: "Hi", parentId: "task1" },
      { type: "block_end", id: "m2:text:1", block: "text", text: "again", parentId: "task1" },
    ]);
  });

  it("turns tool results into events", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [{ type: "text", text: "a.txt" }],
              is_error: false,
            },
            { type: "text", text: "ignored" },
          ],
        },
      }),
    ).toEqual([{ type: "tool_result", toolUseId: "t1", output: "a.txt", isError: false }]);
    expect(n.handle({ type: "user", message: { role: "user", content: "plain" } })).toEqual([]);
  });

  it("reports results with cost and usage", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: 1200,
        total_cost_usd: 0.012,
        num_turns: 1,
        result: "done",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 0,
        },
      }),
    ).toEqual([
      {
        type: "result",
        ok: true,
        durationMs: 1200,
        totalCostUsd: 0.012,
        numTurns: 1,
        error: undefined,
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0 },
      },
    ]);
  });

  it("detects a missing login from errors", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "assistant",
        error: "authentication_failed",
        message: { content: [{ type: "text", text: "Not logged in · Please run /login" }] },
      }),
    ).toEqual([{ type: "error", message: "Not logged in · Please run /login", code: "not_signed_in" }]);
    const result = n.handle({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["Invalid API key · Please run /login"],
      duration_ms: 0,
    });
    expect(result[0]).toMatchObject({ type: "error", code: "not_signed_in" });
    expect(result[1]).toMatchObject({ type: "result", ok: false });
  });

  it("passes on plan rate-limit events (resets in seconds or milliseconds)", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "rate_limit_event",
        rate_limit_info: { status: "allowed_warning", rateLimitType: "five_hour", resetsAt: 1793178000 },
      }),
    ).toEqual([
      {
        type: "rate_limit",
        status: "allowed_warning",
        window: "five_hour",
        resetsAt: "2026-10-28T09:00:00.000Z",
      },
    ]);
    expect(
      n.handle({
        type: "rate_limit_event",
        rate_limit_info: { status: "rejected", resetsAt: 1793178000000 },
      })[0],
    ).toMatchObject({
      resetsAt: "2026-10-28T09:00:00.000Z",
    });
  });

  it("ignores unknown messages", () => {
    const n = new Normalizer();
    expect(n.handle({ type: "something_new" })).toEqual([]);
    expect(n.handle(null)).toEqual([]);
    expect(
      n.handle(stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x" } })),
    ).toEqual([]);
  });

  it("summarises tool output", () => {
    expect(toolOutputText("x")).toBe("x");
    expect(toolOutputText([{ type: "text", text: "a" }, { type: "image" }])).toBe("a\n[image]");
    expect(toolOutputText(undefined)).toBe("");
  });

  it("turns a compact boundary into a compacted event", () => {
    const n = new Normalizer();
    expect(
      n.handle({
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 150_000, post_tokens: 20_000 },
      }),
    ).toEqual([{ type: "compacted", trigger: "auto", preTokens: 150_000, postTokens: 20_000 }]);
  });

  it("reads Claude Code's context breakdown", () => {
    const c = contextFrom(
      {
        totalTokens: 50_000,
        maxTokens: 200_000,
        percentage: 25,
        categories: [
          { name: "Free space", tokens: 120_000, kind: "free" },
          { name: "System tools", tokens: 12_000, kind: "used" },
          { name: "Messages", tokens: 38_000, kind: "used" },
          { name: "Autocompact buffer", tokens: 30_000, kind: "buffer" },
          { name: "MCP tools (deferred)", tokens: 5_000, kind: "deferred" },
          { name: "Empty", tokens: 0, kind: "used" },
        ],
      },
      "t",
    );
    expect(c).toEqual({
      usedTokens: 50_000,
      maxTokens: 200_000,
      percent: 25,
      at: "t",
      categories: [
        { name: "Messages", tokens: 38_000, kind: "used" },
        { name: "System tools", tokens: 12_000, kind: "used" },
        { name: "Free space", tokens: 120_000, kind: "free" },
        { name: "Autocompact buffer", tokens: 30_000, kind: "buffer" },
      ],
    });
    expect(contextFrom({ totalTokens: 50, maxTokens: 200 }, "t").percent).toBe(25);
  });

  it("passes Claude Code's prompt suggestions on", () => {
    const n = new Normalizer();
    expect(
      n.handle({ type: "prompt_suggestion", suggestion: " Run the tests ", uuid: "u", session_id: "s" }),
    ).toEqual([{ type: "suggestion", text: "Run the tests" }]);
    expect(n.handle({ type: "prompt_suggestion", suggestion: "  " })).toEqual([]);
  });
});
