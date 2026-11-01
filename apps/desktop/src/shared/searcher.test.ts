import { describe, expect, it } from "vitest";
import { SEARCH_AGENT, SEARCH_GUIDANCE, SEARCH_TOOLS, searchAgent } from "./searcher";

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
