import { describe, expect, it } from "vitest";
import { chatToMarkdown } from "./chatExport";
import type { ChatItem, SessionMeta } from "./engine";

const meta = { title: "Discounts", cwd: "/repo", createdAt: "2026-10-28T10:00:00Z" } as SessionMeta;
const at = "2026-10-28T10:00:00Z";

describe("chatToMarkdown", () => {
  it("writes messages, tool lines with diffs, todos and shell commands", () => {
    const items: ChatItem[] = [
      { kind: "user", id: "u", text: "Add a discount", at },
      { kind: "thinking", id: "t", text: "secret thoughts", at },
      {
        kind: "tool",
        id: "e",
        name: "Edit",
        input: { file_path: "/repo/cart.ts" },
        status: "done",
        diff: "-a\n+b",
        at,
      },
      {
        kind: "tool",
        id: "d",
        name: "TodoWrite",
        input: {
          todos: [
            { content: "Read", status: "completed" },
            { content: "Test", status: "pending" },
          ],
        },
        status: "done",
        at,
      },
      { kind: "tool", id: "g", name: "Grep", input: { pattern: "x" }, status: "done", at, parentId: "e" },
      { kind: "shell", id: "s", command: "git status", output: "clean", status: "done", at },
      { kind: "assistant", id: "a", text: "Done.", at },
    ];
    const md = chatToMarkdown(meta, items);
    expect(md).toContain("# Discounts");
    expect(md).toContain("## You\n\nAdd a discount");
    expect(md).toContain("> **Edit** `/repo/cart.ts`\n\n```diff\n-a\n+b\n```");
    expect(md).toContain("- [x] Read\n- [ ] Test");
    expect(md).toContain("> **!** `git status`");
    expect(md).toContain("## Claude\n\nDone.");
    expect(md).not.toContain("secret thoughts");
    expect(md).not.toContain("Grep");
  });
});
