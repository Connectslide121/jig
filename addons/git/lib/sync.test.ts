import { describe, expect, it } from "vitest";
import { syncAction, syncResult } from "./sync";

const branch = (ahead: number, behind: number, upstream: string | null = "origin/main") => ({
  head: "main",
  upstream: upstream ?? undefined,
  ahead,
  behind,
});

describe("syncAction", () => {
  it("publishes a branch without an upstream", () => {
    expect(syncAction(branch(0, 0, null))).toMatchObject({ kind: "publish", label: "Publish Branch" });
  });

  it("says Push when only ahead", () => {
    const a = syncAction(branch(2, 0));
    expect(a).toMatchObject({ kind: "push", label: "Push ↑2", short: "↑2" });
    expect(a.title).toBe("Push 2 commits to origin/main");
  });

  it("says Pull when only behind", () => {
    const a = syncAction(branch(0, 1));
    expect(a).toMatchObject({ kind: "pull", label: "Pull ↓1", short: "↓1" });
    expect(a.title).toBe("Pull 1 commit from origin/main");
  });

  it("says Sync only when both ways", () => {
    const a = syncAction(branch(2, 1));
    expect(a).toMatchObject({ kind: "sync", label: "Sync ↓1 ↑2", short: "↓1 ↑2" });
    expect(a.title).toBe("Pull 1 commit from origin/main, then push 2 commits");
  });

  it("is up to date with nothing either way", () => {
    expect(syncAction(branch(0, 0))).toMatchObject({ kind: "none", short: "Up to date" });
  });
});

describe("syncResult", () => {
  it("names what was done", () => {
    expect(syncResult("main", "origin/main", 0, 1)).toBe("Pushed 1 commit to origin/main");
    expect(syncResult("main", "origin/main", 3, 0)).toBe("Pulled 3 commits from origin/main");
    expect(syncResult("main", "origin/main", 1, 2)).toBe("Synced main: pulled 1 commit, pushed 2 commits");
    expect(syncResult("main", "origin/main", 0, 0)).toBe("main is up to date");
  });
});
