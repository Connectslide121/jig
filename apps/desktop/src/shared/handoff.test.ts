import { describe, expect, it } from "vitest";
import type { ChatItem } from "./engine";
import { buildHandoff, HANDOFF_MAX } from "./handoff";

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
