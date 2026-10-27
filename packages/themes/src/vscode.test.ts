import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "./color";
import { missingTokens } from "./model";
import { shikiTheme } from "./shiki";
import {
  contributedThemes,
  mapVsCodeTheme,
  parseJsonc,
  resolveIncludes,
  slugify,
  type VsCodeTheme,
} from "./vscode";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const c = (s: string) => parseColor(s)!;

async function loadFixture(name: string): Promise<VsCodeTheme> {
  return parseJsonc(await readFile(join(fixtures, name), "utf8")) as VsCodeTheme;
}

const loader = async (relative: string, from: string) => {
  const path = join(dirname(from), relative);
  return { theme: parseJsonc(await readFile(path, "utf8")) as VsCodeTheme, path };
};

const source = { kind: "user", file: "x.json" } as const;

describe("parseJsonc", () => {
  it("handles comments and trailing commas without touching strings", async () => {
    const parsed = parseJsonc(await readFile(join(fixtures, "tricky.jsonc"), "utf8"));
    expect(parsed).toEqual({
      name: "Tricky // not a comment",
      url: "http://example.com/*not-a-comment*/",
      list: ["a, ]", "b"],
      escaped: 'quote " and , }',
      nested: { x: [1, 2, 3] },
    });
  });

  it("strips a byte-order mark and keeps plain JSON working", () => {
    expect(parseJsonc('﻿{"a": 1}')).toEqual({ a: 1 });
    expect(parseJsonc('[1, {"b": [], "c": {}}]')).toEqual([1, { b: [], c: {} }]);
  });

  it("still rejects invalid JSON", () => {
    expect(() => parseJsonc("{ a: 1 }")).toThrow();
  });
});

describe("resolveIncludes", () => {
  it("merges include chains: child colours win, token colours concatenate base-first", async () => {
    const path = join(fixtures, "child.json");
    const theme = await resolveIncludes(await loadFixture("child.json"), loader, path);
    expect(theme.name).toBe("Child");
    expect(theme.type).toBe("dark");
    expect(theme.colors).toEqual({
      "editor.background": "#101820",
      "sideBar.background": "#0a0a0a",
      "button.background": "#0e639c",
    });
    expect(
      (theme.tokenColors as { settings: { foreground: string } }[]).map((r) => r.settings.foreground),
    ).toEqual(["#6a9955", "#ff0000", "#00ff00"]);
    expect(theme.include).toBe("./base.json");
  });

  it("stops on include loops and survives missing files", async () => {
    const loop = await resolveIncludes(await loadFixture("loop.json"), loader, join(fixtures, "loop.json"));
    expect(loop.colors?.["editor.background"]).toBe("#123123");
    const missing = await resolveIncludes(
      { name: "M", include: "./nope.json", colors: { foreground: "#fff" } },
      loader,
      join(fixtures, "x.json"),
    );
    expect(missing.colors).toEqual({ foreground: "#fff" });
  });
});

