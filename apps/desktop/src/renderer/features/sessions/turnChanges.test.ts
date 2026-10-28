import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../../shared/engine";
import { turnChanges } from "./Transcript";

const at = "2026-10-28T10:00:00Z";
const tool = (
  id: string,
  name: string,
  file: string,
  diff?: string,
  status: "done" | "error" = "done",
): ChatItem => ({
  kind: "tool",
  id,
  name,
  input: { file_path: file },
  status,
  diff,
  at,
});

describe("turnChanges", () => {
  it("sums each turn's edited files on its result", () => {
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
    const changes = turnChanges(items);
    expect(changes.get("r1")).toEqual({
      userItemId: "u1",
      canUndo: true,
      files: [
        { path: "/a.ts", added: 3, removed: 2 },
        { path: "/b.ts", added: 0, removed: 0 },
      ],
    });
    expect(changes.has("r2")).toBe(false);
  });
});
