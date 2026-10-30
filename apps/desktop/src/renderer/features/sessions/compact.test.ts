import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../../shared/engine";
import { compactRows, type Entry, stepsSummary } from "./compact";

const at = "";
const tool = (
  id: string,
  name: string,
  input: Record<string, unknown>,
  status: "running" | "done" | "error" = "done",
) => ({ kind: "tool", id, name, input, status, at }) as ChatItem;
const entry = (item: ChatItem): Entry => ({ item, children: [] });

describe("the compact chat view", () => {
  it("folds each run of steps between messages into one row; questions and messages stay", () => {
    const items = [
      { kind: "user", id: "u", text: "Fix the total", at },
      { kind: "thinking", id: "t", text: "hmm", at },
      tool("b1", "Bash", { command: "npm test" }),
      tool("r1", "Read", { file_path: "cart.ts" }),
      { kind: "assistant", id: "a", text: "Found it.", at },
      tool("e1", "Edit", { file_path: "cart.ts" }),
      tool("w1", "Bash", { command: "rm -rf dist" }),
    ] as ChatItem[];
    const rows = compactRows(items.map(entry), new Set(["w1"]));
    expect(rows.map((r) => (r.kind === "steps" ? `steps:${r.entries.length}` : r.entry.item.id))).toEqual([
      "u",
      "steps:3",
      "a",
      "steps:1",
      // Waiting for your permission: in view.
      "w1",
    ]);
  });

  it("says what the steps did, which failed, and what runs now", () => {
    const steps = [
      tool("b1", "Bash", { command: "npm test" }, "error"),
      tool("b2", "Bash", { command: "npm run lint" }),
      tool("r1", "Read", { file_path: "cart.ts" }),
      tool("r2", "Read", { file_path: "cart.ts" }),
      tool("e1", "Edit", { file_path: "src/cart.ts" }),
      tool("e2", "Write", { file_path: "src/total.ts", content: "a\nb\nc" }),
      tool("g1", "Grep", { pattern: "total" }),
      tool("m1", "mcp__jig__jig_browser_open", { url: "http://localhost" }),
      tool("x1", "Bash", { command: "npm run build", description: "Build the app" }, "running"),
    ].map(entry);
    expect(stepsSummary(steps)).toEqual({
      text: "Ran 3 commands, read a file, created total.ts, edited cart.ts, searched the code, used a tool",
      added: 3,
      removed: 0,
      failed: 1,
      running: "Build the app",
    });
    expect(stepsSummary([entry({ kind: "thinking", id: "t", text: "", at } as ChatItem)]).text).toBe(
      "Thought",
    );
  });

  it("reads like Claude Code for a single step: the command's description, a message from a subagent", () => {
    expect(
      stepsSummary([entry(tool("b", "Bash", { command: "ls", description: "List the repos" }))]),
    ).toMatchObject({
      text: "Ran a command",
      detail: "List the repos",
    });
    const edit = { ...tool("e", "Edit", { file_path: "cart.ts" }), diff: "@@\n-a\n+b\n+c" } as ChatItem;
    expect(stepsSummary([entry(edit)])).toMatchObject({ text: "Edited cart.ts", added: 2, removed: 1 });
    expect(stepsSummary([entry(tool("m", "SubagentMessage", {}))]).text).toBe("Received a message");
  });
});
