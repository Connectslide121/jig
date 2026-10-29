import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canWatchTree,
  dueForFetch,
  gitDirChangeMatters,
  pollInterval,
  singleFlight,
  throttleDebounce,
  treeChangeMatters,
  watchedFolderGone,
} from "./watch";

describe("treeChangeMatters", () => {
  it("keeps source changes and leaves out the git folder and node_modules", () => {
    expect(treeChangeMatters("src/app.ts")).toBe(true);
    expect(treeChangeMatters("README.md")).toBe(true);
    expect(treeChangeMatters(".git/index")).toBe(false);
    expect(treeChangeMatters("node_modules/x/index.js")).toBe(false);
    expect(treeChangeMatters("packages\\a\\node_modules\\b.js")).toBe(false);
  });
});

describe("gitDirChangeMatters", () => {
  it("reacts to HEAD, the index and merge state, not objects or locks", () => {
    expect(gitDirChangeMatters("HEAD")).toBe(true);
    expect(gitDirChangeMatters("index")).toBe(true);
    expect(gitDirChangeMatters("MERGE_HEAD")).toBe(true);
    expect(gitDirChangeMatters("index.lock")).toBe(false);
    expect(gitDirChangeMatters("objects")).toBe(false);
  });
});

describe("canWatchTree / pollInterval", () => {
  it("watches trees on Windows and macOS only", () => {
    expect(canWatchTree("win32")).toBe(true);
    expect(canWatchTree("darwin")).toBe(true);
    expect(canWatchTree("linux")).toBe(false);
  });
  it("polls rarely when watching, and less often for big workspaces when not", () => {
    expect(pollInterval(true, 40)).toBe(60_000);
    expect(pollInterval(false, 1)).toBe(5_000);
    expect(pollInterval(false, 12)).toBe(12_000);
    expect(pollInterval(false, 100)).toBe(30_000);
  });
});

describe("throttleDebounce", () => {
  afterEach(() => vi.useRealTimers());
  it("runs once after a burst, and at least every maxMs while it lasts", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleDebounce(fn, 300, 1_000);
    t.call();
    t.call();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    // A steady stream of changes (a build writing files) still refreshes once a second.
    for (let i = 0; i < 12; i++) {
      t.call();
      vi.advanceTimersByTime(100);
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("singleFlight", () => {
  it("runs one at a time and shares one queued run among callers that came meanwhile", async () => {
    let runs = 0;
    const resolvers: Array<(n: number) => void> = [];
    const f = singleFlight(
      () =>
        new Promise<number>((resolve) => {
          runs++;
          resolvers.push(resolve);
        }),
    );
    const a = f();
    const b = f();
    const c = f();
    expect(runs).toBe(1);
    resolvers[0]!(1);
    expect(await a).toBe(1);
    await Promise.resolve();
    expect(runs).toBe(2);
    resolvers[1]!(2);
    expect(await b).toBe(2);
    expect(await c).toBe(2);
    const d = f();
    expect(runs).toBe(3);
    resolvers[2]!(3);
    expect(await d).toBe(3);
  });

  it("runs the queued call even when the running one fails", async () => {
    let n = 0;
    const f = singleFlight(async () => {
      n++;
      if (n === 1) throw new Error("boom");
      return n;
    });
    const a = f();
    const b = f();
    await expect(a).rejects.toThrow("boom");
    expect(await b).toBe(2);
  });
});

describe("dueForFetch", () => {
  it("picks repositories not fetched for a while, never-fetched and oldest first", () => {
    const last = new Map([
      ["a", 1_000],
      ["b", 9_000],
      ["c", 500],
    ]);
    expect(dueForFetch(["a", "b", "c", "d"], last, 5_000, 10_000)).toEqual(["d", "c", "a"]);
  });
});

describe("watchedFolderGone", () => {
  it("tells the watched folder's own path (Windows, when it's deleted) from a change inside it", () => {
    expect(watchedFolderGone(String.raw`\\?\C:\Users\me\repo`)).toBe(true);
    expect(watchedFolderGone(String.raw`C:\Users\me\repo`)).toBe(true);
    expect(watchedFolderGone(String.raw`src\app.ts`)).toBe(false);
    expect(watchedFolderGone(".git/index")).toBe(false);
  });
});
