import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./lineDiff";

describe("unifiedDiff", () => {
  it("shows changed lines with a little context", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
    const after = ["a", "b", "c", "d", "E", "f", "g", "h", "i", "j"].join("\n");
    expect(unifiedDiff(before, after, 1)).toBe(
      ["@@ …", " d", "-e", "+E", " f", "@@ …", " i", "+j"].join("\n"),
    );
  });
  it("is empty-of-changes for equal texts and handles additions at the start", () => {
    expect(unifiedDiff("x\ny", "x\ny", 0)).toBe("");
    expect(unifiedDiff("y", "x\ny", 1)).toBe("+x\n y");
  });
});
