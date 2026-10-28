import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canWatchTree,
  gitDirChangeMatters,
  pollInterval,
  throttleDebounce,
  treeChangeMatters,
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
