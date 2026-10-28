import { describe, expect, it } from "vitest";
import {
  collapseUnchanged,
  commitUrl,
  parseBranches,
  parseLog,
  parseNumstat,
  parseStatus,
  parseUnifiedDiff,
  relativeTime,
  sideBySide,
} from "./parse";

describe("parseStatus", () => {
  it("reads branch headers and sorts entries into staged, unstaged, untracked and conflicted", () => {
    const out = [
      "# branch.oid 1234567890abcdef",
      "# branch.head feature/x",
      "# branch.upstream origin/feature/x",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 aaa bbb src/app.ts",
      "1 .M N... 100644 100644 100644 aaa bbb src/with space.ts",
      "1 MM N... 100644 100644 100644 aaa bbb both.ts",
      "1 A. N... 000000 100644 100644 000 bbb new.ts",
      "1 .D N... 100644 100644 000000 aaa bbb gone.ts",
      "2 R. N... 100644 100644 100644 aaa bbb R100 renamed.ts",
      "old-name.ts",
      "u UU N... 100644 100644 100644 100644 a b c conflict.ts",
      "? untracked file.txt",
      "",
    ].join("\0");
    const s = parseStatus(out);
    expect(s.branch).toEqual({
      oid: "1234567890abcdef",
      head: "feature/x",
      upstream: "origin/feature/x",
      ahead: 2,
      behind: 1,
    });
    expect(s.staged).toEqual([
      { path: "src/app.ts", kind: "modified", origPath: undefined },
      { path: "both.ts", kind: "modified", origPath: undefined },
      { path: "new.ts", kind: "added", origPath: undefined },
      { path: "renamed.ts", kind: "renamed", origPath: "old-name.ts" },
    ]);
    expect(s.unstaged).toEqual([
      { path: "src/with space.ts", kind: "modified" },
      { path: "both.ts", kind: "modified" },
      { path: "gone.ts", kind: "deleted" },
    ]);
    expect(s.untracked).toEqual([{ path: "untracked file.txt", kind: "untracked" }]);
    expect(s.conflicted).toEqual([{ path: "conflict.ts", kind: "unmerged" }]);
  });

  it("handles a new repository without commits or upstream", () => {
    const s = parseStatus("# branch.oid (initial)\0# branch.head main\0");
    expect(s.branch).toEqual({ oid: undefined, head: "main", ahead: 0, behind: 0 });
  });
});

describe("parseBranches", () => {
  it("parses local and remote branches, current first", () => {
    const line = (...f: string[]) => f.join("\0");
    const out = [
      line(
        "refs/heads/feature",
        "feature",
        "aaa1111",
        "origin/feature",
        "ahead 1, behind 2",
        " ",
        "2026-10-01T10:00:00+02:00",
      ),
      line("refs/heads/main", "main", "bbb2222", "origin/main", "", "*", "2026-09-01T10:00:00+02:00"),
      line("refs/heads/old", "old", "ccc3333", "origin/old", "gone", " ", "2026-01-01T10:00:00+02:00"),
      line("refs/remotes/origin/HEAD", "origin/HEAD", "bbb2222", "", "", " ", ""),
      line("refs/remotes/origin/main", "origin/main", "bbb2222", "", "", " ", "2026-09-01T10:00:00+02:00"),
    ].join("\n");
    const branches = parseBranches(out);
    expect(branches.map((b) => b.name)).toEqual(["main", "feature", "old", "origin/main"]);
    expect(branches[1]).toMatchObject({ ahead: 1, behind: 2, upstream: "origin/feature", remote: false });
    expect(branches[2]?.gone).toBe(true);
    expect(branches[3]?.remote).toBe(true);
  });
});

describe("parseLog", () => {
  it("parses commits with refs, parents and bodies", () => {
    const rec = (...f: string[]) => `${f.join("\x1f")}\x1e`;
    const out = `${rec("h1", "h1s", "p1 p2", "Jon", "jon@x", "2026-10-27T10:00:00+01:00", "HEAD -> main, origin/main, tag: v1", "Merge it", "Body line\n")}\n${rec("h2", "h2s", "", "Ann", "ann@x", "2026-10-26T10:00:00+01:00", "", "First")}`;
    const [a, b] = parseLog(out);
    expect(a).toMatchObject({
      hash: "h1",
      parents: ["p1", "p2"],
      refs: ["main", "origin/main", "tag: v1"],
      subject: "Merge it",
      body: "Body line",
    });
    expect(b).toMatchObject({ hash: "h2", parents: [], refs: undefined, body: undefined, subject: "First" });
    expect(parseLog("")).toEqual([]);
  });
});

