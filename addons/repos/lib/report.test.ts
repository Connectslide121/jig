import { describe, expect, it } from "vitest";
import { ago, commitText, findRepo, needsAttention, type RepoLine, repoText } from "./report";

const now = Date.parse("2026-11-05T12:00:00Z");
const repo = (over: Partial<RepoLine> = {}): RepoLine => ({
  name: "Shop",
  path: "/src/shop",
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  dirty: 0,
  lastFetch: "2026-11-05T10:00:00Z",
  ...over,
});

describe("repoText", () => {
  it("writes a clean repository", () => {
    expect(repoText(repo(), now)).toBe("Shop · main → origin/main · clean · fetched 2h ago · /src/shop");
  });

  it("says what is to push, to pull and changed", () => {
    expect(repoText(repo({ ahead: 2, behind: 1, dirty: 1, lastFetch: undefined }), now)).toBe(
      "Shop · main → origin/main · 2 to push · 1 to pull · 1 changed file · never fetched · /src/shop",
    );
    expect(repoText(repo({ upstream: undefined }), now)).toContain("main (no upstream)");
    expect(repoText(repo({ error: "not a git repository\nmore" }), now)).toBe(
      "Shop · couldn't read: not a git repository · /src/shop",
    );
  });
});

describe("needsAttention", () => {
  it("is set by changes, commits to push or pull, a missing upstream or an error", () => {
    expect(needsAttention(repo())).toBe(false);
    expect(needsAttention(repo({ dirty: 1 }))).toBe(true);
    expect(needsAttention(repo({ behind: 1 }))).toBe(true);
    expect(needsAttention(repo({ upstream: undefined }))).toBe(true);
    expect(needsAttention(repo({ error: "x" }))).toBe(true);
  });
});

describe("findRepo", () => {
  const repos = [
    { name: "Shop", path: "C:\\src\\shop" },
    { name: "Shop/api", path: "C:\\src\\shop-api" },
    { name: "Fabrikam", path: "/src/fabrikam" },
  ];
  it("finds by path, exact name, or a unique part of the name", () => {
    expect(findRepo(repos, "c:/src/shop-api")?.name).toBe("Shop/api");
    expect(findRepo(repos, "shop")?.name).toBe("Shop");
    expect(findRepo(repos, "fabri")?.name).toBe("Fabrikam");
    expect(findRepo(repos, "op/")?.name).toBe("Shop/api");
    expect(findRepo(repos, "contoso")).toBeUndefined();
  });

  it("finds nothing when a part matches several", () => {
    expect(findRepo([...repos, { name: "Shopfront", path: "/x" }], "sho")).toBeUndefined();
  });
});

describe("commitText and ago", () => {
  it("writes a commit with its state and refs", () => {
    const c = {
      hash: "a1b2c3d4",
      short: "a1b2c3d",
      subject: "Fix the cart",
      author: "Ana",
      time: now - 2 * 3600_000,
      refs: ["main"],
      state: "local" as const,
    };
    expect(commitText(c, now)).toBe("a1b2c3d · 2h ago · Ana · Fix the cart (to push) [main]");
    expect(commitText({ ...c, state: "pushed", refs: [] }, now)).toBe(
      "a1b2c3d · 2h ago · Ana · Fix the cart",
    );
  });

  it("rounds to minutes, hours and days", () => {
    expect(ago(now - 5 * 60_000, now)).toBe("5m");
    expect(ago(now - 3 * 86_400_000, now)).toBe("3d");
  });
});
