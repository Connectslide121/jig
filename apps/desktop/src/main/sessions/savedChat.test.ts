import { describe, expect, it } from "vitest";
import type { SavedClaudeMessage, SessionMeta } from "../../shared/engine";
import { FakeEngine } from "../engine/fake";
import { savedChatItems, typedText } from "./savedChat";

const meta = { id: "c" } as SessionMeta;

describe("opening a saved Claude Code conversation", () => {
  it("keeps what you typed, Claude's replies and tool calls, without subagents or Claude Code's additions", async () => {
    const messages = await new FakeEngine(0).savedMessages("saved-1");
    const items = savedChatItems(messages, meta, "2026-10-29T10:00:00.000Z");
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(items[0]).toMatchObject({ kind: "user", text: "The cart total is off by one, fix it" });
    expect(items[2]).toMatchObject({ kind: "tool", name: "Edit", status: "done", output: "Edited cart.ts" });
    expect(items.every((i) => i.at === "2026-10-29T10:00:00.000Z")).toBe(true);
    expect(JSON.stringify(items)).not.toContain("subagent");
  });

  it("reads typed text from strings and text blocks, and drops what Claude Code wrote", () => {
    expect(typedText({ content: " Fix it " })).toBe("Fix it");
    expect(
      typedText({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] }),
    ).toBe("a\n\nb");
    expect(typedText({ content: "<command-name>/clear</command-name>" })).toBe("");
    expect(typedText({ content: "[Request interrupted by user]" })).toBe("");
    expect(typedText({ content: [{ type: "tool_result", content: "x" }] })).toBe("");
  });

  it("marks a tool without a result as done", () => {
    const cut: SavedClaudeMessage[] = [
      {
        type: "assistant",
        uuid: "a",
        parent_tool_use_id: null,
        message: { id: "m", content: [{ type: "tool_use", id: "t", name: "Bash", input: {} }] },
      },
    ];
    expect(savedChatItems(cut, meta, "x")).toMatchObject([{ kind: "tool", status: "done" }]);
  });
});
