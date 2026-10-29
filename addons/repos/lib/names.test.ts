import { describe, expect, it } from "vitest";
import { shortNames, syncChip } from "./names";

describe("repository names", () => {
  it("uses the folder's name, and its parents only where two would read the same", () => {
    const names = shortNames([
      "E:/repos/Shop/shop",
      "E:/repos/Shop/shop-api",
      "E:/repos/a/wt/C1",
      "E:/repos/b/wt/C1",
      "E:\\repos\\Docs\\",
    ]);
    expect([...names.values()]).toEqual(["shop", "shop-api", "a/wt/C1", "b/wt/C1", "Docs"]);
  });

  it("says what syncing would do", () => {
    expect(syncChip({ ahead: 2, behind: 1, dirty: 3 })).toEqual({ text: "↓1 ↑2", tone: "accent" });
    expect(syncChip({ ahead: 0, behind: 0, dirty: 3 })).toEqual({ text: "3 changed", tone: "warning" });
    expect(syncChip({ ahead: 0, behind: 0, dirty: 0 })).toEqual({ text: "✓", tone: "success" });
    expect(syncChip({ ahead: 0, behind: 0, dirty: 0, error: "x" }).tone).toBe("danger");
  });
});
