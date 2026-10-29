import { describe, expect, it } from "vitest";
import { commitAge, diffTree, hunks, parseFiles, parseLog, refLabel } from "./commits";

describe("a repository's commits", () => {
  it("reads git log with refs and each commit's state", () => {
    const out =
      "aaa\x1fa1\x1fFix total\x1fAnn Demo\x1f1700000000\x1fHEAD -> main, origin/main, origin/HEAD, tag: v1.2\x1e\n" +
      "bbb\x1fb2\x1fAdd cart\x1fBo Demo\x1f1699990000\x1f\x1e\n";
    const list = parseLog(out, (hash) => (hash === "aaa" ? "local" : "pushed"));
    expect(list).toEqual([
      {
        hash: "aaa",
        short: "a1",
        subject: "Fix total",
        author: "Ann Demo",
        time: 1700000000000,
        refs: ["main", "origin/main", "tag: v1.2"],
        state: "local",
      },
      {
        hash: "bbb",
        short: "b2",
        subject: "Add cart",
        author: "Bo Demo",
        time: 1699990000000,
        refs: [],
        state: "pushed",
      },
    ]);
    expect(refLabel("tag: v1.2")).toEqual({ label: "v1.2", tag: true });
    expect(refLabel("origin/main")).toEqual({ label: "origin/main", tag: false });
    expect(() => diffTree("HEAD; rm")).toThrow();
  });

  it("reads a commit's files, cuts long diffs at a hunk and says how long ago", () => {
    expect(
      parseFiles(
        "M\tcart.ts\nR087\told.ts\tnew.ts\nA\tlogo.png\n",
        "2\t1\tcart.ts\n0\t0\tnew.ts\n-\t-\tlogo.png\n",
      ),
    ).toEqual([
      { status: "M", path: "cart.ts", from: "", added: 2, removed: 1 },
      { status: "R", path: "new.ts", from: "old.ts", added: 0, removed: 0 },
      { status: "A", path: "logo.png", from: "", added: -1, removed: -1 },
    ]);
    const patch = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-c\n+d\n";
    expect(hunks(patch)).toEqual({ text: "@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-c\n+d", cut: false });
    expect(hunks(patch, 20)).toEqual({ text: "@@ -1 +1 @@\n-a\n+b", cut: true });
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(commitAge(now - 4 * 60_000, now)).toBe("4m");
    expect(commitAge(now - 3 * 3_600_000, now)).toBe("3h");
    expect(commitAge(now - 30 * 3_600_000, now)).toBe("yesterday");
    expect(commitAge(now - 5 * 86_400_000, now)).toBe("5d");
    expect(commitAge(now - 21 * 86_400_000, now)).toBe("3w");
    expect(commitAge(Date.parse("2026-01-02T00:00:00Z"), now)).toBe("2026-01-02");
  });
});
