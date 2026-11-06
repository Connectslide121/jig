import { describe, expect, it } from "vitest";
import { earlyBreak, speakableText, speakableUntil, speechChunks, speechParts } from "./speak";

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

describe("earlyBreak", () => {
  const cut = (text: string, final = false) => {
    const at = earlyBreak(text, 0, final);
    return at === undefined ? undefined : text.slice(0, at);
  };

  it("ends the first chunk at a comma with at least four words before it", () => {
    expect(cut("I looked at the cart code, and the total is computed twice.")).toBe(
      "I looked at the cart code,",
    );
    expect(cut("Okay; let me look at the code now and tell you.", true)).toBeUndefined();
    expect(cut("First I'll read the tests: they show it")).toBe("First I'll read the tests:");
    expect(cut("I read the whole file — it uses Redux")).toBe("I read the whole file —");
  });

  it("keeps a short sentence whole, and a comma with one word after it", () => {
    expect(cut("Sure, let me look at that.")).toBeUndefined();
    expect(cut("I can look at that code, too.", true)).toBeUndefined();
    expect(cut("Hello there.", true)).toBeUndefined();
  });

  it("waits for the word after the comma before cutting", () => {
    expect(cut("I looked at the cart code, and")).toBeUndefined();
    expect(cut("I looked at the cart code, and the")).toBe("I looked at the cart code,");
  });

  it("cuts after eight words while the sentence is still being written", () => {
    expect(cut("The total is worked out in the cart service and then")).toBe(
      "The total is worked out in the cart",
    );
    expect(cut("The total is worked out in the cart service and then", true)).toBeUndefined();
    // The eighth word isn't whole until the next one begins.
    expect(cut("The total is worked out in the cart")).toBeUndefined();
  });

  it("never cuts inside a number, inline code, a link, bold text or a code block", () => {
    expect(cut("We need to buy about twelve of 1 000 things")).toBe("We need to buy about twelve of 1 000");
    expect(cut("Run `npm run test and then lint` to check it all")).toBe(
      "Run `npm run test and then lint` to",
    );
    expect(cut("Open **the cart service and its many tests** to see it")).toBe(
      "Open **the cart service and its many tests**",
    );
    expect(cut("See [the docs about the cart service](x) for more")).toBe(
      "See [the docs about the cart service](x) for",
    );
    expect(cut("```ts\nconst a = 1, b = 2, c = 3, d = 4;\n")).toBeUndefined();
  });

  it("starts from where the reply was said up to", () => {
    const text = "Done. I looked at the cart code, and the total is wrong.";
    expect(text.slice(6, earlyBreak(text, 6, true))).toBe("I looked at the cart code,");
  });
});

describe("speechChunks", () => {
  it("says each sentence on its own", () => {
    expect(speechChunks("One. Two!\nThree? Four")).toEqual(["One.", "Two!", "Three?", "Four"]);
    expect(speechChunks("")).toEqual([]);
  });
});

describe("speechParts", () => {
  it("splits text into sentences, joining short ones up to the limit", () => {
    expect(speechParts("One. Two!\nThree? Four", 9)).toEqual(["One. Two!", "Three?", "Four"]);
    expect(speechParts("Hello there. How are you?")).toEqual(["Hello there. How are you?"]);
    expect(speechParts("  ")).toEqual([]);
  });
});
