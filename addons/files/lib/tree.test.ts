import { describe, expect, it } from "vitest";
import {
  changeMatters,
  filterPaths,
  folderChanged,
  parseStatus,
  sortEntries,
  toggleRoot,
  visibleRoots,
} from "./tree";

describe("sortEntries", () => {
  it("puts folders first and sorts names naturally", () => {
    const e = (name: string, dir = false) => ({ name, path: `/r/${name}`, dir });
    expect(
      sortEntries([e("b.ts"), e("src", true), e("a10.ts"), e("a2.ts"), e("Docs", true)]).map((x) => x.name),
    ).toEqual(["Docs", "src", "a2.ts", "a10.ts", "b.ts"]);
  });
});

describe("parseStatus / folderChanged", () => {
  it("maps git's short status to file states with absolute paths", () => {
    const out = [
      " M src/app.ts",
      "?? notes.md",
      "A  src/new.ts",
      " D old.ts",
      "R  src/b.ts",
      "src/a.ts",
      "UU merge.ts",
      "",
    ].join("\0");
    const states = parseStatus(out, "/r/shop");
    expect(states).toEqual({
      "/r/shop/src/app.ts": "modified",
      "/r/shop/notes.md": "untracked",
      "/r/shop/src/new.ts": "added",
      "/r/shop/old.ts": "deleted",
      "/r/shop/src/b.ts": "renamed",
      "/r/shop/merge.ts": "conflict",
    });
    expect(folderChanged("/r/shop/src", states)).toBe(true);
    expect(folderChanged("/r/shop/sr", states)).toBe(false);
    expect(parseStatus(" M src/app.ts\0", "C:\\repos\\shop")).toEqual({
      "C:\\repos\\shop\\src\\app.ts": "modified",
    });
  });
});

describe("visibleRoots / toggleRoot", () => {
  it("follows the chosen folder, with the ones shown next to it", () => {
    const known = ["/r", "/r/podium", "/r/elearning"];
    expect(visibleRoots({ extras: {} }, "/r", known)).toEqual(["/r"]);
    const roots = toggleRoot({ main: "/r/podium", extras: {} }, "/r/podium", "/r/elearning");
    expect(visibleRoots(roots, "/r", known)).toEqual(["/r/podium", "/r/elearning"]);
    expect(toggleRoot(roots, "/r/podium", "/r/elearning").extras).toEqual({});
    // A folder that's gone falls back to the project's default.
    expect(visibleRoots({ main: "/gone", extras: {} }, "/r", known)).toEqual(["/r"]);
  });
});

describe("filterPaths / changeMatters", () => {
  it("finds files by words in their path, name matches first", () => {
    const paths = ["src/cart/total.ts", "docs/cart.md", "src/cart.ts", "test/total.test.ts"];
    expect(filterPaths(paths, "cart")).toEqual(["src/cart.ts", "docs/cart.md", "src/cart/total.ts"]);
    expect(filterPaths(paths, "total test")).toEqual(["test/total.test.ts"]);
    expect(filterPaths(paths, "  ")).toEqual([]);
  });
  it("refreshes for files, the index and HEAD, not git's other files", () => {
    expect(changeMatters("src/app.ts")).toBe(true);
    expect(changeMatters(".git/index")).toBe(true);
    expect(changeMatters(".git/objects/ab/cd")).toBe(false);
  });
});
