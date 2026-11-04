import { describe, expect, it } from "vitest";
import {
  CODEX_SEARCH_GUIDANCE,
  codexSearchPrompt,
  SEARCH_AGENT,
  SEARCH_GUIDANCE,
  SEARCH_TOOL,
  SEARCH_TOOLS,
  searchAgent,
} from "./searcher";

describe("searcher", () => {
  it("only reads, on the model it is given, and the chat is told its name", () => {
    const agent = searchAgent("haiku");
    expect(SEARCH_AGENT).toBe("jig-search");
    expect(agent.tools).toEqual(SEARCH_TOOLS);
    expect(agent.tools).not.toContain("Edit");
    expect(agent.model).toBe("haiku");
    expect(searchAgent("sonnet").model).toBe("sonnet");
    expect(SEARCH_GUIDANCE).toContain(`subagent_type "${SEARCH_AGENT}"`);
  });
});

describe("ChatGPT chats' search helper (D-337)", () => {
  it("asks the question with jig-search's rules and the thoroughness", () => {
    const prompt = codexSearchPrompt("  Where is the cart total computed?  ", "quick");
    expect(prompt).toContain("<question>\nWhere is the cart total computed?\n</question>");
    expect(prompt).toContain("Never change, create or delete files");
    expect(prompt).toContain("absolute path and line numbers");
    expect(prompt).toContain("Thoroughness: quick");
    expect(codexSearchPrompt("x")).toContain("Thoroughness: medium");
  });

  it("tells the chat to use the tool", () => {
    expect(CODEX_SEARCH_GUIDANCE).toContain(SEARCH_TOOL);
    expect(CODEX_SEARCH_GUIDANCE).not.toContain("subagent");
  });
});
