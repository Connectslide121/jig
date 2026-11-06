import { describe, expect, it } from "vitest";
import {
  BROWSER_TOOLS,
  CODEX_TESTER_GUIDANCE,
  codexTesterPrompt,
  TEST_PROTOCOL,
  TEST_TOOL,
  TESTER_AGENT,
  testChatMessage,
  testerAgent,
} from "./tester";

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
    expect(text.startsWith("Test this in Jig's browser at http://localhost:5173:\n\nLog in and add")).toBe(
      true,
    );
    expect(text).toContain("never start servers yourself");
    expect(testChatMessage("Check the menu")).toMatch(/^Test this in Jig's browser:\n/);
  });
});

describe("ChatGPT chats' tester helper (D-337)", () => {
  it("gives the page, the steps and jig-tester's protocol", () => {
    const prompt = codexTesterPrompt(" http://localhost:5173 ", "Add a product to the cart\n");
    expect(prompt).toContain("<page>http://localhost:5173</page>");
    expect(prompt).toContain("<steps>\nAdd a product to the cart\n</steps>");
    expect(prompt).toContain(TEST_PROTOCOL);
  });

  it("tells the chat to use the tool, with the dev server already running", () => {
    expect(CODEX_TESTER_GUIDANCE).toContain(TEST_TOOL);
    expect(CODEX_TESTER_GUIDANCE).toContain("dev server first");
  });
});
