import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES, jigDark, jigLight } from "./builtin";
import { contrastRatio, parseColor } from "./color";
import { ANSI_NAMES, COLOR_TOKENS, missingTokens, summarize, themeCssVariables } from "./model";

const c = (s: string) => parseColor(s)!;

describe("theme model", () => {
  it("exposes a CSS variable per token in kebab case", () => {
    const vars = themeCssVariables(jigDark);
    expect(Object.keys(vars)).toHaveLength(COLOR_TOKENS.length);
    expect(vars["--jig-canvas"]).toBe(jigDark.colors.canvas);
    expect(vars["--jig-on-statusbar"]).toBe(jigDark.colors.onStatusbar);
    expect(vars["--jig-line-strong"]).toBe(jigDark.colors.lineStrong);
  });

  it("summarises a theme for pickers", () => {
    expect(summarize(jigLight)).toEqual({
      id: "jig-light",
      label: "Jig Light",
      appearance: "light",
      source: "builtin",
      swatch: [jigLight.colors.canvas, jigLight.colors.surface, jigLight.colors.fg, jigLight.colors.accent],
    });
  });

  it("reports missing tokens", () => {
    expect(missingTokens(jigDark.colors)).toEqual([]);
    expect(missingTokens({ ...jigDark.colors, fg: "" })).toEqual(["fg"]);
    expect(missingTokens({})).toHaveLength(COLOR_TOKENS.length);
  });
});

describe("built-in themes", () => {
  it.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))("%s is complete and valid", (_id, theme) => {
    expect(missingTokens(theme.colors)).toEqual([]);
    for (const value of Object.values(theme.colors)) expect(parseColor(value)).toBeDefined();
    for (const name of ANSI_NAMES) expect(parseColor(theme.terminal[name])).toBeDefined();
    expect(theme.syntax.tokenColors.length).toBeGreaterThan(5);
  });

  it.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))("%s has readable text", (_id, theme) => {
    const k = theme.colors;
    for (const bg of [k.canvas, k.surface, k.raised, k.elevated, k.hover, k.active]) {
      expect(contrastRatio(c(k.fg), c(bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c(k.muted), c(bg))).toBeGreaterThanOrEqual(3.5);
    }
    expect(contrastRatio(c(k.onAccent), c(k.accent))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c(k.onDanger), c(k.danger))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c(k.onStatusbar), c(k.statusbar))).toBeGreaterThanOrEqual(4.5);
  });
});
