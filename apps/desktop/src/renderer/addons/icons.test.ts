import { describe, expect, it } from "vitest";
import { iconByName, unknownIcons } from "./icons";

describe("add-on icons", () => {
  it("finds Lucide icons by kebab-case name", () => {
    expect(iconByName("git-branch")).toBeDefined();
    expect(iconByName("rocket")).toBeDefined();
    expect(iconByName("history")).toBeDefined();
    expect(iconByName("no-such-icon")).toBeUndefined();
    expect(iconByName(undefined)).toBeUndefined();
  });

  it("lists the manifest's icons Lucide doesn't have", () => {
    const manifest = {
      icon: "rocket",
      contributes: {
        views: [{ icon: "spaceship" }],
        tabs: [],
        actions: [{ icon: "play" }, { icon: "spaceship" }],
        menus: [{ icon: "unicorn-face" }],
      },
    } as never;
    expect(unknownIcons(manifest)).toEqual(["spaceship", "unicorn-face"]);
    expect(unknownIcons(undefined)).toEqual([]);
  });
});
