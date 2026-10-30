import { jigDark, jigLight } from "@jig/themes";
import { describe, expect, it } from "vitest";
import { colorful, TAG_HUES, tagColorIndex, tagPalette, toHsl } from "./editorSyntax";

describe("tag colours", () => {
  it("gives a tag name the same colour everywhere, and spreads names over many colours", () => {
    expect(tagColorIndex("div", TAG_HUES)).toBe(tagColorIndex("DIV", TAG_HUES));
    const names = ["div", "nav", "aside", "button", "a", "span", "p", "img", "section", "header", "ul", "li"];
    expect(new Set(names.map((n) => tagColorIndex(n, TAG_HUES))).size).toBeGreaterThanOrEqual(7);
  });

  it("builds a wheel of hues at the theme's own saturation and lightness", () => {
    expect(colorful("#c792ea")).toBe(true);
    expect(colorful("#dfe1e5")).toBe(false);
    expect(toHsl("#ff0000")).toEqual({ h: 0, s: 1, l: 0.5 });
    for (const theme of [jigDark, jigLight]) {
      const palette = tagPalette(theme);
      expect(palette).toHaveLength(TAG_HUES);
      expect(new Set(palette).size).toBe(TAG_HUES);
      expect(palette[0]).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    }
    // Dark themes get light colours, light themes darker ones.
    const lightness = (c: string) => Number(/(\d+)%\)$/.exec(c)?.[1]);
    expect(lightness(tagPalette(jigDark)[0]!)).toBeGreaterThan(lightness(tagPalette(jigLight)[0]!));
    expect(tagPalette(undefined)[0]).toBe("var(--color-accent)");
  });
});
