import { describe, expect, it } from "vitest";
import {
  addDivider,
  arrange,
  EMPTY_ARRANGEMENT,
  moveKey,
  removeDivider,
  renameDivider,
  toggleHidden,
} from "./arrange";

const items = ["build", "dev", "test", "deploy"];
const key = (s: string) => s;
const keys = (a = EMPTY_ARRANGEMENT, all = false) =>
  arrange(items, key, a, all).map((e) => (e.kind === "item" ? e.key : `--${e.title}`));

describe("arrange", () => {
  it("keeps the natural order until you arrange, and puts new items after arranged ones", () => {
    expect(keys()).toEqual(items);
    const moved = moveKey(items, key, EMPTY_ARRANGEMENT, "deploy", "build");
    expect(keys(moved)).toEqual(["deploy", "build", "dev", "test"]);
    expect(arrange([...items, "lint"], key, moved).map((e) => e.key)).toEqual([
      "deploy",
      "build",
      "dev",
      "test",
      "lint",
    ]);
  });

  it("hides items except while arranging", () => {
    const a = toggleHidden(EMPTY_ARRANGEMENT, "test");
    expect(keys(a)).toEqual(["build", "dev", "deploy"]);
    expect(arrange(items, key, a, true).find((e) => e.key === "test")).toMatchObject({ hidden: true });
    expect(keys(toggleHidden(a, "test"))).toEqual(items);
  });

  it("groups with dividers, which disappear when nothing visible is under them", () => {
    let a = addDivider(items, key, EMPTY_ARRANGEMENT, "Local", "build");
    a = addDivider(items, key, a, "Release", "deploy");
    expect(keys(a)).toEqual(["--Local", "build", "dev", "test", "--Release", "deploy"]);
    const releaseKey = a.order.find((k) => a.dividers[k] === "Release")!;
    a = renameDivider(a, releaseKey, " Ship ");
    expect(keys(a)).toContain("--Ship");
    expect(keys(toggleHidden(a, "deploy"))).toEqual(["--Local", "build", "dev", "test"]);
    expect(keys(toggleHidden(a, "deploy"), true)).toContain("--Ship");
    expect(keys(removeDivider(a, releaseKey))).toEqual(["--Local", "build", "dev", "test", "deploy"]);
  });
});
