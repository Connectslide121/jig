import { describe, expect, it } from "vitest";
import { summarize } from "./host";

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
