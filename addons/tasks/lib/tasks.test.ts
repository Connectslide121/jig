import { describe, expect, it } from "vitest";
import {
  addTasks,
  type ChatState,
  chatFinished,
  chatGroups,
  chatToContinue,
  closeRun,
  counts,
  duration,
  editTasks,
  emptyQueue,
  finishTask,
  historyFiles,
  joinQueues,
  listing,
  moveTask,
  nextTask,
  openRun,
  parseNewTasks,
  parsePrompts,
  parseReport,
  parseTaskEdits,
  type Queue,
  type Run,
  recordRuns,
  requeue,
  resetTask,
  resetTasks,
  runOutcome,
  setLeftOut,
  shouldPause,
  splitQueue,
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
  it("passes tasks that are left out by, and takes them again once ticked", () => {
    let q = setLeftOut(queued(["a", "b", "c"]), false, ["t1"]);
    expect(nextTask(q)?.id).toBe("t1");
    q = setLeftOut(q, true, ["t1", "t2"]);
    expect(nextTask(q)?.id).toBe("t3");
    expect(counts(q)).toMatchObject({ queued: 3, ready: 1 });
    q = setLeftOut(q, false);
    expect(nextTask(q)?.id).toBe("t1");
    expect(q.tasks.every((t) => !("leftOut" in t))).toBe(true);
  });
  it("only ticks or unticks queued tasks", () => {
    const q = queued(["a", "b"]);
    q.tasks[0]!.status = "done";
    expect(setLeftOut(q, true).tasks.map((t) => !!t.leftOut)).toEqual([false, true]);
  });
});

