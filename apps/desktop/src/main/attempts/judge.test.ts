import { describe, expect, it } from "vitest";
import type { AttemptRun } from "../../shared/attempts";
import { judgePrompt, parseVerdict } from "./judge";

const run: AttemptRun = {
  id: "r",
  projectId: "p",
  repo: "/repo",
  base: "abc",
  task: "Add a discount",
  createdAt: "",
  status: "running",
  attempts: [
    { index: 1, hint: "Simplest", sessionId: "s1", worktree: "/w/1", branch: "b1" },
    { index: 2, hint: "Thorough", sessionId: "s2", worktree: "/w/2", branch: "b2" },
  ],
};

describe("judging attempts", () => {
  it("shows Claude every attempt's angle, files and diff", () => {
    const p = judgePrompt(
      run,
      [
        {
          index: 1,
          files: [{ path: "cart.ts", status: "modified", insertions: 2, deletions: 1 }],
          insertions: 2,
          deletions: 1,
        },
        { index: 2, files: [], insertions: 0, deletions: 0 },
      ],
      ["+discount", ""],
    );
    expect(p).toContain("Task:\nAdd a discount");
    expect(p).toContain("## Attempt 1\nAngle: Simplest\nFiles:\nmodified cart.ts (+2 -1)");
    expect(p).toContain("## Attempt 2\nAngle: Thorough\nFiles:\n(no changes)");
  });

  it("reads the verdict, ignoring numbers out of range and prose around the JSON", () => {
    const v = parseVerdict(
      'Here: {"winner": 2, "summary": "Two handles rounding.", "notes": [{"attempt": 2, "strengths": "tests"}, {"attempt": 9, "strengths": "x"}]}',
      2,
      "t",
    );
    expect(v).toEqual({
      winner: 2,
      summary: "Two handles rounding.",
      notes: [{ attempt: 2, strengths: "tests", weaknesses: "" }],
      at: "t",
    });
    expect(parseVerdict('{"winner": 7, "summary": "s"}', 2, "t").winner).toBeUndefined();
    expect(parseVerdict("Attempt 1 is better.", 2, "t")).toEqual({
      summary: "Attempt 1 is better.",
      notes: [],
      at: "t",
    });
  });
});
