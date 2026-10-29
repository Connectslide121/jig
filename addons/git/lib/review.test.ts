import { describe, expect, it } from "vitest";
import { type ReviewComment, reviewPrompt } from "./review";

const c = (
  path: string,
  line: number,
  text: string,
  side: "old" | "new" = "new",
  code = "x",
): ReviewComment => ({
  id: `${path}${line}`,
  path,
  side,
  line,
  code,
  text,
  at: "",
});

describe("review comments", () => {
  it("turns comments into one message, per file and line", () => {
    const prompt = reviewPrompt(
      [
        c("src/cart.ts", 12, "Round here", "new", "  return sum;"),
        c("README.md", 3, "Typo"),
        c("src/cart.ts", 4, "Why removed?", "old", "a`b"),
      ],
      "shop",
    );
    expect(prompt).toBe(
      [
        "Review comments on my changes (shop). Address each one in the code; if you disagree with one, say why instead.",
        "",
        "**README.md**",
        "- line 3 `x`: Typo",
        "",
        "**src/cart.ts**",
        "- line 4 (removed) `a'b`: Why removed?",
        "- line 12 `return sum;`: Round here",
      ].join("\n"),
    );
  });
});
