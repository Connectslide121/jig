import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "./mine";
import { usageSummary, usageText } from "./usage";

const at = "2025-01-01T10:00:00.000Z";
const tool = (chat: string, name: string, extra: Record<string, string> = {}): ActivityEvent => ({
  at,
  kind: "session.tool",
  text: "",
  detail: { tool: name, chat, ...extra },
});

describe("usageSummary", () => {
  it("sums tools, skills, subagents, add-ons and MCP servers per chat", () => {
    const s = usageSummary(
      [
        { at, kind: "prompt", text: "hi", detail: { chat: "a" } },
        { at, kind: "prompt", text: "again", detail: { chat: "b" } },
        tool("a", "Read"),
        tool("a", "Read"),
        tool("b", "Read"),
        tool("a", "Skill", { use: "skill", name: "pdf" }),
        tool("b", "Skill", { use: "skill", name: "pdf" }),
        tool("a", "Task", { use: "subagent", name: "explore" }),
        tool("b", "mcp__jig__addon_releases_overview", { use: "addon", name: "releases" }),
        tool("b", "mcp__github__list_issues", { use: "mcp", name: "github" }),
        { at, kind: "terminal.command", text: "ls" },
      ],
      28,
    );
    expect(s).toMatchObject({ days: 28, chats: 2, prompts: 2, toolCalls: 8 });
    expect(s.tools[0]).toEqual({ name: "Read", count: 3, chats: 2 });
    expect(s.skills).toEqual([{ name: "pdf", count: 2, chats: 2 }]);
    expect(s.subagents).toEqual([{ name: "explore", count: 1, chats: 1 }]);
    expect(s.addons).toEqual([{ name: "releases", count: 1, chats: 1 }]);
    expect(s.mcp).toEqual([{ name: "github", count: 1, chats: 1 }]);
  });

  it("ignores unknown uses and counts old events without a chat", () => {
    const s = usageSummary(
      [{ at, kind: "session.tool", text: "", detail: { tool: "Bash", use: "x", name: "y" } }],
      7,
    );
    expect(s).toMatchObject({ chats: 0, toolCalls: 1, skills: [], addons: [] });
    expect(s.tools).toEqual([{ name: "Bash", count: 1, chats: 0 }]);
  });
});

describe("usageText", () => {
  it("is undefined when nothing was recorded", () => {
    expect(usageText(usageSummary([], 28))).toBeUndefined();
  });

  it("lists the most used of each", () => {
    const text = usageText(usageSummary([tool("a", "Skill", { use: "skill", name: "pdf" })], 28));
    expect(text).toContain("1 chat(s), 0 message(s), 1 tool call(s) in 28 days");
    expect(text).toContain("Skills: pdf 1× in 1 chat(s)");
    expect(text).toContain("Add-ons: none");
  });
});
