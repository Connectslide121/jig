import { describe, expect, it } from "vitest";
import { isEnd, isGoAhead, isNo, isYes, permissionPrompt, toolActivity } from "./replies";

describe("spoken answers", () => {
  it("hears a plain yes", () => {
    for (const t of ["Yes.", "Yeah, go ahead!", "OK, do it", "Sounds good.", "Sí, dale"])
      expect(isYes(t)).toBe(true);
  });

  it("treats a yes with changes as feedback", () => {
    expect(isYes("Yes, but call it Shop instead")).toBe(false);
    expect(isYes("No, wait")).toBe(false);
    expect(isYes("Make the button blue")).toBe(false);
  });

  it("hears a plain no", () => {
    expect(isNo("No.")).toBe(true);
    expect(isNo("Not yet")).toBe(true);
    expect(isNo("No, use the other table for orders")).toBe(false);
  });

  it("hears the end of the conversation", () => {
    expect(isEnd("Bye!")).toBe(true);
    expect(isEnd("Stop listening.")).toBe(true);
    expect(isEnd("Bye the way, fix the header")).toBe(false);
    expect(isEnd("OK, bye Claude")).toBe(true);
    expect(isEnd("See you later")).toBe(true);
  });

  it("hears the go-ahead, not a plain yes", () => {
    for (const t of ["Yes, go ahead.", "Go for it!", "OK, let's do it", "Sounds good, start working"])
      expect(isGoAhead(t)).toBe(true);
    for (const t of ["Yes.", "Go ahead but rename it first", "No, don't go ahead", "Sure"])
      expect(isGoAhead(t)).toBe(false);
  });
});

describe("permissionPrompt", () => {
  const request = { requestId: "r", input: {}, canAlwaysAllow: false };
  it("asks to start a plan", () => {
    expect(permissionPrompt({ ...request, toolName: "ExitPlanMode" })).toContain("Shall I start?");
  });

  it("reads a question with its options", () => {
    const input = {
      questions: [{ question: "Which database?", options: [{ label: "Postgres" }, { label: "SQLite" }] }],
    };
    expect(permissionPrompt({ ...request, toolName: "AskUserQuestion", input })).toBe(
      "Which database? Postgres, or SQLite?",
    );
  });

  it("uses Claude Code's sentence for other tools", () => {
    expect(permissionPrompt({ ...request, toolName: "Bash", title: "Claude wants to run npm test" })).toBe(
      "Claude wants to run npm test. Allow it?",
    );
  });
});

describe("toolActivity", () => {
  it("says what Claude is doing in a few words", () => {
    expect(toolActivity("Grep", { pattern: "total" })).toBe("Searching the code");
    expect(toolActivity("Read", { file_path: "/repo/src/cart.ts" })).toBe("Reading cart.ts");
    expect(toolActivity("Read", { file_path: "C:\\repo\\cart.ts" })).toBe("Reading cart.ts");
    expect(toolActivity("Task", {})).toBe("Exploring the code");
    expect(toolActivity("mcp__github__list_issues", {})).toBe("Using list_issues");
  });
});
