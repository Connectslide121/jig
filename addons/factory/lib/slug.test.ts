import { describe, expect, it } from "vitest";
import { branchOf, folderOf, newRunId, slugify, titleOf, uniqueSlug } from "./slug";

describe("slugs", () => {
  it("makes lower-case ASCII slugs cut at a word", () => {
    expect(slugify("Shift swap for Contoso Café!")).toBe("shift-swap-for-contoso-cafe");
    expect(slugify("   ")).toBe("idea");
    expect(slugify("a".repeat(50))).toHaveLength(40);
    expect(slugify("one two three four five six seven eight nine")).toBe(
      "one-two-three-four-five-six-seven-eight",
    );
  });

  it("adds a number when the slug is taken", () => {
    expect(uniqueSlug("shop", [])).toBe("shop");
    expect(uniqueSlug("shop", ["shop", "shop-2"])).toBe("shop-3");
  });

  it("makes run ids, branches and folders", () => {
    expect(newRunId(0, () => 0)).toBe("fx-0000");
    expect(newRunId(1_700_000_000_000, () => 0.5)).toMatch(/^fx-[a-z0-9]+$/);
    expect(branchOf("shop")).toBe("factory/shop");
    expect(folderOf("shop")).toBe("docs/factory/shop");
  });

  it("titles a run from the first line of what came in", () => {
    expect(titleOf("\n# Shift swap\nMore text")).toBe("Shift swap");
    expect(titleOf("")).toBe("New idea");
    expect(titleOf(`${"word ".repeat(20)}`)).toMatch(/^word( word)*…$/);
  });
});
