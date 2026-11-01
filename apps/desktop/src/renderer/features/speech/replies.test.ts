import { describe, expect, it } from "vitest";
import { isEnd, isNo, isYes, permissionPrompt } from "./replies";

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
