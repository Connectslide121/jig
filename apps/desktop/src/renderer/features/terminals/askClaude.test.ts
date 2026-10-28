import { describe, expect, it } from "vitest";
import type { TerminalInfo } from "../../../shared/terminals";
import { askClaudeDraft, newlyFailed, outputTail, plainOutput } from "./askClaude";

const t = (patch: Partial<TerminalInfo>): TerminalInfo => ({
  id: "1",
  cwd: "/repo",
  title: "webshop: test",
  shell: "bash",
  status: "running",
  createdAt: "",
  command: "npm test",
  ...patch,
});

describe("ask Claude about terminal output", () => {
  it("strips colours, titles and progress redraws", () => {
    expect(plainOutput("\x1b]0;title\x07\x1b[31mred\x1b[0m\r\n10%\r50%\r100%\n")).toBe("red\n100%\n");
  });

  it("keeps the end of long output", () => {
    const raw = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
    const tail = outputTail(raw, 5);
    expect(tail.split("\n")).toEqual(["line 295", "line 296", "line 297", "line 298", "line 299"]);
    expect(outputTail("x".repeat(50), 120, 10)).toBe("x".repeat(10));
  });

  it("finds commands that just failed", () => {
    const before = [t({}), t({ id: "2" }), t({ id: "3", command: undefined }), t({ id: "4", private: true })];
    const after = [
      t({ status: "exited", exitCode: 1 }),
      t({ id: "2", status: "exited", exitCode: 0 }),
      t({ id: "3", command: undefined, status: "exited", exitCode: 2 }),
      t({ id: "4", private: true, status: "exited", exitCode: 1 }),
    ];
    expect(newlyFailed(before, after).map((x) => x.id)).toEqual(["1"]);
    // Already exited before: not new.
    expect(newlyFailed(after, after)).toEqual([]);
  });

  it("writes the request with the exit code and output", () => {
    const d = askClaudeDraft(t({ status: "exited", exitCode: 1 }), "Error: boom");
    expect(d).toContain("webshop: test (`npm test`) failed with exit code 1 in /repo");
    expect(d).toContain("```\nError: boom\n```");
  });
});