describe("resetTask and resetTasks", () => {
  const ran = (q: Queue): Queue => ({
    ...q,
    running: true,
    runId: "r1",
    tasks: q.tasks.map((t, i) =>
      i === 0
        ? {
            ...t,
            status: "no_report",
            sessionId: "s1",
            chatTitle: "A chat",
            sentAt: "2025-01-01T10:00:00Z",
            finishedAt: "2025-01-01T10:01:00Z",
            costAtStart: 0,
            costUsd: 0.2,
            sawBusy: true,
            answer: "Half way",
            runId: "r1",
          }
        : t,
    ),
  });
  it("puts a task back as if it never ran, keeping what it is", () => {
    const task = ran(queued(["a"])).tasks[0]!;
    expect(resetTask({ ...task, leftOut: true })).toEqual({
      id: "t1",
      title: "a",
      prompt: "a",
      projectId: "p1",
      newChat: true,
      permissionMode: undefined,
      status: "queued",
      leftOut: true,
    });
  });
  it("resets chosen tasks in place and keeps the run open", () => {
    const q = resetTasks(ran(queued(["a", "b"])), ["t1"]);
    expect(q.tasks.map((t) => t.status)).toEqual(["queued", "queued"]);
    expect(q.running).toBe(true);
    expect(q.runId).toBe("r1");
  });
  it("starts the whole queue over: paused, the run closed", () => {
    const q = resetTasks(ran(queued(["a", "b"])));
    expect(q.tasks.every((t) => t.status === "queued" && !t.sessionId)).toBe(true);
    expect(q.running).toBe(false);
    expect(q.runId).toBeUndefined();
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
  it("edits queued tasks only, leaving the queue's state alone", () => {
    const q = { ...queued(["a", "b", "c"]), running: true };
    q.tasks[0] = { ...q.tasks[0]!, status: "running", sessionId: "s1" };
    const [, b, c] = q.tasks;
    const next = editTasks(
      q,
      parseTaskEdits([
        { id: b!.id, append: "Don't run e2e tests." },
        { id: c!.id, title: "New title", prompt: "new prompt", leftOut: true },
      ]),
    );
    expect(next.running).toBe(true);
    expect(next.tasks[0]).toBe(q.tasks[0]);
    expect(next.tasks[1]!.prompt).toBe(`${b!.prompt}\n\nDon't run e2e tests.`);
    expect(next.tasks[2]).toMatchObject({ title: "New title", prompt: "new prompt", leftOut: true });
    expect(editTasks(next, [{ id: c!.id, leftOut: false }]).tasks[2]!.leftOut).toBeUndefined();
    // A running task, or one that isn't there: nothing changes.
    expect(() =>
      editTasks(q, [
        { id: b!.id, append: "x" },
        { id: q.tasks[0]!.id, append: "x" },
      ]),
    ).toThrow(/only queued tasks/);
    expect(() => editTasks(q, [{ id: "nope", append: "x" }])).toThrow(/no task nope/);
    expect(() => parseTaskEdits([{ id: b!.id }])).toThrow(/what to change/);
    expect(() => parseTaskEdits([])).toThrow(/at least one/);
  });
  it("names the tasks still queued, so the chat doesn't suggest them as follow-ups", () => {
    const q = queued(["a", "b", "c", "d"]);
    q.tasks[0] = { ...q.tasks[0]!, status: "done" };
    q.tasks[1] = { ...q.tasks[1]!, status: "running", sessionId: "s1" };
    q.tasks[3] = { ...q.tasks[3]!, leftOut: true };
    const text = taskContext(q, "s1");
    expect(text).toContain("never suggest these");
    expect(text).toContain(`- ${q.tasks[2]!.title}\n`);
    expect(text).toContain(`- ${q.tasks[3]!.title} (left out of this run)`);
    expect(text).not.toContain(`- ${q.tasks[0]!.title}`);
    const last = queued(["a"]);
    last.tasks[0] = { ...last.tasks[0]!, status: "running", sessionId: "s1" };
    expect(taskContext(last, "s1")).not.toContain("Already queued");
  });
  it("counts and times", () => {
    const q = queued(["a", "b"]);
    q.tasks[0]!.status = "done";
    expect(counts(q)).toEqual({ queued: 1, ready: 1, finished: 1, total: 2 });
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

describe("run history", () => {
  const start = (q: Queue, at = new Date("2026-11-02T10:00:00Z")) => openRun({ ...q, running: true }, at);
  const ran = (q: Queue, id: string, status: Task["status"], sentAt = "2026-11-02T10:01:00Z"): Queue => ({
    ...q,
    tasks: q.tasks.map((t) => (t.id === id ? { ...t, status, sentAt, runId: q.runId } : t)),
  });

  it("opens one run until the queue finishes, and keeps it open while paused", () => {
    const q = start(queued(["a"]));
    expect(q.runId).toMatch(/^r/);
    expect(openRun(q).runId).toBe(q.runId);
    expect(closeRun(q).runId).toBeUndefined();
    expect(closeRun(queued(["a"]))).toEqual(queued(["a"]));
  });

  it("records the tasks of the open run as they change, newest run first", () => {
    const before = start(queued(["a", "b"]));
    const one = ran(before, "t1", "running");
    let history = recordRuns([], before, one, "2026-11-02T10:02:00Z");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: before.runId, startedAt: "2026-11-02T10:01:00Z" });
    expect(history[0]!.finishedAt).toBeUndefined();
    expect(history[0]!.tasks.map((t) => t.id)).toEqual(["t1"]);
    // Nothing changed: the same array.
    expect(recordRuns(history, one, one)).toBe(history);
    const two = ran(ran(one, "t1", "done"), "t2", "failed");
    history = recordRuns(history, one, two);
    expect(history[0]!.tasks.map((t) => t.status)).toEqual(["done", "failed"]);
    // Finished: closed at that time; cleared tasks stay in the run.
    const finished = closeRun({ ...two, running: false });
    history = recordRuns(history, two, finished, "2026-11-02T10:09:00Z");
    expect(history[0]!.finishedAt).toBe("2026-11-02T10:09:00Z");
    const cleared = { ...finished, tasks: [] };
    expect(recordRuns(history, finished, cleared)).toBe(history);
    // A new run goes first.
    const again = start(addTasks(cleared, ["c"], { projectId: "p1", newChat: true }), new Date("2026-11-03"));
    const next = recordRuns(history, cleared, ran(again, "t3", "running", "2026-11-03T08:00:00Z"));
    expect(next.map((r) => r.id)).toEqual([again.runId, before.runId]);
    expect(runOutcome(next[1]!)).toEqual({ done: 1, failed: 1, total: 2 });
  });

  it("skips runs with no tasks, keeps at most 200 and lists the files they use", () => {
    const q = start(queued(["a"]));
    expect(recordRuns([], q, q)).toEqual([]);
    const many: Run[] = Array.from({ length: 200 }, (_, i) => ({ id: `old${i}`, startedAt: "x", tasks: [] }));
    const withFile = {
      ...q,
      tasks: [{ ...q.tasks[0]!, runId: q.runId, attachments: [{ path: "/f/a.png", mime: "image/png" }] }],
    };
    const history = recordRuns(many, q, withFile);
    expect(history).toHaveLength(200);
    expect(history[0]!.id).toBe(q.runId);
    expect(historyFiles(history)).toEqual(["/f/a.png"]);
  });
});

describe("per-project queues", () => {
  it("splits the old single queue by project, tasks without one going to the fallback", () => {
    const q: Queue = {
      ...addTasks(queued(["a"], true, "p1"), ["b"], { projectId: "p2", newChat: true }),
      stopOnFailure: false,
      running: true,
    };
    q.tasks.push({ ...q.tasks[0]!, id: "t9", projectId: undefined });
    const split = splitQueue(q, "p1");
    expect(Object.keys(split)).toEqual(["p1", "p2"]);
    expect(split.p1!.tasks.map((t) => t.id)).toEqual(["t1", "t9"]);
    expect(split.p1!.tasks[1]!.projectId).toBe("p1");
    expect(split.p2).toMatchObject({ running: false, stopOnFailure: false, seq: q.seq });
  });

  it("joins a migrated queue after a project's own tasks, renumbering it", () => {
    const own = queued(["a"]);
    const from = queued(["b", "c"]);
    from.tasks[1] = { ...from.tasks[1]!, from: "t1" };
    expect(joinQueues(emptyQueue(), from)).toEqual(from);
    const joined = joinQueues(own, from);
    expect(joined.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(joined.tasks[2]!.from).toBe("t2");
    expect(joined.seq).toBe(3);
  });
});
