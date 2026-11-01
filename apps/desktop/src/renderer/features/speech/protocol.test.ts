import { describe, expect, it } from "vitest";
import {
  insertDictation,
  isSilent,
  joinSpeech,
  level,
  placeDictation,
  quietestCut,
  SAMPLE_RATE,
} from "./protocol";

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

describe("placeDictation", () => {
  it("replaces the words so far as better ones come in, and removes them when cancelled", () => {
    const first = placeDictation("Fix", { start: 3, end: 3 }, "the");
    expect(first).toEqual({ text: "Fix the", span: { start: 3, end: 7 }, caret: 7 });
    const second = placeDictation(first.text, first.span, "the login bug");
    expect(second.text).toBe("Fix the login bug");
    const typedAfter = placeDictation(`${second.text}!`, second.span, "the login page");
    expect(typedAfter.text).toBe("Fix the login page!");
    expect(placeDictation(typedAfter.text, typedAfter.span, "").text).toBe("Fix!");
  });
});

describe("level and quietestCut", () => {
  it("finds the quiet moment to cut a long recording at", () => {
    const audio = new Float32Array(SAMPLE_RATE * 2).fill(0.5);
    audio.fill(0, SAMPLE_RATE, SAMPLE_RATE + SAMPLE_RATE / 5);
    expect(level(audio, 0, 10)).toBeCloseTo(0.5);
    expect(level(audio, 5, 5)).toBe(0);
    const cut = quietestCut(audio, SAMPLE_RATE / 2, SAMPLE_RATE * 2);
    expect(cut).toBeGreaterThanOrEqual(SAMPLE_RATE);
    expect(cut).toBeLessThanOrEqual(SAMPLE_RATE + SAMPLE_RATE / 5);
  });
});

describe("joinSpeech", () => {
  it("joins pieces with single spaces and skips empty ones", () => {
    expect(joinSpeech(" Hello. ", "", "How are you?")).toBe("Hello. How are you?");
    expect(joinSpeech()).toBe("");
  });
});
