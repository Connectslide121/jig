import { describe, expect, it } from "vitest";
import {
  addTasks,
  afterTurn,
  applyReport,
  BACKGROUND_WAIT_MS,
  CHATGPT_SIGNED_OUT,
  type ChatState,
  canReportLate,
  chatFinished,
  chatGroups,
  chatToContinue,
  checkProviderChoices,
  closeRun,
  compactListing,
  continuesChat,
  counts,
  currentSlot,
  dropSlots,
  duration,
  editTasks,
  emptyQueue,
  finishTask,
  historyFiles,
  interruptedTurn,
  joinQueues,
  limitedTask,
  listing,
  moveTasks,
  nextTask,
  nudgeFrom,
  nudgeText,
  openRun,
  parseNewTasks,
  parsePrompts,
  parseQueueProvider,
  parseReport,
  parseTaskEdits,
  pendingReportsNote,
  providerOfModel,
  type Queue,
  type Run,
  recordRuns,
  reportTarget,
  requeue,
  resetTask,
  resetTasks,
  runOutcome,
  runsOn,
  setLeftOut,
  setProviderChoice,
  shouldPause,
  splitQueue,
  startFailed,
  stepTasks,
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
  it("isn't finished while its plan's limit holds it (D-338)", () => {
    const limit = { provider: "claude" as const, state: "ask" as const };
    expect(chatFinished({ ...task, sawBusy: true }, chat({ status: "error", limit }))).toBe(false);
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
  it("records the provider that finished it after a limit handoff (D-338)", () => {
    const ran: Task = { ...task, ranOn: "claude", ranModel: "opus" };
    expect(finishTask(ran, chat({ provider: "chatgpt", model: "sol" }))).toMatchObject({
      ranOn: "chatgpt",
      ranModel: "sol",
      startedOn: "claude",
    });
    expect(finishTask(ran, chat({ provider: "claude" })).startedOn).toBeUndefined();
  });
});

describe("limitedTask (D-338)", () => {
  const task: Task = { id: "t1", title: "a", prompt: "a", newChat: true, status: "running" };
  it("needs you when the limit card asks, and keeps running while it waits or carries on", () => {
    expect(limitedTask(task, { provider: "claude", state: "ask" })).toMatchObject({
      status: "needs_you",
      waitingFor: "limit",
    });
    expect(
      limitedTask({ ...task, waitingFor: "limit" }, { provider: "claude", state: "waiting", resetsAt: "T" }),
    ).toEqual({ ...task, status: "running", sawBusy: true, limitResetsAt: "T" });
    expect(limitedTask(task, { provider: "chatgpt", state: "continuing" })).toEqual({
      ...task,
      status: "running",
      sawBusy: true,
    });
  });
});

describe("ending a task's turn (D-318)", () => {
  const sentAt = "2025-01-01T10:00:00Z";
  const answeredAt = "2025-01-01T10:05:00Z";
  const task: Task = { id: "t1", title: "a", prompt: "a", newChat: true, status: "running", sentAt };
  const at = (iso: string) => Date.parse(iso);
  it("waits while work still runs in the background, up to a limit", () => {
    const busy = chat({ lastAnswerAt: answeredAt, background: 1 });
    expect(chatFinished({ ...task, sawBusy: true }, busy, at("2025-01-01T10:06:00Z"))).toBe(false);
    expect(afterTurn(task, busy, at("2025-01-01T10:06:00Z"))).toBe("wait");
    const later = at(answeredAt) + BACKGROUND_WAIT_MS;
    expect(chatFinished(task, busy, later)).toBe(true);
    // Once asked for the report, background work no longer holds the task open.
    const asked = { ...task, nudgedAt: "2025-01-01T10:30:00Z" };
    expect(chatFinished(asked, chat({ lastAnswerAt: "2025-01-01T10:31:00Z", background: 1 }))).toBe(true);
  });
  it("asks once for the report, then finishes without one", () => {
    const idle = chat({ lastAnswerAt: answeredAt });
    expect(afterTurn(task, idle)).toBe("nudge");
    const asked = { ...task, nudgedAt: "2025-01-01T10:06:00Z" };
    // The turn the question started hasn't answered yet: still waiting for it.
    expect(afterTurn(asked, idle)).toBe("wait");
    expect(afterTurn(asked, chat({ lastAnswerAt: "2025-01-01T10:07:00Z" }))).toBe("finish");
    expect(finishTask(asked, chat({ lastAnswer: "Still waiting" })).status).toBe("no_report");
  });
  it("finishes at once with a report, a failed chat, or when you stopped the turn", () => {
    const report = parseReport({ outcome: "done", summary: "ok" });
    expect(afterTurn({ ...task, report }, chat({ lastAnswerAt: answeredAt }))).toBe("finish");
    expect(afterTurn(task, chat({ status: "error" }))).toBe("finish");
    expect(afterTurn(task, chat({ lastAnswerAt: answeredAt, userStoppedAt: "2025-01-01T10:04:00Z" }))).toBe(
      "finish",
    );
    // A stop before the task was sent is not about this task.
    expect(afterTurn(task, chat({ lastAnswerAt: answeredAt, userStoppedAt: "2025-01-01T09:00:00Z" }))).toBe(
      "nudge",
    );
  });
  it("tells a turn Jig interrupted from one still waiting on the background", () => {
    expect(interruptedTurn(task, chat())).toBe(true);
    expect(interruptedTurn(task, chat({ background: 1 }))).toBe(false);
    expect(interruptedTurn(task, chat({ lastAnswerAt: answeredAt }))).toBe(false);
  });
  it("asks only for the report, by task number and id", () => {
    const q = pic("Ab");
    const text = nudgeText(q, q.tasks[1]!);
    expect(text).toContain('report of task 2 ("b", taskId "b")');
    expect(text).toContain("Don't continue the task's work unless the user asks");
    expect(nudgeFrom(q, q.tasks[1]!)).toBe("Task queue: asked for the report of task 2");
  });
});

describe("late reports (D-318)", () => {
  const report = (outcome: string) => parseReport({ outcome, summary: `it was ${outcome}` });
  /** a, b and c ran in chat s1 (c still running), d in s2. */
  const ran = (over: Partial<Record<string, Partial<Task>>> = {}): Queue => {
    const q = pic("Abc D");
    const base: Record<string, Partial<Task>> = {
      a: { status: "no_report", sessionId: "s1", finishedAt: "2025-01-01T10:10:00Z", costUsd: 0.4 },
      b: { status: "done", sessionId: "s1", report: report("done") },
      c: { status: "running", sessionId: "s1" },
      d: { status: "no_report", sessionId: "s2" },
    };
    return {
      ...q,
      running: true,
      tasks: q.tasks.map((t) => ({ ...t, ...base[t.id], ...over[t.id] }) as Task),
    };
  };
  it("goes to the running task, or with a taskId to one of this chat's tasks without a report", () => {
    expect(reportTarget(ran(), "s1").id).toBe("c");
    expect(reportTarget(ran(), "s1", "a").id).toBe("a");
    expect(() => reportTarget(ran(), "s1", "d")).toThrow(/didn't run in this chat/);
    expect(() => reportTarget(ran(), "s1", "b")).toThrow(/done/);
    expect(() => reportTarget(ran(), "s1", "x")).toThrow(/no task x/);
  });
  it("never lands on a newer task when an earlier one of the chat is missing its report", () => {
    const q = ran({ c: { report: report("done") } });
    expect(reportTarget(q, "s1").id).toBe("a");
  });
  it("goes to the most recent task without a report once nothing runs", () => {
    const q = ran({ b: { status: "no_report", report: undefined }, c: { status: "done" } });
    expect(reportTarget(q, "s1").id).toBe("b");
    expect(() => reportTarget(pic("A"), "s1")).toThrow(/nothing to report/);
  });
  it("may report a task Jig interrupted", () => {
    const q = ran({ a: { status: "error", interrupted: true, error: "Interrupted: Jig closed" } });
    expect(canReportLate(q.tasks[0]!)).toBe(true);
    expect(canReportLate({ ...q.tasks[0]!, interrupted: undefined, error: "boom" })).toBe(false);
    const { queue } = applyReport(q, q.tasks[0]!, report("done"));
    expect(queue.tasks[0]).toMatchObject({ status: "done", reportedLate: true });
    expect(queue.tasks[0]!.error).toBeUndefined();
  });
  it("sets the status from the outcome and keeps the time and cost", () => {
    const q = ran();
    const { queue, late } = applyReport(q, q.tasks[0]!, report("partial"));
    expect(late).toBe(true);
    expect(queue.tasks[0]).toMatchObject({
      status: "partial",
      reportedLate: true,
      finishedAt: "2025-01-01T10:10:00Z",
      costUsd: 0.4,
    });
    const onTime = applyReport(q, q.tasks[2]!, report("done"));
    expect(onTime.late).toBe(false);
    expect(onTime.queue.tasks[2]!.status).toBe("running");
  });
  it("pauses on a late failure unless the chat went on with a later task", () => {
    // d's chat (s2) went on with nothing after it: a failed late report pauses the queue.
    const q = ran();
    const failed = applyReport(q, q.tasks[3]!, report("failed"));
    expect(failed.pause).toBe(true);
    expect(failed.queue.running).toBe(false);
    // a's chat went on with b and c: no pause.
    expect(applyReport(q, q.tasks[0]!, report("blocked")).pause).toBe(false);
    expect(applyReport({ ...q, stopOnFailure: false }, q.tasks[3]!, report("failed")).pause).toBe(false);
    expect(applyReport({ ...q, running: false }, q.tasks[3]!, report("failed")).pause).toBe(false);
  });
  it("names the chat's tasks missing a report before a new one and in its context", () => {
    const q = ran();
    expect(pendingReportsNote(q, "s1")).toBe(
      'Before this task: task 1 "A" (taskId "a") in this chat has no report yet. Report it first with addon_tasks_report and its taskId, then do this task.',
    );
    expect(pendingReportsNote(q, "s3")).toBe("");
    const context = taskContext(q, "s1");
    expect(context).toContain('task 3 of 4 in the user\'s task queue: "c" (taskId "c")');
    expect(context).toContain('- task 1 "A" (taskId "a")');
    expect(context).toContain("never change the task queue's data with jig_set_addon_data");
  });
  it("updates a closed run in the history too", () => {
    const before = ran({ a: { runId: "r1" } });
    const history: Run[] = [{ id: "r1", startedAt: "x", finishedAt: "y", tasks: [before.tasks[0]!] }];
    const { queue } = applyReport(before, before.tasks[0]!, report("done"));
    const next = recordRuns(history, before, queue);
    expect(next[0]!.tasks[0]).toMatchObject({ status: "done", reportedLate: true });
    expect(next[0]!.finishedAt).toBe("y");
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

/**
 * A queue from a picture: each letter a task with that id, upper case starting a chat, lower case
 * continuing it; `done` lists tasks that already ran.
 */
const pic = (spec: string, done = ""): Queue => ({
  ...emptyQueue(),
  tasks: [...spec.replace(/\s/g, "")].map((c) => ({
    id: c.toLowerCase(),
    title: c,
    prompt: c,
    projectId: "p1",
    newChat: c !== c.toLowerCase(),
    status: done.includes(c.toLowerCase()) ? "done" : "queued",
  })),
});
/** The queue back as a picture. */
const draw = (q: Queue) => q.tasks.map((t) => (t.newChat ? t.id.toUpperCase() : t.id)).join("");

describe("moving tasks (D-307)", () => {
  it("moves a task into another chat or into a chat of its own", () => {
    const q = pic("Ab Cd");
    expect(draw(moveTasks(q, ["c"], { before: "b", join: true }))).toBe("AcbD");
    expect(draw(moveTasks(q, ["d"], { before: "a", join: false }))).toBe("DAbC");
    expect(draw(moveTasks(q, ["b"], { join: true }))).toBe("ACdb");
    expect(draw(moveTasks(q, ["b"], { join: false }))).toBe("ACdB");
  });
  it("hands a chat to its next task when its first one moves away", () => {
    expect(draw(moveTasks(pic("Abc D"), ["a"], { join: false }))).toBe("BcDA");
    expect(draw(moveTasks(pic("Abc D"), ["b"], { join: false }))).toBe("AcDB");
  });
  it("moves a whole chat only between chats", () => {
    const q = pic("Ab Cd E");
    expect(draw(moveTasks(q, ["c", "d"], { before: "a", join: false }))).toBe("CdAbE");
    expect(dropSlots(q, ["c", "d"]).every((s) => !s.join)).toBe(true);
    expect(() => moveTasks(q, ["c", "d"], { before: "b", join: true })).toThrow();
  });
  it("never moves above or into tasks that ran, and only queued tasks move", () => {
    const q = pic("Ab Cd", "ab");
    expect(dropSlots(q, ["d"])[0]).toEqual({ before: "c", join: true });
    expect(() => moveTasks(q, ["c"], { before: "a", join: false })).toThrow(/queued/);
    expect(() => moveTasks(q, ["a"], { join: false })).toThrow(/Only queued/);
    // Joining the chat that ran, at its end, is fine.
    expect(draw(moveTasks(q, ["d"], { before: "c", join: true }))).toBe("AbdC");
  });
  it("tells where tasks are now", () => {
    const q = pic("Ab Cd");
    expect(currentSlot(q, ["b"])).toEqual({ before: "c", join: true });
    expect(currentSlot(q, ["c", "d"])).toEqual({ before: undefined, join: false });
    expect(currentSlot(q, ["a"])).toEqual({ before: "b", join: false });
  });
  it("steps through the same slots with the keyboard and the menu", () => {
    const q = pic("Ab Cd");
    expect(draw(stepTasks(q, ["c"], -1))).toBe("AbcD");
    expect(draw(stepTasks(stepTasks(q, ["c"], -1), ["c"], -1))).toBe("AcbD");
    expect(draw(stepTasks(q, ["b"], 1))).toBe("ABCd");
    expect(draw(stepTasks(q, ["c", "d"], -1))).toBe("CdAb");
    expect(draw(stepTasks(q, ["d"], "top"))).toBe("DAbC");
    expect(draw(stepTasks(q, ["a"], "bottom"))).toBe("BCdA");
    expect(stepTasks(q, ["a"], -1)).toBe(q);
    expect(stepTasks(q, ["c", "d"], 1)).toBe(q);
  });
});

describe("Claude's moves and chats (addon_tasks_edit)", () => {
  const edit = (q: Queue, ...edits: unknown[]) => editTasks(q, parseTaskEdits(edits));
  it("sets whether a queued task continues the chat before it", () => {
    expect(draw(edit(pic("Ab Cd"), { id: "c", newChat: false }))).toBe("Abcd");
    expect(draw(edit(pic("Ab Cd"), { id: "b", newChat: true }))).toBe("ABCd");
    // Right after tasks that ran it may continue their chat, as a drop there does.
    expect(draw(edit(pic("Ab Cd", "ab"), { id: "c", newChat: false }))).toBe("Abcd");
    expect(() => edit(pic("Ab Cd"), { id: "a", newChat: false })).toThrow(/first in the queue/);
    expect(() => edit(pic("Ab Cd", "ab"), { id: "a", newChat: true })).toThrow(/only queued/);
  });
  it("moves a task to the top or the bottom", () => {
    const q = pic("Ab Cd");
    expect(draw(edit(q, { id: "d", moveTo: "top" }))).toBe("DAbC");
    expect(draw(edit(q, { id: "a", moveTo: "bottom" }))).toBe("BCdA");
    expect(draw(edit(q, { id: "a", moveTo: "bottom", newChat: false }))).toBe("BCda");
    // Nothing ran, so the top has no chat to continue.
    expect(() => edit(q, { id: "d", moveTo: "top", newChat: false })).toThrow(/can't continue a chat/);
  });
  it("moves a task before or after another, into a chat or between chats", () => {
    const q = pic("Ab Cd");
    expect(draw(edit(q, { id: "d", moveTo: { after: "a" } }))).toBe("AdbC");
    expect(draw(edit(q, { id: "d", moveTo: { after: "b" } }))).toBe("AbDC");
    expect(draw(edit(q, { id: "d", moveTo: { after: "b" }, newChat: false }))).toBe("AbdC");
    expect(draw(edit(q, { id: "b", moveTo: { before: "c" } }))).toBe("ABCd");
    expect(() => edit(q, { id: "d", moveTo: { before: "b" }, newChat: true })).toThrow(/continues the chat/);
    expect(() => edit(q, { id: "d", moveTo: { after: "d" } })).toThrow(/itself/);
    expect(() => edit(q, { id: "d", moveTo: { after: "x" } })).toThrow(/no task x/);
  });
  it("never moves above or into tasks that ran", () => {
    const q = pic("Ab Cd", "ab");
    expect(draw(edit(q, { id: "d", moveTo: "top" }))).toBe("AbDC");
    expect(draw(edit(q, { id: "d", moveTo: "top", newChat: false }))).toBe("AbdC");
    expect(() => edit(q, { id: "d", moveTo: { before: "b" } })).toThrow(/below the tasks/);
    expect(() => edit(q, { id: "a", moveTo: "bottom" })).toThrow(/only queued/);
  });
  it("moves a whole chat only between chats", () => {
    const q = pic("Ab Cd E");
    expect(draw(edit(q, { id: "d", moveTo: "top", wholeChat: true }))).toBe("CdAbE");
    expect(() => edit(q, { id: "c", moveTo: { after: "a" }, wholeChat: true })).toThrow(/between chats/);
    expect(() => edit(q, { id: "c", moveTo: "top", wholeChat: true, newChat: false })).toThrow(
      /between chats/,
    );
  });
  it("applies the edits in order, together with the text changes", () => {
    const next = edit(pic("Ab Cd"), { id: "d", append: "More.", moveTo: "top" }, { id: "a", newChat: false });
    expect(draw(next)).toBe("DabC");
    expect(next.tasks[0]!.prompt).toBe("d\n\nMore.");
  });
  it("checks the new options", () => {
    expect(parseTaskEdits([{ id: "a", newChat: false, moveTo: { after: "b" } }])).toEqual([
      { id: "a", newChat: false, moveTo: { after: "b" } },
    ]);
    expect(() => parseTaskEdits([{ id: "a", moveTo: "middle" }])).toThrow(/moveTo/);
    expect(() => parseTaskEdits([{ id: "a", wholeChat: true }])).toThrow(/needs a moveTo/);
  });
});

describe("requeue", () => {
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
    expect(listing(q)).toContain("1. [Queued] a (id t1, on Claude, the project's)");
    expect(listing(q)).toContain("New chats run on the project's default.");
    expect(listing({ ...q, provider: "chatgpt" }, "claude")).toContain("(id t1, on ChatGPT, the queue's)");
  });
  it("lists a queue compactly: id, status and title per task", () => {
    const q = queued(["a", "b"]);
    q.tasks[0]!.status = "done";
    q.tasks[1]!.leftOut = true;
    expect(compactListing(q)).toBe(
      "2 tasks, paused. New chats run on the project's default.\n- t1 [Done] a\n- t2 [Queued, left out] b",
    );
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

describe("who runs a task (D-330)", () => {
  const two = (): Queue =>
    addTasks(
      emptyQueue(),
      [
        { prompt: "a", newChat: true },
        { prompt: "b", newChat: false },
        { prompt: "c", newChat: true },
      ],
      { projectId: "p1", newChat: true },
    );

  it("takes the task's choice, then the queue's, then the project's default", () => {
    let q = two();
    expect(runsOn(q, q.tasks[0]!, "claude")).toEqual({ provider: "claude", from: "project" });
    expect(runsOn(q, q.tasks[0]!, "chatgpt")).toEqual({ provider: "chatgpt", from: "project" });
    q = { ...q, provider: "chatgpt" };
    expect(runsOn(q, q.tasks[0]!, "claude")).toEqual({ provider: "chatgpt", from: "queue" });
    q = editTasks(q, [{ id: "t1", provider: "claude", model: "opus" }]);
    expect(runsOn(q, q.tasks[0]!, "chatgpt")).toEqual({ provider: "claude", model: "opus", from: "task" });
    expect(runsOn(q, q.tasks[2]!, "claude")).toEqual({ provider: "chatgpt", from: "queue" });
  });

  it("runs a task that continues a chat on that chat's provider, whatever it says itself", () => {
    let q = editTasks({ ...two(), provider: "chatgpt" }, [{ id: "t1", provider: "claude" }]);
    expect(continuesChat(q, q.tasks[1]!)).toBe(true);
    expect(continuesChat(q, q.tasks[0]!)).toBe(false);
    expect(runsOn(q, q.tasks[1]!, "chatgpt")).toEqual({ provider: "claude", from: "chat" });
    // A stored choice (from before it joined the chat) is ignored.
    q = { ...q, tasks: q.tasks.map((t) => (t.id === "t2" ? { ...t, provider: "chatgpt" as const } : t)) };
    expect(runsOn(q, q.tasks[1]!, "claude").provider).toBe("claude");
    // Once the chat ran, the provider it ran on wins.
    q = { ...q, tasks: q.tasks.map((t) => (t.id === "t1" ? { ...t, ranOn: "chatgpt" as const } : t)) };
    expect(runsOn(q, q.tasks[1]!, "claude")).toEqual({ provider: "chatgpt", from: "chat" });
    expect(runsOn(q, q.tasks[0]!, "claude")).toEqual({ provider: "chatgpt", from: "ran" });
  });

  it("refuses a provider or model for a task that continues a chat", () => {
    const q = two();
    expect(() => editTasks(q, [{ id: "t2", provider: "chatgpt" }])).toThrow(/continues the chat before it/);
    expect(() => editTasks(q, [{ id: "t2", model: "sol" }])).toThrow(/continues the chat before it/);
    expect(() =>
      checkProviderChoices(
        addTasks(q, [{ prompt: "d", provider: "chatgpt" }], { projectId: "p1", newChat: false }),
        ["t4"],
      ),
    ).toThrow(/t4 continues/);
    expect(() =>
      checkProviderChoices(
        addTasks(q, [{ prompt: "d", provider: "chatgpt" }], { projectId: "p1", newChat: true }),
        ["t4"],
      ),
    ).not.toThrow();
    // Starting its own chat in the same edit makes the choice fine.
    expect(editTasks(q, [{ id: "t2", newChat: true, provider: "chatgpt" }]).tasks[1]!.provider).toBe(
      "chatgpt",
    );
  });

  it("reads Claude's provider and model, a model alone naming its provider", () => {
    const [a, b, c] = parseNewTasks([
      { prompt: "a", provider: "chatgpt", model: "sol" },
      { prompt: "b", model: "opus" },
      { prompt: "c", model: "terra" },
    ]);
    expect(a).toMatchObject({ provider: "chatgpt", model: "sol" });
    expect(
      addTasks(emptyQueue(), [b!, c!], { newChat: true }).tasks.map((t) => [t.provider, t.model]),
    ).toEqual([
      ["claude", "opus"],
      ["chatgpt", "terra"],
    ]);
    expect(() => parseNewTasks([{ prompt: "a", provider: "gemini" }])).toThrow(/claude" or "chatgpt/);
    expect(() => parseNewTasks([{ prompt: "a", provider: "claude", model: "sol" }])).toThrow(
      /isn't a Claude model/,
    );
    expect(() => parseNewTasks([{ prompt: "a", model: "rm -rf /" }])).toThrow(/model id/);
    expect(providerOfModel("gpt-6.1-sol")).toBe("chatgpt");
    expect(providerOfModel("claude-opus-5-5[1m]")).toBe("claude");
    expect(parseQueueProvider("default")).toBeUndefined();
    expect(parseQueueProvider("chatgpt")).toBe("chatgpt");
    expect(() => parseQueueProvider("gemini")).toThrow();
  });

  it("changes a task's choice: back to the queue's, a model of the same provider, or another provider", () => {
    const [t] = addTasks(emptyQueue(), [{ prompt: "a", provider: "chatgpt", model: "sol" }], {
      newChat: true,
    }).tasks;
    expect(setProviderChoice(t!, undefined, undefined)).toBe(t);
    expect(setProviderChoice(t!, null, undefined)).not.toHaveProperty("provider");
    expect(setProviderChoice(t!, null, undefined)).not.toHaveProperty("model");
    expect(setProviderChoice(t!, undefined, "luna")).toMatchObject({ provider: "chatgpt", model: "luna" });
    expect(setProviderChoice(t!, undefined, null)).toMatchObject({ provider: "chatgpt" });
    expect(setProviderChoice(t!, undefined, null)).not.toHaveProperty("model");
    expect(setProviderChoice(t!, "claude", undefined)).toEqual({
      ...t,
      provider: "claude",
      model: undefined,
    });
    expect(setProviderChoice(t!, undefined, "haiku")).toMatchObject({ provider: "claude", model: "haiku" });
  });

  it("keeps the choice when a task runs again, and forgets where it ran when it is put back", () => {
    let q = addTasks(emptyQueue(), [{ prompt: "a", provider: "chatgpt", model: "sol" }], { newChat: true });
    q = { ...q, tasks: [{ ...q.tasks[0]!, status: "done", ranOn: "chatgpt", ranModel: "sol" }] };
    expect(requeue(q, "t1").tasks[1]).toMatchObject({ provider: "chatgpt", model: "sol", status: "queued" });
    expect(requeue(q, "t1").tasks[1]).not.toHaveProperty("ranOn");
    expect(resetTask(q.tasks[0]!)).not.toHaveProperty("ranOn");
    expect(resetTask(q.tasks[0]!)).toMatchObject({ provider: "chatgpt" });
  });

  it("blocks a task whose ChatGPT chat can't start because ChatGPT isn't signed in, and pauses", () => {
    const q = two();
    const blocked = startFailed(q.tasks[0]!, `${CHATGPT_SIGNED_OUT}: sign in on Get Started`, "2025-01-01");
    expect(blocked).toMatchObject({ status: "blocked", finishedAt: "2025-01-01" });
    expect(blocked.error).toMatch(/^ChatGPT isn't signed in/);
    expect(shouldPause(q, blocked)).toBe(true);
    expect(startFailed(q.tasks[0]!, "That project no longer exists").status).toBe("error");
  });
});
