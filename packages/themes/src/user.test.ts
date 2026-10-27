import { describe, expect, it } from "vitest";
import { jigDark, jigLight } from "./builtin";
import { isJigThemeFile, jigThemeFromFile, ThemeFileError } from "./user";

const source = { kind: "user", file: "mine.json" } as const;

describe("Jig-format theme files", () => {
  it("tells Jig files from VS Code files", () => {
    expect(isJigThemeFile({ appearance: "dark", colors: { canvas: "#000" } })).toBe(true);
    expect(isJigThemeFile({ appearance: "light" })).toBe(true);
    expect(isJigThemeFile({ type: "dark", colors: { "editor.background": "#000" } })).toBe(false);
    expect(isJigThemeFile({ appearance: "dark", colors: { "editor.background": "#000" } })).toBe(false);
    expect(isJigThemeFile(null)).toBe(false);
  });

  it("fills missing tokens from the matching built-in theme", () => {
    const theme = jigThemeFromFile(
      { label: "Mine", appearance: "light", colors: { accent: "#0055aa", unknown: "#123" } },
      "user:mine",
      source,
    );
    expect(theme).toMatchObject({ id: "user:mine", label: "Mine", appearance: "light", source });
    expect(theme.colors.accent).toBe("#0055aa");
    expect(theme.colors.canvas).toBe(jigLight.colors.canvas);
    expect(theme.terminal).toEqual(jigLight.terminal);
    expect(theme.syntax.tokenColors).toBe(jigLight.syntax.tokenColors);
  });

  it("takes terminal and token colours when given", () => {
    const tokenColors = [{ scope: "comment", settings: { foreground: "#888888" } }];
    const theme = jigThemeFromFile(
      { appearance: "dark", terminal: { red: "#ff0000", bogus: "#fff", blue: "nope" }, tokenColors },
      "user:x",
      source,
    );
    expect(theme.label).toBe("user:x");
    expect(theme.terminal.red).toBe("#ff0000");
    expect(theme.terminal.blue).toBe(jigDark.terminal.blue);
    expect(theme.syntax.tokenColors).toBe(tokenColors);
  });

  it("rejects invalid colours with a readable error", () => {
    expect(() => jigThemeFromFile({ appearance: "dark", colors: { fg: "bright" } }, "x", source)).toThrow(
      ThemeFileError,
    );
  });
});
