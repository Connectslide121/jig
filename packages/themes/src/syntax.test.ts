import { describe, expect, it } from "vitest";
import { jigDark } from "./builtin";
import type { TokenColorRule } from "./model";
import { scopeStyle, syntaxStyles } from "./syntax";

const rules: TokenColorRule[] = [
  { settings: { foreground: "#ffffff" } },
  { scope: "keyword", settings: { foreground: "#111111" } },
  { scope: "keyword.control", settings: { foreground: "#222222", fontStyle: "italic bold" } },
  { scope: "comment, punctuation.definition.comment", settings: { fontStyle: "italic" } },
  { scope: ["meta.function-call entity.name.function"], settings: { foreground: "#333333" } },
  { scope: "keyword", settings: { foreground: "#444444" } },
];

describe("scopeStyle", () => {
  it("matches the scope or a parent, the most specific selector winning", () => {
    expect(scopeStyle(rules, "keyword.control.import")).toEqual({
      color: "#222222",
      italic: true,
      bold: true,
      underline: undefined,
    });
    // Of two equally specific rules, the later one.
    expect(scopeStyle(rules, "keyword.operator")?.color).toBe("#444444");
    expect(scopeStyle(rules, "keywords")).toBeUndefined();
  });

  it("reads comma lists, arrays and descendant selectors; a style without colour counts", () => {
    expect(scopeStyle(rules, "comment.line")).toEqual({ color: undefined, italic: true });
    expect(scopeStyle(rules, "entity.name.function")?.color).toBe("#333333");
    expect(scopeStyle(rules, "string")).toBeUndefined();
  });
});

describe("syntaxStyles", () => {
  it("gives each kind of code the theme's colour, falling back to a broader scope", () => {
    const s = syntaxStyles(jigDark);
    expect(s.keyword?.color).toBe("#cf8e6d");
    expect(s.moduleKeyword?.color).toBe("#cf8e6d");
    expect(s.string?.color).toBe("#8fbf7f");
    expect(s.comment).toMatchObject({ color: "#7a7e85", italic: true });
    expect(s.function?.color).toBe("#6cb6ff");
    expect(s.heading).toMatchObject({ bold: true });
    expect(syntaxStyles({ syntax: { tokenColors: [] } })).toEqual({});
  });
});
