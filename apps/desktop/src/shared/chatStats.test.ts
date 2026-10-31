import { describe, expect, it } from "vitest";
import { chatStats, diffLines, formatDuration, relativeTo, toolLabel, totalTokens } from "./chatStats";
import type { ChatItem } from "./engine";

const at = "2026-10-31T10:00:00.000Z";

const items: ChatItem[] = [
  { kind: "user", id: "u1", text: "Fix the cart total", at },
  { kind: "thinking", id: "th", text: "hmm", at },
  { kind: "tool", id: "r1", name: "Read", input: { file_path: "/w/shop/cart.ts" }, status: "done", at },
  { kind: "tool", id: "r2", name: "Read", input: { file_path: "/w/shop/cart.ts" }, status: "done", at },
  {
    kind: "tool",
    id: "e1",
    name: "Edit",
    input: { file_path: "/w/shop/cart.ts" },
    status: "done",
    diff: "--- a\n+++ b\n@@ -1,2 +1,3 @@\n-old\n+new\n+more\n same",
    at,
  },
  { kind: "tool", id: "e2", name: "Write", input: { file_path: "/w/shop/a.ts" }, status: "error", at },
  { kind: "tool", id: "b1", name: "Bash", input: { command: "npm test" }, status: "error", at },
  { kind: "tool", id: "s1", name: "Skill", input: { skill: "explain-code" }, status: "done", at },
  { kind: "tool", id: "m1", name: "mcp__jig__jig_open_url", input: {}, status: "done", at },
  { kind: "tool", id: "m2", name: "mcp__jig__jig_screenshot", input: {}, status: "done", at },
  { kind: "tool", id: "w1", name: "WebSearch", input: { query: "x" }, status: "done", at },
  {
    kind: "tool",
    id: "t1",
    name: "Task",
    input: { subagent_type: "Explore", description: "Find the cart code" },
    status: "done",
    task: { id: "t1", status: "completed", description: "Find the cart code", toolUses: 2, tokens: 900 },
    at,
  },
  { kind: "tool", id: "t1a", name: "Grep", input: {}, status: "done", at, parentId: "t1" },
  {
    kind: "tool",
    id: "t1b",
    name: "Read",
    input: { file_path: "/w/shop/b.ts" },
    status: "done",
    at,
    parentId: "t1",
  },
  { kind: "assistant", id: "sa", text: "found", at, parentId: "t1" },
  {
    kind: "permission",
    id: "p1",
    status: "allowed",
    at,
    request: { id: "p1", toolName: "Bash", input: {}, title: "", canAlwaysAllow: true } as never,
  },
  {
    kind: "permission",
    id: "p2",
    status: "denied",
    at,
    request: { id: "p2", toolName: "Bash", input: {}, title: "", canAlwaysAllow: true } as never,
  },
  { kind: "assistant", id: "a1", text: "Done.", at },
  { kind: "result", id: "res1", ok: true, durationMs: 30_000, at },
  { kind: "user", id: "u2", text: "/review the cart", at },
  { kind: "shell", id: "sh", command: "git status", output: "", status: "done", at },
  { kind: "result", id: "res2", ok: false, durationMs: 5_000, at },
];

describe("chatStats", () => {
  it("counts tools, skills, subagents, MCP, files, turns and permissions", () => {
    const s = chatStats(items);
    expect(s).toMatchObject({
      messages: 2,
      replies: 1,
      turns: 2,
      failedTurns: 1,
      workingMs: 35_000,
      thinking: 1,
      toolCalls: 12,
      toolErrors: 2,
      subagentToolCalls: 2,
      linesAdded: 2,
      linesRemoved: 1,
      filesRead: 2,
      bash: 1,
      shell: 1,
      web: 1,
      permissions: { asked: 2, allowed: 1, denied: 1 },
    });
    expect(s.tools[0]).toEqual({ name: "Read", calls: 3, errors: 0 });
    expect(s.tools.find((t) => t.name === "Bash")).toEqual({ name: "Bash", calls: 1, errors: 1 });
    expect(s.skills).toEqual([{ name: "explain-code", count: 1 }]);
    expect(s.commands).toEqual([{ name: "review", count: 1 }]);
    expect(s.mcp).toEqual([{ server: "jig", calls: 2, tools: 2 }]);
    // A failed write changed nothing.
    expect(s.files).toEqual([{ path: "/w/shop/cart.ts", edits: 1, added: 2, removed: 1 }]);
    expect(s.subagents).toEqual([
      {
        id: "t1",
        type: "Explore",
        description: "Find the cart code",
        status: "completed",
        toolUses: 2,
        tokens: 900,
        durationMs: undefined,
      },
    ]);
  });

  it("an empty chat counts nothing", () => {
    expect(chatStats([])).toMatchObject({ toolCalls: 0, tools: [], files: [], turns: 0 });
  });

  it("a subagent without progress info counts its calls; a skill named by command", () => {
    const s = chatStats([
      { kind: "tool", id: "t", name: "Agent", input: {}, status: "running", at },
      { kind: "tool", id: "x", name: "Glob", input: {}, status: "done", at, parentId: "t" },
      { kind: "tool", id: "k", name: "Skill", input: { command: "/pdf" }, status: "done", at },
    ]);
    expect(s.subagents[0]).toMatchObject({ type: "general-purpose", status: "running", toolUses: 1 });
    expect(s.skills).toEqual([{ name: "pdf", count: 1 }]);
  });
});

describe("helpers", () => {
  it("diffLines skips file headers", () => {
    expect(diffLines("--- a\n+++ b\n+x\n-y\n-z\n ctx")).toEqual({ added: 1, removed: 2 });
    expect(diffLines(undefined)).toEqual({ added: 0, removed: 0 });
  });
  it("toolLabel names MCP tools by server", () => {
    expect(toolLabel("mcp__github__list_issues")).toBe("github · list_issues");
    expect(toolLabel("Read")).toBe("Read");
  });
  it("formatDuration", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(200_000)).toBe("3m 20s");
    expect(formatDuration(3_900_000)).toBe("1h 05m");
  });
  it("relativeTo", () => {
    expect(relativeTo("/w/shop", "/w/shop/src/a.ts")).toBe("src/a.ts");
    expect(relativeTo("/w/shop/", "/w/other/a.ts")).toBe("/w/other/a.ts");
    expect(relativeTo("C:\\w\\shop", "C:\\w\\shop\\a.ts")).toBe("a.ts");
  });
  it("totalTokens", () => {
    expect(
      totalTokens({ usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 } }),
    ).toBe(10);
  });
});
