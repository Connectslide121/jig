import { describe, expect, it } from "vitest";
import { claudePrompt, cleanClaudeCompletion, offsetAt, positionAt } from "./completion";

describe("positions", () => {
  it("turns offsets into LSP line/character and back", () => {
    const text = "ab\ncdé\n\nx";
    expect(positionAt(text, 0)).toEqual({ line: 0, character: 0 });
    expect(positionAt(text, 5)).toEqual({ line: 1, character: 2 });
    expect(positionAt(text, 8)).toEqual({ line: 3, character: 0 });
    expect(offsetAt(text, { line: 1, character: 2 })).toBe(5);
    expect(offsetAt(text, { line: 1, character: 99 })).toBe(6);
    expect(offsetAt(text, { line: 9, character: 0 })).toBe(text.length);
  });
});

describe("Claude completions", () => {
  it("marks the caret in the code around it", () => {
    const prompt = claudePrompt({ path: "src/cart.ts", text: "const a = 1;\nconst b", offset: 20 });
    expect(prompt).toContain("in cart.ts");
    expect(prompt.endsWith("const a = 1;\nconst b<CURSOR>")).toBe(true);
  });
  it("keeps only the text to insert", () => {
    const text = "function total(items) {\n  return \n}";
    const at = text.indexOf("return ") + 7;
    expect(cleanClaudeCompletion("```ts\nitems.length;\n```", text, at)).toBe("items.length;");
    expect(cleanClaudeCompletion("  return items.length;", text, at)).toBe("items.length;");
    expect(cleanClaudeCompletion("   \n", text, at)).toBe("");
    const mid = "call(a, )";
    expect(cleanClaudeCompletion("b)", mid, 8)).toBe("b");
  });
});
