import { describe, expect, it } from "vitest";
import { isInside } from "./sources";

describe("isInside", () => {
  it("accepts the folder itself and anything below it, nothing next to it", () => {
    expect(isInside("/repo", "/repo", "linux")).toBe(true);
    expect(isInside("/repo/api", "/repo", "linux")).toBe(true);
    expect(isInside("/repo-other", "/repo", "linux")).toBe(false);
    expect(isInside("/repo/../etc", "/repo", "linux")).toBe(false);
  });

  it("ignores case on Windows only", () => {
    expect(isInside("/Repo/api", "/repo", "linux")).toBe(false);
    expect(isInside("/Repo/api", "/repo", "win32")).toBe(true);
  });
});
