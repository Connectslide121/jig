import { describe, expect, it } from "vitest";
import { compareVersions } from "./setup";

describe("compareVersions", () => {
  it("compares numerically, ignoring v and pre-release suffixes", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("v1.2.0", "1.2")).toBe(0);
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });
});
