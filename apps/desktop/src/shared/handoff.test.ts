import { describe, expect, it } from "vitest";
import type { ChatItem } from "./engine";
import { buildHandoff, featuresLost, HANDOFF_MAX, mapModelAndEffort, modelTier } from "./handoff";

const at = "2026-01-01T10:00:00.000Z";
const user = (id: string, text: string, from?: string): ChatItem => ({
  kind: "user",
  id,
  text,
  at,
  ...(from ? { from } : {}),
});
const reply = (id: string, text: string, parentId?: string): ChatItem => ({
  kind: "assistant",
  id,
  text,
  at,
  ...(parentId ? { parentId } : {}),
});
const tool = (
  id: string,
  name: string,
  input: Record<string, unknown>,
  status: "done" | "error" | "running" = "done",
): ChatItem => ({
  kind: "tool",
  id,
  name,
  input,
  status,
  at,
});

describe("buildHandoff", () => {
  it("is empty for a chat without a message of yours", () => {
    expect(buildHandoff({ items: [], from: "claude", to: "codex", reason: "limit" })).toBe("");
    expect(
      buildHandoff({
        items: [user("u", "Report please", "Task queue")],
        from: "claude",
        to: "codex",
        reason: "limit",
      }),
    ).toBe("");
  });

  it("hands over the goal, recent messages, replies, plan, to-dos, files and where it stopped", () => {
    const items: ChatItem[] = [
      user("u1", "Fix the cart total in the Shop app"),
      reply("a1", "Looking at cart.ts."),
      reply("sub", "A subagent's note", "t0"),
      tool("t1", "Edit", { file_path: "src/cart.ts" }),
      tool("t2", "Write", { file_path: "src/cart.test.ts" }, "error"),
      {
        kind: "permission",
        id: "p",
        at,
        status: "allowed",
        request: {
          requestId: "r",
          toolName: "ExitPlanMode",
          input: { plan: "1. Fix\n2. Test" },
          canAlwaysAllow: false,
        },
      },
      tool("t3", "TodoWrite", {
        todos: [
          { content: "Fix the total", status: "completed" },
          { content: "Add a test", status: "in_progress" },
          { content: "Update docs", status: "pending" },
        ],
      }),
      user("u2", "Also round to cents"),
      tool("t4", "Bash", { command: "npm test" }, "running"),
    ];
    const text = buildHandoff({
      items,
      from: "claude",
      to: "codex",
      reason: "limit",
      diffStat: " src/cart.ts | 4 +-",
    });
    expect(text.startsWith("<jig-handoff>\n")).toBe(true);
    expect(text.endsWith("\n</jig-handoff>")).toBe(true);
    expect(text).toContain("Claude's plan limit was reached");
    expect(text).toContain("> Fix the cart total in the Shop app");
    expect(text).toContain("> Also round to cents");
    expect(text).toContain("> Looking at cart.ts.");
    expect(text).not.toContain("subagent's note");
    expect(text).toContain("1. Fix\n2. Test");
    expect(text).toContain("- [in progress] Add a test");
    expect(text).toContain("- [open] Update docs");
    expect(text).not.toContain("Fix the total\n");
    expect(text).toContain("- src/cart.ts");
    expect(text).not.toContain("- src/cart.test.ts");
    expect(text).toContain("src/cart.ts | 4 +-");
    expect(text).toContain("It was working on: Also round to cents");
    expect(text).toContain("Its last step: Bash npm test (not finished)");
  });

  it("stays within its size", () => {
    const long = "x".repeat(50_000);
    const items: ChatItem[] = [
      user("u1", long),
      ...Array.from({ length: 10 }, (_, i) => user(`u${i + 2}`, long)),
      reply("a", long),
    ];
    const text = buildHandoff({ items, from: "codex", to: "claude", reason: "manual", diffStat: long });
    expect(text.length).toBeLessThanOrEqual(HANDOFF_MAX + 40);
    expect(text).toContain("The user moved it to you");
  });
});

describe("mapModelAndEffort (D-339)", () => {
  const defaults = { model: "default-model", effort: "medium" as const };

  it("places a model in its tier, from a family or a full id", () => {
    expect(modelTier("opus")).toBe(0);
    expect(modelTier("claude-sonnet-5-5")).toBe(1);
    expect(modelTier("opus[1m]")).toBe(0);
    expect(modelTier("gpt-6-luna")).toBe(2);
    expect(modelTier("Terra")).toBe(1);
    expect(modelTier("")).toBeUndefined();
    expect(modelTier("claude-fable-5-1")).toBeUndefined();
    // A family word inside another word isn't that family.
    expect(modelTier("solar")).toBeUndefined();
  });

  it("moves to the same tier on the other provider and keeps an effort it has", () => {
    expect(mapModelAndEffort({ to: "codex", model: "opus", effort: "high", defaults })).toEqual({
      model: "sol",
      effort: "high",
    });
    expect(mapModelAndEffort({ to: "claude", model: "gpt-6.1-terra", effort: "xhigh", defaults })).toEqual({
      model: "sonnet",
      effort: "xhigh",
    });
  });

  it("turns ultra into max on Claude, and no effort into the defaults' one", () => {
    expect(mapModelAndEffort({ to: "claude", model: "luna", effort: "ultra", defaults }).effort).toBe("max");
    expect(mapModelAndEffort({ to: "codex", model: "haiku", effort: undefined, defaults })).toEqual({
      model: "luna",
      effort: "medium",
    });
  });

  it("takes the new provider's defaults for a model it can't place", () => {
    expect(mapModelAndEffort({ to: "codex", model: "", effort: "high", defaults })).toEqual(defaults);
    expect(mapModelAndEffort({ to: "claude", model: "my-custom", effort: undefined, defaults })).toEqual(
      defaults,
    );
  });
});

describe("featuresLost (D-339)", () => {
  it("lists what ChatGPT chats can't do that Claude chats can", () => {
    expect(featuresLost("claude", "codex")).toEqual([
      "subagents",
      "rewinding to an earlier message",
      "forking the chat",
    ]);
  });

  it("is empty the other way round", () => {
    expect(featuresLost("codex", "claude")).toEqual([]);
    expect(featuresLost("claude", "claude")).toEqual([]);
  });
});
