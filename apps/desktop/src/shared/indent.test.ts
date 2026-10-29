import { describe, expect, it } from "vitest";
import { detectIndent, lineEnding } from "./indent";

describe("detectIndent", () => {
  it("finds tabs or the common number of spaces", () => {
    expect(detectIndent("a {\n\tb;\n\tc {\n\t\td;\n\t}\n}")).toEqual({ kind: "tabs", size: 4 });
    expect(detectIndent("def a():\n    b = 1\n    if b:\n        c()\n")).toEqual({
      kind: "spaces",
      size: 4,
    });
    expect(detectIndent('{\n  "a": {\n    "b": 1\n  }\n}')).toEqual({ kind: "spaces", size: 2 });
  });

  it("ignores JSDoc alignment and gives up without enough indentation", () => {
    const ts = "/**\n * Docs\n */\nfunction a() {\n  if (x) {\n    y();\n  }\n}";
    expect(detectIndent(ts)).toEqual({ kind: "spaces", size: 2 });
    expect(detectIndent("one\ntwo\nthree")).toBeUndefined();
    expect(detectIndent("")).toBeUndefined();
  });
});

describe("lineEnding", () => {
  it("tells Windows line endings from Unix ones", () => {
    expect(lineEnding("a\r\nb\r\n")).toBe("CRLF");
    expect(lineEnding("a\nb\n")).toBe("LF");
    expect(lineEnding("one line")).toBe("LF");
  });
});
