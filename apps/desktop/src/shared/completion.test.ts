import { describe, expect, it } from "vitest";
import {
  activeCompletionProvider,
  cleanCompletion,
  completionPrompt,
  offsetAt,
  positionAt,
} from "./completion";

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
    const prompt = completionPrompt({ path: "src/cart.ts", text: "const a = 1;\nconst b", offset: 20 });
    expect(prompt).toContain("in cart.ts");
    expect(prompt.endsWith("const a = 1;\nconst b<CURSOR>")).toBe(true);
  });
  it("keeps only the text to insert", () => {
    const text = "function total(items) {\n  return \n}";
    const at = text.indexOf("return ") + 7;
    expect(cleanCompletion("```ts\nitems.length;\n```", text, at)).toBe("items.length;");
    expect(cleanCompletion("  return items.length;", text, at)).toBe("items.length;");
    expect(cleanCompletion("   \n", text, at)).toBe("");
    const mid = "call(a, )";
    expect(cleanCompletion("b)", mid, 8)).toBe("b");
  });
});

describe("the provider that completes", () => {
  it("is the chosen one; Copilot without its sign-in is off", () => {
    expect(activeCompletionProvider("copilot", true)).toBe("copilot");
    expect(activeCompletionProvider("copilot", false)).toBe("off");
    expect(activeCompletionProvider("claude", false)).toBe("claude");
    expect(activeCompletionProvider("chatgpt", false)).toBe("chatgpt");
  });
});