describe("parseNumstat", () => {
  it("parses counts, binary files and renames", () => {
    const out = "3\t1\tsrc/a.ts\0-\t-\timg.png\0" + "5\t0\t\0old.ts\0new.ts\0";
    expect(parseNumstat(out)).toEqual([
      { path: "src/a.ts", added: 3, deleted: 1 },
      { path: "img.png", added: null, deleted: null },
      { path: "new.ts", origPath: "old.ts", added: 5, deleted: 0 },
    ]);
  });
});

describe("diffs", () => {
  const patch = [
    "diff --git a/f.ts b/f.ts",
    "index 1..2 100644",
    "--- a/f.ts",
    "+++ b/f.ts",
    "@@ -1,4 +1,5 @@ function x() {",
    " one",
    "-two",
    "+TWO",
    "+extra",
    " three",
    " four",
    "",
  ].join("\n");

  it("parses hunks with line numbers", () => {
    const diff = parseUnifiedDiff(patch);
    expect(diff).toMatchObject({ oldPath: "f.ts", newPath: "f.ts", binary: false });
    expect(diff.hunks[0]?.lines).toEqual([
      { type: "context", text: "one", oldNo: 1, newNo: 1 },
      { type: "del", text: "two", oldNo: 2 },
      { type: "add", text: "TWO", newNo: 2 },
      { type: "add", text: "extra", newNo: 3 },
      { type: "context", text: "three", oldNo: 3, newNo: 4 },
      { type: "context", text: "four", oldNo: 4, newNo: 5 },
    ]);
  });

  it("detects new, deleted and binary files", () => {
    expect(parseUnifiedDiff("--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+x\n")).toMatchObject({
      oldPath: undefined,
      newPath: "new.ts",
    });
    expect(parseUnifiedDiff("Binary files a/x.png and b/x.png differ\n").binary).toBe(true);
  });

  it("pairs changes side by side", () => {
    const rows = sideBySide(parseUnifiedDiff(patch).hunks[0]!.lines);
    expect(rows.map((r) => [r.left?.text, r.right?.text])).toEqual([
      ["one", "one"],
      ["two", "TWO"],
      [undefined, "extra"],
      ["three", "three"],
      ["four", "four"],
    ]);
  });

  it("collapses long unchanged runs but keeps context", () => {
    const items = [..."aaaaaaaaaaXaaaaaaaaaa"].map((c, i) => ({ c, i }));
    const segments = collapseUnchanged(items, (x) => x.c === "X", 2);
    expect(segments.map((s) => [s.kind, s.items.length])).toEqual([
      ["collapsed", 8],
      ["lines", 5],
      ["collapsed", 8],
    ]);
    expect(collapseUnchanged([1, 2, 3], () => false, 2).map((s) => s.kind)).toEqual(["collapsed"]);
    expect(collapseUnchanged([1, 0, 1], (x) => x === 0, 3).map((s) => s.kind)).toEqual(["lines"]);
  });
});

describe("commitUrl", () => {
  it("builds GitHub and Azure DevOps commit links from remote URLs", () => {
    expect(commitUrl("https://github.com/o/r.git", "abc")).toBe("https://github.com/o/r/commit/abc");
    expect(commitUrl("git@github.com:o/r.git", "abc")).toBe("https://github.com/o/r/commit/abc");
    expect(commitUrl("https://org@dev.azure.com/org/Proj/_git/repo", "abc")).toBe(
      "https://dev.azure.com/org/Proj/_git/repo/commit/abc",
    );
    expect(commitUrl("git@ssh.dev.azure.com:v3/org/Proj/repo", "abc")).toBe(
      "https://dev.azure.com/org/Proj/_git/repo/commit/abc",
    );
    expect(commitUrl("https://org.visualstudio.com/Proj/_git/repo", "abc")).toBe(
      "https://dev.azure.com/org/Proj/_git/repo/commit/abc",
    );
    expect(commitUrl("https://gitlab.com/o/r.git", "abc")).toBeUndefined();
  });
});

describe("relativeTime", () => {
  it("says how long ago", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(relativeTime("2026-10-27T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-10-27T11:00:00Z", now)).toBe("1 hour ago");
    expect(relativeTime("2026-10-20T12:00:00Z", now)).toBe("1 week ago");
    expect(relativeTime("2026-10-24T12:00:00Z", now)).toBe("3 days ago");
  });
});