describe("mapVsCodeTheme", () => {
  it("maps a full dark theme onto every Jig token", async () => {
    const theme = mapVsCodeTheme(await loadFixture("dark-full.json"), { id: "vscode:fixture/dark", source });
    expect(missingTokens(theme.colors)).toEqual([]);
    expect(theme).toMatchObject({ id: "vscode:fixture/dark", label: "Fixture Dark", appearance: "dark" });
    expect(theme.colors.canvas).toBe("#282a36");
    expect(theme.colors.surface).toBe("#21222c");
    expect(theme.colors.raised).toBe("#343746");
    expect(theme.colors.titlebar).toBe("#191a21");
    expect(theme.colors.accent).toBe("#bd93f9");
    expect(theme.colors.onAccent).toBe("#282a36");
    expect(theme.colors.danger).toBe("#ff5555");
    expect(theme.colors.warning).toBe("#ffb86c");
    // Translucent borders and hovers are painted over their base: tokens are opaque.
    expect(theme.colors.line).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.colors.hover).toMatch(/^#[0-9a-f]{6}$/);
    // Every colour parses.
    for (const value of Object.values(theme.colors)) expect(parseColor(value)).toBeDefined();
  });

  it("maps terminal colours 1:1 with VS Code defaults for the rest", async () => {
    const theme = mapVsCodeTheme(await loadFixture("dark-full.json"), { id: "x", source });
    expect(theme.terminal.red).toBe("#ff5555");
    expect(theme.terminal.green).toBe("#50fa7b");
    expect(theme.terminal.blue).toBe("#2472c8");
    expect(theme.terminal.background).toBe("#282a36");
    expect(theme.terminal.cursor).toBe("#f8f8f2");
  });

  it("keeps tokenColors as-is and adds a global rule from editor.foreground", async () => {
    const theme = mapVsCodeTheme(await loadFixture("dark-full.json"), { id: "x", source });
    expect(theme.syntax.tokenColors[0]).toEqual({ settings: { foreground: "#f8f8f2" } });
    expect(theme.syntax.tokenColors.slice(1)).toHaveLength(2);
  });

  it("derives a complete light theme from only two keys", async () => {
    const theme = mapVsCodeTheme(await loadFixture("light-sparse.json"), { id: "x", source });
    expect(theme.appearance).toBe("light");
    expect(missingTokens(theme.colors)).toEqual([]);
    expect(theme.colors.canvas).toBe("#ffffff");
    expect(contrastRatio(c(theme.colors.fg), c(theme.colors.surface))).toBeGreaterThanOrEqual(4.5);
    // No token colours → Jig Light's syntax colours.
    expect(theme.syntax.tokenColors.length).toBeGreaterThan(5);
  });

  it("detects appearance from uiTheme, type, or the background", () => {
    const dark = { colors: { "editor.background": "#ffffff" } };
    expect(mapVsCodeTheme(dark, { id: "a", source, uiTheme: "vs-dark" }).appearance).toBe("dark");
    expect(mapVsCodeTheme({ type: "light" }, { id: "b", source }).appearance).toBe("light");
    expect(
      mapVsCodeTheme({ colors: { "editor.background": "#101010" } }, { id: "c", source }).appearance,
    ).toBe("dark");
    expect(mapVsCodeTheme({}, { id: "d", source }).appearance).toBe("dark");
    const hc = mapVsCodeTheme({}, { id: "e", source, uiTheme: "hc-black" });
    expect(hc.highContrast).toBe(true);
  });

  it("repairs unreadable text in a low-contrast theme", async () => {
    const theme = mapVsCodeTheme(await loadFixture("low-contrast.json"), { id: "x", source });
    const k = theme.colors;
    for (const bg of [k.canvas, k.surface, k.hover, k.active]) {
      expect(contrastRatio(c(k.fg), c(bg))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(c(k.muted), c(k.surface))).toBeGreaterThanOrEqual(4);
    expect(contrastRatio(c(k.onAccent), c(k.accent))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c(k.onStatusbar), c(k.statusbar))).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the label option over the theme name", () => {
    expect(mapVsCodeTheme({ name: "A" }, { id: "x", label: "B", source }).label).toBe("B");
    expect(mapVsCodeTheme({}, { id: "x", source }).label).toBe("x");
  });
});

describe("shikiTheme", () => {
  it("builds a Shiki theme with the code background and a global rule first", async () => {
    const theme = mapVsCodeTheme(await loadFixture("dark-full.json"), { id: "dark", source });
    const shiki = shikiTheme(theme);
    expect(shiki).toMatchObject({ name: "jig-dark", type: "dark", fg: "#f8f8f2", bg: theme.colors.code });
    expect(shiki.settings[0]).toEqual({ settings: { foreground: "#f8f8f2", background: theme.colors.code } });
    expect(shiki.settings.slice(1).every((rule) => rule.scope)).toBe(true);
  });
});

describe("extension helpers", () => {
  it("reads contributes.themes", () => {
    const manifest = {
      contributes: {
        themes: [{ label: "A", uiTheme: "vs-dark", path: "./themes/a.json" }, { label: "broken" }, "nope"],
      },
    };
    expect(contributedThemes(manifest)).toEqual([
      { label: "A", uiTheme: "vs-dark", path: "./themes/a.json" },
    ]);
    expect(contributedThemes({})).toEqual([]);
    expect(contributedThemes(null)).toEqual([]);
  });

  it("slugifies labels", () => {
    expect(slugify("Dracula Soft")).toBe("dracula-soft");
    expect(slugify("  Café — Noir_2  ")).toBe("cafe-noir-2");
  });
});
