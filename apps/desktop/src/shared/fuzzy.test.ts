import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("needs the characters in order", () => {
    expect(fuzzyScore("src/cart.ts", "crt")).toBeDefined();
    expect(fuzzyScore("src/cart.ts", "tcr")).toBeUndefined();
    expect(fuzzyScore("anything", "")).toBe(0);
  });

  it("prefers substrings, file names and word starts", () => {
    expect(fuzzyScore("src/cart.ts", "cart")!).toBeGreaterThan(fuzzyScore("src/c-a-r-t.ts", "cart")!);
    expect(fuzzyScore("src/cart.ts", "cart")!).toBeGreaterThan(fuzzyScore("cart/index.ts", "cart")!);
    expect(fuzzyScore("Src/Cart.TS", "cart.ts")).toBeDefined();
  });
});

describe("fuzzyFilter", () => {
  it("ranks and limits", () => {
    const files = ["docs/readme.md", "src/cart.ts", "src/checkout/cart-item.tsx", "test/cart.test.ts"];
    expect(fuzzyFilter(files, "cart", (f) => f, 2)).toEqual(["src/cart.ts", "test/cart.test.ts"]);
    expect(fuzzyFilter(files, "zzz", (f) => f)).toEqual([]);
    expect(fuzzyFilter(files, "", (f) => f)).toEqual(files);
  });
});
