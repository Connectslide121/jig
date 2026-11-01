import { describe, expect, it } from "vitest";
import { downmix, insertDictation, isSilent } from "./protocol";

describe("downmix", () => {
  it("keeps one channel and averages several", () => {
    const mono = new Float32Array([0.1, 0.2]);
    expect(downmix([mono])).toBe(mono);
    expect([...downmix([new Float32Array([1, 0, 0.5]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]);
  });
});

describe("isSilent", () => {
  it("is silent below the threshold", () => {
    expect(isSilent(new Float32Array([0, 0.001, -0.005]))).toBe(true);
    expect(isSilent(new Float32Array([0, -0.3]))).toBe(false);
    expect(isSilent(new Float32Array())).toBe(true);
  });
});

describe("insertDictation", () => {
  it("puts the text at the caret with spaces where needed", () => {
    expect(insertDictation("", 0, "Hello")).toEqual({ text: "Hello", caret: 5 });
    expect(insertDictation("Fix", 3, "the bug")).toEqual({ text: "Fix the bug", caret: 11 });
    expect(insertDictation("Fix ", 4, "it")).toEqual({ text: "Fix it", caret: 6 });
    expect(insertDictation("ab", 1, "x")).toEqual({ text: "a x b", caret: 3 });
    expect(insertDictation("Fix\n", 4, "this")).toEqual({ text: "Fix\nthis", caret: 8 });
  });
});
