import { describe, expect, it } from "vitest";
import { savedThread, structuredPatch, threadMessages } from "./codexHistory";
import { PLAN_APPROVED_PROMPT, PLAN_MODE_PROMPT } from "./codexTools";

describe("Codex history (D-315)", () => {
  it("lists a thread like a saved Claude Code chat", () => {
    expect(
      savedThread({
        id: "t1",
        name: null,
        preview: "Tidy the README\nand more",
        cwd: "/work/shop",
        gitInfo: { branch: "main" },
        createdAt: 100,
        updatedAt: 200,
      }),
    ).toEqual({
      sessionId: "t1",
      provider: "codex",
      title: "Tidy the README",
      cwd: "/work/shop",
      gitBranch: "main",
      lastModified: 200_000,
      createdAt: 100_000,
    });
    expect(savedThread({ preview: "no id" })).toBeUndefined();
  });

  it("turns a unified diff into Claude Code's structured patch", () => {
    expect(structuredPatch("@@ -1,2 +1,2 @@\n-a\n+b\n c")).toEqual([
      { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: ["-a", "+b", " c"] },
    ]);
    expect(structuredPatch("@@ -3 +3 @@\n-x\n+y")[0]).toMatchObject({ oldLines: 1, newLines: 1 });
  });

  it("reads a thread's items as transcript messages, without what Jig added", () => {
    const messages = threadMessages({
      turns: [
        {
          items: [
            {
              type: "userMessage",
              id: "u1",
              content: [
                { type: "text", text: PLAN_MODE_PROMPT },
                { type: "text", text: "<jig-context>\nx\n</jig-context>\n\nTidy it" },
              ],
            },
            {
              type: "commandExecution",
              id: "c1",
              command: "bash -lc 'ls'",
              aggregatedOutput: "a",
              exitCode: 2,
            },
            {
              type: "fileChange",
              id: "f1",
              status: "completed",
              changes: [{ path: "/w/a.md", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b" }],
            },
            { type: "mcpToolCall", id: "m1", server: "jig", tool: "exit_plan", arguments: { plan: "p" } },
            { type: "agentMessage", id: "a1", text: "Done." },
          ],
        },
        {
          items: [{ type: "userMessage", id: "u2", content: [{ type: "text", text: PLAN_APPROVED_PROMPT }] }],
        },
      ],
    });
    expect(messages[0]).toMatchObject({
      type: "user",
      message: { content: [{ type: "text", text: "Tidy it" }] },
    });
    expect(messages[1]).toMatchObject({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] },
    });
    expect(messages[2]).toMatchObject({
      message: { content: [{ type: "tool_result", content: "a\nExit code 2", is_error: true }] },
    });
    expect(messages[3]).toMatchObject({
      message: { content: [{ name: "Edit", input: { file_path: "/w/a.md" } }] },
    });
    expect(messages[4]?.tool_use_result).toMatchObject({ structuredPatch: [{ lines: ["-a", "+b"] }] });
    expect(messages[5]).toMatchObject({ message: { content: [{ name: "ExitPlanMode" }] } });
    expect(messages.at(-1)).toMatchObject({ type: "assistant", message: { content: [{ text: "Done." }] } });
    // The turn Jig started itself has nothing you typed.
    expect(messages.filter((m) => m.type === "user" && m.uuid === "u2")).toHaveLength(0);
  });
});
