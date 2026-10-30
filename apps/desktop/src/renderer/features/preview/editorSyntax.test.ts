import { jigDark, jigLight } from "@jig/themes";
import { describe, expect, it } from "vitest";
import { colorful, distinctHues, tagColorIndex, tagPalette } from "./editorSyntax";

describe("tag colours", () => {
  it("gives a tag name the same colour everywhere, case aside", () => {
    expect(tagColorIndex("div", 7)).toBe(tagColorIndex("DIV", 7));
    expect(tagColorIndex("button", 7)).toBeLessThan(7);
    // Elements usually found together differ, even with five colours.
    const together = ["div", "nav", "aside", "button", "a"];
    expect(new Set(together.map((n) => tagColorIndex(n, 5))).size).toBe(5);
    expect(tagColorIndex("lucide-icon", 5)).toBe(tagColorIndex("lucide-icon", 5));
  });

  it("takes the theme's colourful syntax colours, never greys", () => {
    expect(colorful("#c792ea")).toBe(true);
    expect(colorful("#dfe1e5")).toBe(false);
    expect(colorful("#808080")).toBe(false);
    for (const theme of [jigDark, jigLight]) {
      const palette = tagPalette(theme);
      expect(palette.length).toBeGreaterThanOrEqual(4);
      expect(palette.every((c) => c.startsWith("var(") || colorful(c))).toBe(true);
    }
    expect(tagPalette(undefined)[0]).toBe("var(--color-accent)");
    // Three oranges count once; blue, purple and green stay.
    expect(distinctHues(["#e5c07b", "#6cb6ff", "#e0a458", "#cf8e6d", "#c792ea", "#8fbf7f"])).toEqual([
      "#e5c07b",
      "#6cb6ff",
      "#c792ea",
      "#8fbf7f",
    ]);
  });
});
