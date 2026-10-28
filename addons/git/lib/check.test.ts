import { describe, expect, it } from "vitest";
import { checkPrompt, parseFindings } from "./check";

describe("check before committing", () => {
  it("asks about the diff", () => {
    expect(checkPrompt({ staged: true, diff: "+x", truncated: false })).toContain("Staged changes:\n+x");
  });

  it("reads findings, most severe first", () => {
    const answer =
      'Found: {"findings": [{"severity": "low", "file": "b/a.ts", "line": null, "message": "TODO left"}, {"severity": "high", "file": ".env", "line": 2, "message": "API key"}, {"bad": 1}]}';
    expect(parseFindings(answer)).toEqual([
      { severity: "high", file: ".env", line: 2, message: "API key" },
      { severity: "low", file: "a.ts", line: undefined, message: "TODO left" },
    ]);
    expect(parseFindings('{"findings": []}')).toEqual([]);
    expect(parseFindings("Looks fine to me")).toEqual([
      { severity: "low", file: "", message: "Looks fine to me" },
    ]);
  });
});
