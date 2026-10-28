import { describe, expect, it } from "vitest";
import { guessDelimiter, parseDelimited } from "./table";

describe("parseDelimited", () => {
  it("reads quoted fields, doubled quotes and line breaks in quotes", () => {
    expect(parseDelimited('name,note\r\n"Ann","said ""hi""\nthen left"\nBo,\n').rows).toEqual([
      ["name", "note"],
      ["Ann", 'said "hi"\nthen left'],
      ["Bo", ""],
    ]);
  });

  it("handles tabs, a BOM and a last line without newline", () => {
    expect(parseDelimited("﻿a\tb\n1\t2", "\t").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("stops at maxRows", () => {
    expect(parseDelimited("1\n2\n3\n4\n", ",", 2)).toEqual({ rows: [["1"], ["2"]], truncated: true });
  });

  it("guesses the delimiter from the first line", () => {
    expect(guessDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(guessDelimiter("a\tb")).toBe("\t");
    expect(guessDelimiter("a,b")).toBe(",");
  });
});
