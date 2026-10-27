import { describe, expect, it } from "vitest";
import { formatShortcut, matchesShortcut } from "./shortcuts";

const ev = (
  key: string,
  mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("shortcuts", () => {
  it("maps Mod to Ctrl on Windows/Linux and Cmd on macOS", () => {
    expect(matchesShortcut("Mod+,", ev(",", { ctrlKey: true }), false)).toBe(true);
    expect(matchesShortcut("Mod+,", ev(",", { metaKey: true }), false)).toBe(false);
    expect(matchesShortcut("Mod+,", ev(",", { metaKey: true }), true)).toBe(true);
  });

  it("requires exactly the listed modifiers and ignores letter case", () => {
    expect(matchesShortcut("Mod+Shift+P", ev("p", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(matchesShortcut("Mod+P", ev("p", { ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(matchesShortcut("Ctrl+Tab", ev("Tab", { ctrlKey: true }), true)).toBe(true);
    expect(matchesShortcut("Alt+Plus", ev("+", { altKey: true }), false)).toBe(true);
  });

  it("formats for menus", () => {
    expect(formatShortcut("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
    expect(formatShortcut("Mod+Shift+P", true)).toBe("⌘⇧P");
    expect(formatShortcut("Mod+`", false)).toBe("Ctrl+`");
  });
});
