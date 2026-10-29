import { describe, expect, it } from "vitest";
import { BROWSER_TOOLS, TESTER_AGENT, testChatMessage, testerAgent } from "./tester";

describe("the tester", () => {
  it("is a subagent on the tester model with the browser and read-only file tools", () => {
    const agent = testerAgent("haiku");
    expect(TESTER_AGENT).toBe("jig-tester");
    expect(agent.model).toBe("haiku");
    expect(testerAgent("").model).toBe("haiku");
    expect(testerAgent("sonnet").model).toBe("sonnet");
    expect(agent.tools).toEqual([...BROWSER_TOOLS.map((t) => `mcp__jig__${t}`), "Read", "Grep", "Glob"]);
    expect(agent.tools.some((t) => /Edit|Write|Bash/.test(t))).toBe(false);
    expect(agent.prompt).toContain("PASS or FAIL");
  });

  it("writes a test chat's first message with what to test, the URL and how to report", () => {
    const text = testChatMessage("  Log in and add an item to the cart  ", " http://localhost:5173 ");
    expect(text.startsWith("Test this in Claude's browser at http://localhost:5173:\n\nLog in and add")).toBe(
      true,
    );
    expect(text).toContain("never start servers yourself");
    expect(testChatMessage("Check the menu")).toMatch(/^Test this in Claude's browser:\n/);
  });
});
