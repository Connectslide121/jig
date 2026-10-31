import { describe, expect, it } from "vitest";
import {
  addTasks,
  type ChatState,
  chatFinished,
  chatGroups,
  chatToContinue,
  counts,
  duration,
  emptyQueue,
  finishTask,
  listing,
  moveTask,
  nextTask,
  parseNewTasks,
  parsePrompts,
  parseReport,
  type Queue,
  requeue,
  shouldPause,
  type Task,
  tally,
  taskContext,
  titleFor,
  titleOf,
  unusedFiles,
} from "./tasks";

const chat = (over: Partial<ChatState> = {}): ChatState => ({
  id: "s1",
  title: "Fix the login",
  status: "idle",
  costUsd: 0.5,
  ...over,
});

const queued = (prompts: string[], newChat = true, projectId = "p1"): Queue =>
  addTasks(emptyQueue(), prompts, { projectId, newChat });

describe("titleOf", () => {
  it("takes the first line and cuts long ones at a word", () => {
    expect(titleOf("Fix the login\nmore detail")).toBe("Fix the login");
    const long = "Update the checkout page so that every price shows the currency and the tax included";
    const title = titleOf(long, 40);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(41);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });
});

describe("parsePrompts", () => {
  it("keeps the whole text as one task", () => {
    expect(parsePrompts("  one\ntwo  ", false)).toEqual(["one\ntwo"]);
    expect(parsePrompts("   ", false)).toEqual([]);
  });
  it("splits lines and drops list marks and empty lines", () => {
    expect(parsePrompts("- one\n\n2. two\n* three\n[ ] four\nfive", true)).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
    ]);
  });
});

describe("addTasks", () => {
  it("numbers tasks and takes titles", () => {
    const q = addTasks(queued(["a"]), ["b", { prompt: "c long", title: "C" }, { prompt: "  " }], {
      newChat: false,
      addedBy: "s9",
    });
    expect(q.tasks.map((t) => [t.id, t.title, t.newChat])).toEqual([
      ["t1", "a", true],
      ["t2", "b", false],
      ["t3", "C", false],
    ]);
    expect(q.tasks[1]!.addedBy).toBe("s9");
    expect(q.seq).toBe(3);
  });
});

describe("nextTask", () => {
  it("is the first queued task, none while one runs", () => {
    const q = queued(["a", "b"]);
    expect(nextTask(q)?.id).toBe("t1");
    q.tasks[0]!.status = "running";
    expect(nextTask(q)).toBeUndefined();
    q.tasks[0]!.status = "done";
    expect(nextTask(q)?.id).toBe("t2");
  });
});

describe("chatToContinue", () => {
  it("continues the closest earlier task's chat in the same project", () => {
    const q = addTasks(queued(["a", "b"]), ["c"], { projectId: "p1", newChat: false });
    q.tasks[0]!.sessionId = "s1";
    expect(chatToContinue(q, q.tasks[2]!)).toBe("s1"); // t2 was skipped: the one before it
    q.tasks[1]!.sessionId = "s2";
    expect(chatToContinue(q, q.tasks[2]!)).toBe("s2");
    expect(chatToContinue(q, q.tasks[1]!)).toBeUndefined(); // starts its own
  });
  it("starts a new chat when the earlier task was in another project", () => {
    const q = addTasks(queued(["a"], true, "p1"), ["b"], { projectId: "p2", newChat: false });
    q.tasks[0]!.sessionId = "s1";
    expect(chatToContinue(q, q.tasks[1]!)).toBeUndefined();
  });
  it("is a new chat for the first task", () => {
    const q = queued(["a"], false);
    expect(chatToContinue(q, q.tasks[0]!)).toBeUndefined();
  });
});

