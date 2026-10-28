import { describe, expect, it } from "vitest";
import { repoItems, summarize } from "./host";

describe("summarize", () => {
  it("reads branch, upstream, ahead/behind and counts changed files", () => {
    const out = [
      "# branch.oid abc",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +3 -0",
      "1 .M N... 100644 100644 100644 a b x.ts",
      "2 R. N... 100644 100644 100644 a b R100 y.ts",
      "old.ts",
      "? z.txt",
      "",
    ].join("\0");
    expect(summarize(out)).toEqual({
      branch: "main",
      upstream: "origin/main",
      ahead: 3,
      behind: 0,
      dirty: 3,
    });
  });
});

describe("repoItems", () => {
  it("lists repository projects and the repositories inside workspace projects", () => {
    const base = { exists: true, repos: [] as Array<{ path: string; name: string }> };
    expect(
      repoItems([
        { ...base, id: "a", name: "shop", path: "/r/shop", isGitRepo: true },
        {
          ...base,
          id: "w",
          name: "repos",
          path: "/r",
          isGitRepo: false,
          repos: [{ path: "/r/client-a/api", name: "client-a/api" }],
        },
        { ...base, id: "x", name: "gone", path: "/gone", isGitRepo: true, exists: false },
      ]),
    ).toEqual([
      { projectId: "a", name: "shop", path: "/r/shop" },
      { projectId: "w", name: "repos/client-a/api", path: "/r/client-a/api", repoPath: "/r/client-a/api" },
    ]);
  });
});
