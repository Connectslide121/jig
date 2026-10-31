import { describe, expect, it } from "vitest";
import { chatStats } from "../../../shared/chatStats";
import type { ChatItem } from "../../../shared/engine";

const at = "2026-10-28T10:00:00Z";
const tool = (
  id: string,
  name: string,
  file: string,
  diff?: string,
  status: "done" | "error" = "done",
): Extract<ChatItem, { kind: "tool" }> => ({
  kind: "tool",
  id,
  name,
  input: { file_path: file },
  status,
  diff,
  at,
});

describe("whole-chat file changes", () => {
  it("sums successful edits across all turns and subagents, retaining earlier files", () => {
    const items: ChatItem[] = [
      { kind: "user", id: "u1", text: "go", at, messageId: "m1" },
      tool("t1", "Edit", "/a.ts", "@@\n-x\n+y\n+z"),
      tool("t2", "Edit", "/a.ts", "@@\n-q\n+r"),
      tool("t3", "Write", "/b.ts"),
      tool("t4", "Read", "/c.ts"),
      tool("t5", "Edit", "/d.ts", "+1", "error"),
      { kind: "result", id: "r1", at, ok: true, durationMs: 1 },
      { kind: "user", id: "u2", text: "explain", at },
      { kind: "result", id: "r2", at, ok: true, durationMs: 1 },
    ];
    items.push(
      { kind: "user", id: "u3", text: "more", at, messageId: "m3" },
      tool("t6", "Edit", "/a.ts", "@@\n-z\n+new"),
      { ...tool("t7", "Edit", "/c.ts", "+subagent"), parentId: "agent" },
      { ...tool("t8", "Write", "/pending.ts"), status: "running" },
    );
    const stats = chatStats(items);
    expect(stats.files).toEqual([
      { path: "/a.ts", edits: 3, added: 4, removed: 3 },
      { path: "/b.ts", edits: 1, added: 0, removed: 0 },
      { path: "/c.ts", edits: 1, added: 1, removed: 0 },
    ]);
    expect(stats.linesAdded).toBe(5);
    expect(stats.linesRemoved).toBe(3);
    expect(chatStats([]).files).toEqual([]);
    // A transcript rewind automatically removes edits from the summary too.
    expect(chatStats(items.slice(0, 2)).files).toEqual([{ path: "/a.ts", edits: 1, added: 2, removed: 1 }]);
  });
});