describe("chatFinished", () => {
  const task: Task = {
    id: "t1",
    title: "a",
    prompt: "a",
    newChat: true,
    status: "running",
    sentAt: "2025-01-01T10:00:00Z",
  };
  it("waits while the chat works", () => {
    expect(chatFinished({ ...task, sawBusy: true }, chat({ status: "working" }))).toBe(false);
    expect(chatFinished({ ...task, sawBusy: true }, chat({ status: "needs_you" }))).toBe(false);
  });
  it("is finished when idle after working, or after an answer since it was sent", () => {
    expect(chatFinished({ ...task, sawBusy: true }, chat())).toBe(true);
    expect(chatFinished(task, chat())).toBe(false);
    expect(chatFinished(task, chat({ lastAnswerAt: "2025-01-01T09:00:00Z" }))).toBe(false);
    expect(chatFinished(task, chat({ lastAnswerAt: "2025-01-01T10:01:00Z" }))).toBe(true);
    expect(chatFinished(task, chat({ status: "error" }))).toBe(true);
  });
});

describe("finishTask", () => {
  const task: Task = {
    id: "t1",
    title: "a",
    prompt: "a",
    newChat: true,
    status: "running",
    costAtStart: 0.2,
  };
  it("takes the status from the report", () => {
    const report = parseReport({ outcome: "partial", summary: "half" });
    const done = finishTask({ ...task, report }, chat(), "2025-01-01T11:00:00Z");
    expect(done.status).toBe("partial");
    expect(done.costUsd).toBeCloseTo(0.3);
    expect(done.chatTitle).toBe("Fix the login");
    expect(done.answer).toBeUndefined();
  });
  it("keeps the last answer without a report, and the error of a failed chat", () => {
    expect(finishTask(task, chat({ lastAnswer: "I did it" }))).toMatchObject({
      status: "no_report",
      answer: "I did it",
    });
    expect(finishTask(task, chat({ status: "error", error: "boom" }))).toMatchObject({
      status: "error",
      error: "boom",
    });
  });
});

describe("shouldPause", () => {
  it("pauses after a failure when asked", () => {
    const q = emptyQueue();
    const t = (status: Task["status"]): Task => ({ id: "t", title: "", prompt: "", newChat: true, status });
    expect(shouldPause(q, t("failed"))).toBe(true);
    expect(shouldPause(q, t("blocked"))).toBe(true);
    expect(shouldPause(q, t("error"))).toBe(true);
    expect(shouldPause(q, t("partial"))).toBe(false);
    expect(shouldPause({ ...q, stopOnFailure: false }, t("failed"))).toBe(false);
  });
});

describe("parseReport", () => {
  it("checks the outcome and summary and cleans the lists", () => {
    expect(
      parseReport({ outcome: "done", summary: " ok ", notes: ["a", " ", 3], followUps: "next" }),
    ).toEqual({
      outcome: "done",
      summary: "ok",
      notes: ["a", "3"],
      followUps: ["next"],
    });
    expect(() => parseReport({ outcome: "great", summary: "x" })).toThrow(/outcome/);
    expect(() => parseReport({ outcome: "done", summary: "" })).toThrow(/summary/);
  });
});

describe("parseNewTasks", () => {
  it("takes strings and objects", () => {
    expect(
      parseNewTasks(["a", { prompt: "b", title: "B", newChat: false }, { title: "no prompt" }, 4]),
    ).toEqual([{ prompt: "a" }, { prompt: "b", title: "B", newChat: false }]);
  });
  it("needs at least one and at most 50", () => {
    expect(() => parseNewTasks([])).toThrow();
    expect(() => parseNewTasks("a")).toThrow();
    expect(() => parseNewTasks(Array.from({ length: 51 }, (_, i) => `t${i}`))).toThrow(/50/);
  });
});

