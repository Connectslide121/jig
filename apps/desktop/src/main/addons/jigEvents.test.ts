import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import { branchOf, chatEventFor, GitEvents, gitDirOf, gitEvents, lastReflog } from "./jigEvents";

const meta = (status: SessionMeta["status"], extra: Partial<SessionMeta> = {}) =>
  ({
    id: "s1",
    title: "Fix the cart",
    status,
    kind: "chat",
    cwd: "/w/shop",
    projectId: "p1",
    ...extra,
  }) as SessionMeta;

describe("Jig events", () => {
  it("turns a chat's status change away from working into an event", () => {
    expect(chatEventFor("working", meta("idle"))).toEqual({
      name: "chat.finished",
      payload: { sessionId: "s1", title: "Fix the cart", projectId: "p1", cwd: "/w/shop" },
    });
    expect(chatEventFor("working", meta("needs_you"))?.name).toBe("chat.needsYou");
    expect(chatEventFor("starting", meta("error", { lastError: "Boom\nstack" }))).toMatchObject({
      name: "chat.failed",
      payload: { error: "Boom" },
    });
    expect(chatEventFor(undefined, meta("idle"))).toBeUndefined();
    expect(chatEventFor("idle", meta("idle"))).toBeUndefined();
    expect(chatEventFor("working", meta("idle", { kind: "builder" }))).toBeUndefined();
  });

  it("reads HEAD and the reflog", () => {
    expect(branchOf("ref: refs/heads/feature/cart\n")).toBe("feature/cart");
    expect(branchOf("0123456789abcdef0123456789abcdef01234567\n")).toBeUndefined();
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    expect(lastReflog(`${a} ${b} Sam <s@x> 1700000000 +0100\tcommit: Fix total\n`)).toEqual({
      sha: b,
      message: "commit: Fix total",
    });
    expect(lastReflog("")).toBeUndefined();
  });

  it("reports commits and branch switches between two states", () => {
    expect(gitEvents("/r", undefined, { branch: "main" })).toEqual([]);
    expect(
      gitEvents(
        "/r",
        { branch: "main", sha: "1" },
        { branch: "main", sha: "2", message: "commit (amend): Tidy" },
      ),
    ).toEqual([{ name: "git.commit", payload: { repo: "/r", branch: "main", sha: "2", message: "Tidy" } }]);
    expect(
      gitEvents(
        "/r",
        { branch: "main", sha: "1" },
        { branch: "main", sha: "2", message: "pull: Fast-forward" },
      ),
    ).toEqual([]);
    expect(gitEvents("/r", { branch: "main" }, { branch: "cart", message: "checkout: moving" })).toEqual([
      { name: "git.branch", payload: { repo: "/r", from: "main", to: "cart" } },
    ]);
  });
});

describe("GitEvents", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("finds a worktree's git folder and sees a commit made outside Jig", async () => {
    dir = await mkdtemp(join(tmpdir(), "jig-gitev-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=Sam", "-c", "user.email=s@x", ...args], {
        cwd: dir,
        stdio: "pipe",
      });
    git("init", "-q", "-b", "main");
    await writeFile(join(dir, "a.txt"), "1");
    git("add", ".");
    git("commit", "-q", "-m", "First");
    expect(await gitDirOf(dir)).toBe(join(dir, ".git"));

    const seen: Array<{ name: string; payload: unknown }> = [];
    const events = new GitEvents((name, payload) => seen.push({ name, payload }));
    await events.setRepos([dir]);
    await writeFile(join(dir, "a.txt"), "2");
    git("commit", "-q", "-am", "Second");
    for (let i = 0; i < 50 && !seen.length; i++) await new Promise((r) => setTimeout(r, 50));
    events.stop();
    expect(seen[0]).toMatchObject({
      name: "git.commit",
      payload: { repo: dir, branch: "main", message: "Second" },
    });
  });
});
