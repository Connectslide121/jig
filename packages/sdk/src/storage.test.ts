import { describe, expect, it } from "vitest";
import { parseScopedKey, scopedKey, scopeLabel } from "./storage";

describe("scoped storage keys", () => {
  it("puts the scope in the key, and reads it back", () => {
    expect(scopedKey("global", undefined, "settings")).toBe("settings");
    expect(scopedKey("project", "p1", "notes")).toBe("@project(p1) notes");
    expect(scopedKey("repo", "C:\\repos\\shop\\", "todo")).toBe("@repo(C:/repos/shop) todo");
    expect(() => scopedKey("project", undefined, "x")).toThrow(/No project/);
    expect(parseScopedKey("@repo(C:/repos/shop) todo list")).toEqual({
      scope: "repo",
      id: "C:/repos/shop",
      key: "todo list",
    });
    expect(parseScopedKey("settings")).toEqual({ scope: "global", key: "settings" });
    expect(scopeLabel("repo")).toBe("per repository");
  });
});