describe("moveTask and requeue", () => {
  it("moves within bounds", () => {
    const q = queued(["a", "b"]);
    expect(moveTask(q, "t2", -1).tasks.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(moveTask(q, "t1", -1)).toBe(q);
  });
  it("queues a copy in a new chat", () => {
    const q = queued(["a"], false);
    q.tasks[0]!.status = "failed";
    const next = requeue(q, "t1");
    expect(next.tasks[1]).toMatchObject({ id: "t2", prompt: "a", status: "queued", newChat: true });
  });
});

describe("taskContext, counts, duration, listing", () => {
  it("tells only the chat running a task", () => {
    const q = queued(["a", "b"]);
    q.tasks[0] = { ...q.tasks[0]!, status: "running", sessionId: "s1" };
    expect(taskContext(q, "s1")).toContain("task 1 of 2");
    expect(taskContext(q, "s1")).toContain("addon_tasks_report");
    expect(taskContext(q, "s2")).toBe("");
    q.tasks[0]!.status = "done";
    expect(taskContext(q, "s1")).toBe("");
  });
  it("counts and times", () => {
    const q = queued(["a", "b"]);
    q.tasks[0]!.status = "done";
    expect(counts(q)).toEqual({ queued: 1, finished: 1, total: 2 });
    const t = { ...q.tasks[0]!, sentAt: "2025-01-01T10:00:00Z", finishedAt: "2025-01-01T10:00:42Z" };
    expect(duration(t)).toBe("42s");
    expect(duration({ ...t, finishedAt: "2025-01-01T11:05:00Z" })).toBe("1h 5m");
    expect(duration(q.tasks[1]!)).toBe("");
  });
  it("lists the queue for Claude", () => {
    expect(listing(emptyQueue())).toMatch(/empty/);
    const q = queued(["a"]);
    expect(listing(q)).toContain("1. [Queued] a (id t1)");
  });
});

describe("chatGroups and tally", () => {
  it("groups tasks by the chat they run in", () => {
    let q = addTasks(
      emptyQueue(),
      [
        { prompt: "a", newChat: true },
        { prompt: "b", newChat: false },
        { prompt: "c", newChat: true },
      ],
      { projectId: "p1", newChat: true },
    );
    q = addTasks(q, [{ prompt: "d", newChat: false }], { projectId: "p2", newChat: false });
    q.tasks[1] = { ...q.tasks[1]!, sessionId: "s1", chatTitle: "Fix a" };
    const groups = chatGroups(q);
    expect(groups.map((g) => g.tasks.map((t) => t.task.prompt))).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(groups[0]).toMatchObject({ sessionId: "s1", chatTitle: "Fix a", projectId: "p1" });
    expect(groups[2]!.tasks[0]!.index).toBe(3);
  });
  it("sums statuses, time and cost", () => {
    const q = queued(["a", "b", "c"]);
    q.tasks[0] = {
      ...q.tasks[0]!,
      status: "done",
      sentAt: "2025-01-01T10:00:00Z",
      finishedAt: "2025-01-01T10:01:00Z",
      costUsd: 0.25,
    };
    q.tasks[1] = { ...q.tasks[1]!, status: "failed", costUsd: 0.5 };
    expect(tally(q.tasks)).toEqual({
      byStatus: { done: 1, failed: 1, queued: 1 },
      finished: 2,
      ms: 60_000,
      costUsd: 0.75,
    });
  });
  it("has no cost until a task has one, and keeps a cost of zero", () => {
    const q = queued(["a", "b"]);
    expect(tally(q.tasks).costUsd).toBeUndefined();
    q.tasks[0] = { ...q.tasks[0]!, status: "done", costUsd: 0 };
    expect(tally(q.tasks).costUsd).toBe(0);
  });

  it("keeps a task's files, runs them again, and tells which files no task uses any more", () => {
    const shot = { path: "/att/a.png", mime: "image/png", name: "checkout.png", kind: "image" as const };
    const spec = { path: "/att/b.pdf", mime: "application/pdf", name: "spec.pdf", kind: "pdf" as const };
    let q = addTasks(
      emptyQueue(),
      [
        { prompt: "Fix it", attachments: [shot] },
        { prompt: " ", attachments: [spec] },
      ],
      {
        newChat: true,
      },
    );
    expect(q.tasks.map((t) => [t.title, t.attachments?.length])).toEqual([
      ["Fix it", 1],
      ["spec.pdf", 1],
    ]);
    expect(addTasks(emptyQueue(), [{ prompt: " ", attachments: [] }], { newChat: true }).tasks).toEqual([]);
    expect(titleFor("", [])).toBe("Untitled task");
    q = requeue(q, q.tasks[0]!.id);
    expect(q.tasks[2]!.attachments).toEqual([shot]);
    const without = {
      ...q,
      tasks: q.tasks.filter((t) => t.id !== q.tasks[0]!.id && t.id !== q.tasks[1]!.id),
    };
    expect(unusedFiles(q, without)).toEqual([spec.path]);
    expect(unusedFiles(q, without, [spec.path])).toEqual([]);
    expect(unusedFiles(q, q)).toEqual([]);
  });
});
