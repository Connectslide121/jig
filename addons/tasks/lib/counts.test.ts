import { describe, expect, it } from "vitest";
import {
  COUNT_ORDER,
  countTasks,
  progressParts,
  progressText,
  restCounts,
  settledMs,
  sizeText,
} from "./counts";
import type { Task } from "./tasks";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  prompt: id,
  newChat: true,
  status: "queued",
  ...over,
});

/** Jon's queue: 5 done, 1 running, 13 left out, in 15 chats (four tasks continue the chat before). */
const jons = (): Task[] => [
  ...Array.from({ length: 5 }, (_, i) => task(`d${i}`, { status: "done", costUsd: 2, newChat: i !== 1 })),
  task("r", { status: "running", sentAt: "2026-11-05T10:00:00Z" }),
  ...Array.from({ length: 13 }, (_, i) => task(`l${i}`, { leftOut: true, newChat: i % 4 !== 1 })),
];

describe("countTasks", () => {
  it("puts every task in one count, so the counts add up to the total", () => {
    const c = countTasks(jons(), Date.parse("2026-11-05T10:30:00Z"));
    expect(COUNT_ORDER.reduce((n, k) => n + c.by[k], 0)).toBe(c.total);
    expect(c).toMatchObject({
      total: 19,
      willRun: 6,
      chats: 15,
      chatsUpNext: 0,
      costUsd: 10,
      ms: 30 * 60_000,
    });
    expect(c.by).toMatchObject({ done: 5, running: 1, leftOut: 13, upNext: 0 });
  });
  it("leaves skipped and left-out tasks out of what will run, and counts a continued chat once", () => {
    const c = countTasks([
      task("a", { status: "failed" }),
      task("b"),
      task("c", { newChat: false }),
      task("d", { status: "skipped" }),
      task("e", { leftOut: true }),
    ]);
    expect(c).toMatchObject({ total: 5, willRun: 3, chats: 4, chatsUpNext: 1 });
    expect(c.costUsd).toBeUndefined();
  });
});

describe("parked tasks (D-369)", () => {
  it("counts them on their own: not in the total, the chats, what will run or the progress", () => {
    const c = countTasks([
      task("a", { status: "done" }),
      task("b"),
      task("c", { leftOut: true }),
      task("x", { parked: true }),
      task("y", { parked: true }),
    ]);
    expect(c).toMatchObject({ total: 3, willRun: 2, chats: 3, parked: 2 });
    expect(COUNT_ORDER.reduce((n, k) => n + c.by[k], 0)).toBe(c.total);
    expect(progressText(c)).toBe("1 of 2 done");
    expect(countTasks([task("x", { parked: true })])).toMatchObject({ total: 0, parked: 1 });
  });
});

describe("progressText", () => {
  it("reads done of what will run, all done, or why nothing runs", () => {
    expect(progressText(countTasks(jons()))).toBe("5 of 6 done");
    expect(progressText(countTasks([task("a", { status: "done" }), task("b", { leftOut: true })]))).toBe(
      "All 1 done",
    );
    expect(progressText(countTasks([task("a", { leftOut: true })]))).toBe("All left out");
    expect(progressText(countTasks([task("a", { status: "skipped" })]))).toBe("All skipped");
    expect(progressText(countTasks([task("a", { status: "skipped" }), task("b", { leftOut: true })]))).toBe(
      "None will run",
    );
    expect(progressText(countTasks([]))).toBe("None will run");
  });
});

describe("restCounts", () => {
  it("lists the non-zero counts after the lead, in order, without done and up next", () => {
    const c = countTasks([...jons(), task("f", { status: "failed" }), task("u")]);
    expect(restCounts(c)).toEqual([
      { key: "failed", n: 1 },
      { key: "running", n: 1 },
      { key: "leftOut", n: 13 },
    ]);
    expect(restCounts(countTasks([task("a", { leftOut: true })]))).toEqual([]);
  });
});

describe("sizeText and progressParts", () => {
  it("says tasks in chats, and draws done, the rest that ran, then running, over what will run", () => {
    const c = countTasks([
      task("a", { status: "done" }),
      task("b", { status: "running" }),
      task("c"),
      task("d"),
    ]);
    expect(sizeText(c)).toBe("4 tasks in 4 chats");
    expect(sizeText(countTasks([task("a")]))).toBe("1 task in 1 chat");
    expect(progressParts(c)).toEqual([
      { key: "done", share: 0.25 },
      { key: "running", share: 0.25 },
    ]);
    expect(progressParts(countTasks([task("a", { leftOut: true })]))).toEqual([]);
  });
});

describe("settledMs", () => {
  it("adds the times of the tasks that aren't running", () => {
    const t = { sentAt: "2026-11-05T10:00:00Z", finishedAt: "2026-11-05T10:10:00Z" };
    expect(settledMs([task("a", { status: "done", ...t }), task("b", { status: "running", ...t })])).toBe(
      10 * 60_000,
    );
  });
});
