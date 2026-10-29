import { describe, expect, it } from "vitest";
import { repoStatus, shortNames } from "./names";

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

  it("says what state a repository is in, and shows pills only when there is something to do", () => {
    expect(repoStatus({ ahead: 2, behind: 1, dirty: 3 })).toEqual({
      tone: "accent",
      label: "1 to pull, 2 to push, 3 changed",
      sync: "↓1 ↑2",
      changed: 3,
    });
    expect(repoStatus({ ahead: 0, behind: 0, dirty: 3 })).toEqual({
      tone: "warning",
      label: "3 changed",
      changed: 3,
    });
    expect(repoStatus({ ahead: 0, behind: 0, dirty: 0 })).toEqual({ tone: "success", label: "Up to date" });
    expect(repoStatus({ ahead: 0, behind: 0, dirty: 0, error: "x" }).tone).toBe("danger");
  });
});
