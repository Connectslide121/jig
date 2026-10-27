import { jigDark, jigLight } from "@jig/themes";
import { describe, expect, it } from "vitest";
import { highlight, resolveLanguage, setHighlightTheme } from "./highlight";

describe("highlight", () => {
  it("resolves languages and aliases", () => {
    expect(resolveLanguage("TypeScript")).toBe("typescript");
    expect(resolveLanguage("ts")).toBe("ts");
    expect(resolveLanguage("nope")).toBeUndefined();
    expect(resolveLanguage(undefined)).toBeUndefined();
  });

  it("colours code with the theme's own token colours", async () => {
    await setHighlightTheme(jigDark);
    const html = await highlight('const greeting = "hi"; // hello', "ts");
    expect(html).toContain('class="shiki');
    expect(html?.toLowerCase()).toContain(jigDark.colors.code);
    expect(html?.toLowerCase()).toContain("#8fbf7f"); // Jig Dark strings
    await setHighlightTheme(jigLight);
    expect((await highlight('"x"', "json"))?.toLowerCase()).toContain(jigLight.colors.code);
    expect(await highlight("x", "nope")).toBeUndefined();
  });
});
