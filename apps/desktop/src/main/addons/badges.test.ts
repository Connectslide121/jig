import { describe, expect, it } from "vitest";
import { Badges, badgeText, ownViewId } from "./badges";

describe("add-on badges", () => {
  it("shows counts and short words, and clears on nothing", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(150)).toBe("99+");
    expect(badgeText(0)).toBeUndefined();
    expect(badgeText(" !  ")).toBe("!");
    expect(badgeText("failed")).toBe("fail");
    expect(badgeText(undefined)).toBeUndefined();
  });

  it("only allows an add-on's own views", () => {
    expect(ownViewId("board", "cards", ["cards"])).toBe("addon.board.cards");
    expect(ownViewId("board", "addon.board.cards", ["cards"])).toBe("addon.board.cards");
    expect(ownViewId("board", "addon.git.git", ["cards"])).toBeUndefined();
    expect(ownViewId("board", "other", ["cards"])).toBeUndefined();
  });

  it("reports changes and clears an add-on's badges", () => {
    const seen: Array<Record<string, string>> = [];
    const b = new Badges((all) => seen.push(all));
    b.set("addon.board.cards", 2);
    b.set("addon.board.cards", 2);
    b.set("addon.ci.runs", "!");
    b.clear("board");
    expect(seen).toEqual([
      { "addon.board.cards": "2" },
      { "addon.board.cards": "2", "addon.ci.runs": "!" },
      { "addon.ci.runs": "!" },
    ]);
  });
});
