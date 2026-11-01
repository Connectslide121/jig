import { describe, expect, it } from "vitest";
import { speakableText, speakableUntil } from "./speak";

describe("speakableText", () => {
  it("drops Markdown marks and names code blocks", () => {
    const md = [
      "## Done",
      "",
      "I changed **two** files in `src/app.ts`:",
      "- the [router](https://example.com/r)",
      "1. a *test*",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "> Note it",
    ].join("\n");
    expect(speakableText(md)).toBe(
      "Done\nI changed two files in src/app.ts:\nthe router\na test\n(code)\nNote it",
    );
  });

  it("reads tables as rows and keeps snake_case words", () => {
    expect(speakableText("| a | b |\n|---|---|\n| 1 | 2 |")).toContain("1");
    expect(speakableText("use my_var_name")).toBe("use my_var_name");
  });
});

describe("speakableUntil", () => {
  it("stops at the last finished sentence", () => {
    const text = "Sure. I can do that! And then";
    expect(text.slice(0, speakableUntil(text, 0, false))).toBe("Sure. I can do that!");
    expect(speakableUntil(text, 0, true)).toBe(text.length);
  });

  it("waits for more text when no sentence is finished", () => {
    expect(speakableUntil("Hello there", 0, false)).toBe(0);
    expect(speakableUntil("One. Two", 4, false)).toBe(4);
  });

  it("never stops inside an unfinished code block", () => {
    const text = "Look.\n```ts\nconst a = 1;\n";
    expect(speakableUntil(text, 0, false)).toBe("Look.\n".length);
  });
});
