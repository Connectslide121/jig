import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrast,
  finishStyle,
  fontStack,
  mix,
  normalizeHex,
  styleFromDesignMd,
  styleFromTheme,
  styleFromTokens,
} from "./styleSources";

const THEMES = join(
  __dirname,
  "..",
  "..",
  "..",
  "skills",
  "theme-factory",
  "skills",
  "theme-factory",
  "themes",
);

describe("colours", () => {
  it("normalizes hex and measures contrast", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("red")).toBeUndefined();
    expect(Math.round(contrast("#000000", "#ffffff"))).toBe(21);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("finishStyle", () => {
  it("picks roles by name and keeps text readable", () => {
    const s = finishStyle("x", "X", [
      { label: "Primary brand", hex: "#ff5500" },
      { label: "Page background", hex: "#ffffff" },
      { label: "Body text", hex: "#eeeeee" }, // too light to read on white
    ]);
    expect(s.colors.bg).toBe("#ffffff");
    expect(s.colors.accent).toBe("#ff5500");
    expect(contrast(s.colors.fg, s.colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.colors.muted, s.colors.bg)).toBeGreaterThanOrEqual(2);
  });

  it("makes a style from nothing", () => {
    const s = finishStyle("x", "", []);
    expect(s.name).toBe("x");
    expect(contrast(s.colors.fg, s.colors.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("fontStack", () => {
  it("falls back to Inter and drops weights and odd characters", () => {
    expect(fontStack("DejaVu Sans Bold")).toBe('"DejaVu Sans", "Inter Variable", sans-serif');
    expect(fontStack("Inter")).toBe('"Inter Variable", sans-serif');
    expect(fontStack("x;}</style>")).toBe('"Inter Variable", sans-serif');
    expect(fontStack(undefined)).toBe('"Inter Variable", sans-serif');
  });
});

describe("styleFromTheme", () => {
  it("reads every bundled theme-factory theme into a readable style", async () => {
    for (const name of ["ocean-depths", "modern-minimalist", "golden-hour", "arctic-frost"]) {
      const s = styleFromTheme(await readFile(join(THEMES, `${name}.md`), "utf8"), `theme-${name}`);
      expect(s.name).not.toBe(`theme-${name}`);
      expect(contrast(s.colors.fg, s.colors.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("takes the background, accent and fonts the theme names", async () => {
    const s = styleFromTheme(await readFile(join(THEMES, "ocean-depths.md"), "utf8"), "theme-ocean-depths");
    expect(s).toMatchObject({
      name: "Ocean Depths",
      colors: { bg: "#1a2332", accent: "#2d8b8b", fg: "#f1faee" },
    });
    expect(s.fonts.headline).toContain("DejaVu Sans");
  });
});

describe("styleFromDesignMd", () => {
  it("reads colours by their words, a font and a radius", () => {
    const md = [
      "# Fabrikam Design System",
      "## Colors",
      "- **Canvas** (`#0b0b0f`): page background",
      "- **Primary** `#7c5cff` for buttons and links",
      "- Text: #f5f5f7",
      "## Typography",
      "- Font family: `Space Grotesk`, sans-serif",
      "- Border radius: 12px",
    ].join("\n");
    const s = styleFromDesignMd(md, "design-fabrikam", "fabrikam");
    expect(s).toMatchObject({
      name: "Fabrikam",
      colors: { bg: "#0b0b0f", accent: "#7c5cff", fg: "#f5f5f7" },
    });
    expect(s.fonts.headline).toContain("Space Grotesk");
    expect(s.radius).toBe(18);
  });
});

describe("styleFromTokens", () => {
  it("reads DTCG 2025.10 tokens: srgb components, inherited types, font families, radii", () => {
    const s = styleFromTokens(
      {
        color: {
          $type: "color",
          background: { $value: { colorSpace: "srgb", components: [1, 1, 1] } },
          text: { $value: "#111827" },
          brand: { primary: { $value: { colorSpace: "srgb", components: [0, 0.4, 0.8], hex: "#0066cc" } } },
        },
        font: { heading: { $type: "fontFamily", $value: ["Fraunces", "serif"] } },
        radius: { md: { $type: "dimension", $value: { value: 8, unit: "px" } } },
      },
      "kit",
      "Shop kit",
    );
    expect(s).toMatchObject({ colors: { bg: "#ffffff", fg: "#111827", accent: "#0066cc" }, radius: 12 });
    expect(s.fonts.headline).toContain("Fraunces");
  });
});
