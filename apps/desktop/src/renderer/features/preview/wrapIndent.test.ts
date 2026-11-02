import { describe, expect, it } from "vitest";
import { indentColumns } from "./wrapIndent";

describe("indentColumns", () => {
  it("counts spaces and tabs to the next tab stop", () => {
    expect(indentColumns("    const x = 1;", 4)).toBe(4);
    expect(indentColumns("\t\tfoo", 4)).toBe(8);
    expect(indentColumns("  \tfoo", 4)).toBe(4);
    expect(indentColumns("foo", 4)).toBe(0);
    expect(indentColumns("", 4)).toBe(0);
  });

  it("caps very deep indentation", () => {
    expect(indentColumns(" ".repeat(200), 4)).toBe(60);
  });
});
