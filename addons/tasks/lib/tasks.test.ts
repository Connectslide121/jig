import { describe, expect, it } from "vitest";
import { countTasks } from "./counts";
import {
  addTasks,
  afterTurn,
  applyReport,
  BACKGROUND_WAIT_MS,
  CHATGPT_SIGNED_OUT,
  type ChatState,
  canMarkDone,
  canReportLate,
  canRevise,
  chatFinished,
  chatGroups,
  chatToContinue,
  checkProviderChoices,
  closeRun,
  compactListing,
  continuesChat,
  counts,
  currentSlot,
  cutOffTurn,
  deletePermission,
  dropSlots,
  duration,
  editTasks,
  emptyQueue,
  finishTask,
  handoverOrder,
  hasStopLine,
  historyFiles,
  holdForUpdate,
  interruptedTurn,
  isParked,
  joinQueues,
  limitedTask,
  listing,
  MARKED_DONE_SUMMARY,
  markDone,
  moveStop,
  moveTasks,
  newChatRunsOn,
  nextTask,
  normalizeQueue,
  nudgeFrom,
  nudgeText,
  openRun,
  parseNewTasks,
  parsePermissionMode,
  parsePrompts,
  parseQueueProvider,
  parseQueueRunsOn,
  parseReport,
  parseTaskEdits,
  parseTaskIds,
  passStops,
  pendingReportsNote,
  poolLast,
  providerOfModel,
  type Queue,
  type Run,
  recordRuns,
  releaseHold,
  removeTasks,
  reportTarget,
  requeue,
  resetTask,
  resetTasks,
  resumeFrom,
  resumeText,
  runBlock,
  runOutcome,
  runProviders,
  runProvidersText,
  runsOn,
  STATUS_LABEL,
  STOP_LINE_TEXT,
  sameSlot,
  setNewChat,
  setParked,
  setProviderChoice,
  setQueueRunsOn,
  setStop,
  shouldPause,
  splitQueue,
  startFailed,
  stepTasks,
  type Task,
  type TaskReport,
  tally,
  taskContext,
  titleFor,
  titleOf,
  UPDATE_HOLD_MS,
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
  it("treats a task saved with the old tick (leftOut) as a plain queued task", () => {
    const old = queued(["a", "b"]);
    old.tasks[0] = { ...old.tasks[0]!, leftOut: true } as never;
    const q = normalizeQueue(old);
    expect(nextTask(q)?.id).toBe("t1");
    expect(q.tasks.every((t) => !("leftOut" in t))).toBe(true);
    expect(counts(q)).toMatchObject({ queued: 2, ready: 2 });
    expect(normalizeQueue(q)).toBe(q);
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
    expect(resetTask({ ...task, parked: true })).toEqual({
      id: "t1",
      title: "a",
      prompt: "a",
      projectId: "p1",
      newChat: true,
      permissionMode: undefined,
      status: "queued",
      parked: true,
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
  it("has a ChatGPT estimate as its cost, and none on a ChatGPT model without a price (D-414)", () => {
    const gpt: Task = { ...task, ranOn: "chatgpt" };
    expect(finishTask(gpt, chat({ provider: "chatgpt", costUsd: 0.25 })).costUsd).toBeCloseTo(0.05);
    expect(finishTask(gpt, chat({ provider: "chatgpt", costUsd: 0.2 })).costUsd).toBeUndefined();
    // On Claude nothing spent is still $0.00.
    expect(finishTask(task, chat({ provider: "claude", costUsd: 0.2 })).costUsd).toBe(0);
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
  it("marks a turn Jig never got to Interrupted, but only when catching up", () => {
    expect(afterTurn(task, chat(), Date.now(), true)).toBe("interrupted");
    expect(afterTurn(task, chat())).toBe("wait");
    expect(afterTurn(task, chat({ queued: 1 }), Date.now(), true)).toBe("wait");
  });
  it("asks only for the report, by task number and id", () => {
    const q = pic("Ab");
    const text = nudgeText(q, q.tasks[1]!);
    expect(text).toContain('report of task 2 ("b", taskId "b")');
    expect(text).toContain("Don't continue the task's work unless the user asks");
    expect(nudgeFrom(q, q.tasks[1]!)).toBe("Task queue: asked for the report of task 2");
  });
});

describe("a turn Jig cut off by closing (D-394)", () => {
  const sentAt = "2025-01-01T10:00:00Z";
  const cutOffAt = "2025-01-01T10:05:00Z";
  const task: Task = {
    id: "t1",
    title: "a",
    prompt: "a",
    newChat: true,
    status: "running",
    sentAt,
    sawBusy: true,
  };
  const cut = chat({ lastAnswerAt: "2025-01-01T10:04:00Z", cutOffAt });
  it("carries on once, even after it had answered (where it used to ask for the report)", () => {
    expect(afterTurn(task, cut, Date.now(), true)).toBe("resume");
    expect(afterTurn(task, cut)).toBe("resume");
    // Without the cut-off the same chat is asked for its report.
    expect(afterTurn(task, chat({ lastAnswerAt: "2025-01-01T10:04:00Z" }))).toBe("nudge");
    // Cut off before it answered at all: carries on too, rather than Interrupted.
    expect(afterTurn({ ...task, sawBusy: false }, chat({ cutOffAt }), Date.now(), true)).toBe("resume");
  });
  it("a second cut-off falls back to the usual rules", () => {
    const resumed: Task = { ...task, resumedAt: "2025-01-01T10:06:00Z", sawBusy: false };
    const again = "2025-01-01T10:09:00Z";
    // It answered after carrying on: asked for the report.
    expect(afterTurn(resumed, chat({ lastAnswerAt: "2025-01-01T10:08:00Z", cutOffAt: again }))).toBe("nudge");
    // It hadn't answered yet: Interrupted.
    expect(afterTurn(resumed, chat({ cutOffAt: again }), Date.now(), true)).toBe("interrupted");
    // Its "carry on" turn hasn't started yet: waits for it.
    expect(afterTurn(resumed, chat({ lastAnswerAt: "2025-01-01T10:04:00Z" }))).toBe("wait");
  });
  it("doesn't carry on a turn you stopped, a reported task, one asked for its report or an older cut-off", () => {
    expect(afterTurn(task, chat({ ...cut, userStoppedAt: "2025-01-01T10:03:00Z" }))).toBe("finish");
    expect(afterTurn({ ...task, report: parseReport({ outcome: "done", summary: "ok" }) }, cut)).toBe(
      "finish",
    );
    const asked: Task = { ...task, nudgedAt: "2025-01-01T10:04:30Z", sawBusy: false };
    expect(afterTurn(asked, chat({ lastAnswerAt: "2025-01-01T10:04:40Z", cutOffAt }))).toBe("finish");
    expect(afterTurn(task, chat({ ...cut, cutOffAt: "2025-01-01T09:00:00Z" }))).toBe("nudge");
    // A chat still busy or stopped by its plan's limit isn't cut off.
    expect(afterTurn(task, chat({ ...cut, status: "working" }))).toBe("wait");
    expect(cutOffTurn(task, chat({ ...cut, limit: { provider: "claude", state: "ask" } }))).toBe(false);
  });
  it("tells the chat to carry on and report, by task number and id", () => {
    const q = pic("Ab");
    const text = resumeText(q, q.tasks[1]!);
    expect(text).toContain('task 2 (taskId "b")');
    expect(text).toContain("Carry on where you left off");
    expect(text).toContain("addon_tasks_report");
    expect(resumeFrom(q, q.tasks[1]!)).toBe("Task queue: Jig restarted, carry on with task 2");
  });
});

describe("holding for an update (D-395)", () => {
  const at = "2025-01-01T10:00:00Z";
  it("holds a running queue, and leaves a paused one alone", () => {
    const running = { ...emptyQueue(), running: true };
    expect(holdForUpdate(running, at)).toEqual({
      ...running,
      running: false,
      held: { reason: "update", at },
    });
    expect(holdForUpdate(emptyQueue(), at)).toEqual(emptyQueue());
  });
  it("starts again after the restart, or when the update never came", () => {
    const held = holdForUpdate({ ...emptyQueue(), running: true }, at);
    const soon = Date.parse(at) + 60_000;
    expect(releaseHold(held, false, soon)).toBe(held);
    expect(releaseHold(held, true, soon)).toEqual({ ...emptyQueue(), running: true });
    expect(releaseHold(held, false, Date.parse(at) + UPDATE_HOLD_MS)).toEqual({
      ...emptyQueue(),
      running: true,
    });
    expect(releaseHold(emptyQueue(), true)).toEqual(emptyQueue());
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
    expect(() => reportTarget(ran({ b: { status: "skipped", report: undefined } }), "s1", "b")).toThrow(
      /skipped/,
    );
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

describe("revised reports (D-353)", () => {
  const report = (outcome: string) => parseReport({ outcome, summary: `it was ${outcome}` });
  /** a reported partial and b done in chat s1, nothing running; c ran in s2; d never ran. */
  const ran = (over: Partial<Record<string, Partial<Task>>> = {}): Queue => {
    const q = pic("Ab C D");
    const ended = { finishedAt: "2025-01-01T10:10:00Z", sentAt: "2025-01-01T10:00:00Z", costUsd: 0.4 };
    const base: Record<string, Partial<Task>> = {
      a: { status: "partial", sessionId: "s1", report: report("partial"), ...ended },
      b: { status: "done", sessionId: "s1", report: report("done"), ...ended },
      c: { status: "done", sessionId: "s2", report: report("done"), ...ended },
    };
    return { ...q, tasks: q.tasks.map((t) => ({ ...t, ...base[t.id], ...over[t.id] }) as Task) };
  };
  it("goes to a reported task of this chat by id, or its last reported task; never another chat's", () => {
    expect(reportTarget(ran(), "s1", "a").id).toBe("a");
    expect(reportTarget(ran(), "s1").id).toBe("b");
    expect(() => reportTarget(ran(), "s1", "c")).toThrow(/didn't run in this chat/);
    expect(() => reportTarget(ran(), "s1", "d")).toThrow(/didn't run in this chat/);
  });
  it("still goes to a task without a report first when no taskId is given", () => {
    const q = ran({ a: { status: "no_report", report: undefined } });
    expect(reportTarget(q, "s1").id).toBe("a");
  });
  it("replaces partial with done, keeping the time and cost and the report it replaced", () => {
    const q = ran();
    const { queue, late, revised, pause } = applyReport(
      q,
      q.tasks[0]!,
      report("done"),
      "2025-01-02T09:00:00Z",
    );
    expect({ late, revised, pause }).toEqual({ late: false, revised: true, pause: false });
    expect(queue.tasks[0]).toMatchObject({
      status: "done",
      report: { outcome: "done", summary: "it was done" },
      revised: { at: "2025-01-02T09:00:00Z", from: { outcome: "partial", summary: "it was partial" } },
      finishedAt: "2025-01-01T10:10:00Z",
      costUsd: 0.4,
    });
    expect(queue.tasks[0]!.reportedLate).toBeUndefined();
  });
  it("replaces done with partial, and a revision of a revision keeps only the last report", () => {
    const q = ran();
    const once = applyReport(q, q.tasks[1]!, report("partial")).queue;
    expect(once.tasks[1]).toMatchObject({ status: "partial", revised: { from: { outcome: "done" } } });
    const twice = applyReport(once, once.tasks[1]!, report("done")).queue;
    expect(twice.tasks[1]).toMatchObject({ status: "done", revised: { from: { outcome: "partial" } } });
  });
  it("pauses on a revision to failed like a late report; done never starts the queue", () => {
    const running = { ...ran(), running: true };
    // b is s1's last task: a failed revision pauses, a's doesn't (its chat went on with b).
    expect(applyReport(running, running.tasks[1]!, report("failed")).pause).toBe(true);
    expect(applyReport(running, running.tasks[0]!, report("blocked")).pause).toBe(false);
    const paused = ran();
    expect(applyReport(paused, paused.tasks[0]!, report("done")).queue.running).toBe(false);
  });
  it("tells a chat whose task ended that it may report again", () => {
    expect(taskContext(ran(), "s1")).toContain('call addon_tasks_report again with taskId "b"');
    expect(taskContext(ran(), "s3")).toBe("");
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

/** A picture with a parked pool: the tasks of `parked` (ids) are parked. */
const parkedPic = (spec: string, parked: string, done = ""): Queue => {
  const q = pic(spec, done);
  return { ...q, tasks: q.tasks.map((t) => (parked.includes(t.id) ? { ...t, parked: true } : t)) };
};
/** The queue as a picture, a parked task marked with ~ and a stop line after a task with |. */
const drawPool = (q: Queue) =>
  q.tasks
    .map((t) => `${t.parked ? "~" : ""}${t.newChat ? t.id.toUpperCase() : t.id}${t.stopAfter ? "|" : ""}`)
    .join("");

describe("the parked pool (D-369)", () => {
  it("parks a task at the end of the pool and unparks it as the last queued task", () => {
    const q = parkedPic("Ab C X", "x");
    const parked = setParked(q, ["a"], true);
    // The chat's first task parks: its next task starts the chat.
    expect(drawPool(parked)).toBe("BC~X~A");
    expect(drawPool(setParked(parked, ["x"], false))).toBe("BCX~A");
    expect(setParked(q, ["x"], true)).toBe(q);
    expect(() => setParked(parkedPic("Ab", "", "a"), ["a"], true)).toThrow(/only queued tasks/);
  });
  it("never runs a parked task, and no stop line goes after it", () => {
    const q = parkedPic("A B", "a");
    expect(nextTask(q)?.id).toBe("b");
    expect(nextTask(parkedPic("A", "a"))).toBeUndefined();
    expect(() => setStop(q, "a", true)).toThrow(/parked/);
    expect(counts(q)).toMatchObject({ queued: 1, ready: 1, parked: 1, total: 2 });
    expect(isParked(q.tasks[0]!)).toBe(true);
  });
  it("adds new tasks before the pool, and parked ones at its end, each in its own chat", () => {
    const q = addTasks(parkedPic("A X", "x"), ["b"], { newChat: true });
    expect(q.tasks.map((t) => t.id)).toEqual(["a", "t1", "x"]);
    const same = addTasks(parkedPic("A X", "x"), ["b"], { newChat: false });
    expect(drawPool(same)).toBe("At1~X");
    const ideas = addTasks(parkedPic("A X", "x"), ["b", "c"], { newChat: true, parked: true });
    expect(drawPool(ideas)).toBe("A~X~T1~T2");
    // Parked with the same chat: they continue the last parked chat (D-396).
    expect(drawPool(addTasks(parkedPic("A X", "x"), ["b", "c"], { newChat: false, parked: true }))).toBe(
      "A~X~t1~t2",
    );
    // Run again lands before the pool too.
    expect(requeue(parkedPic("A X", "x", "a"), "a").tasks.map((t) => t.id)).toEqual(["a", "t1", "x"]);
  });
  it("keeps the pool last when queues are joined", () => {
    const joined = joinQueues(parkedPic("A X", "x"), { ...pic("B"), seq: 1 });
    expect(joined.tasks.map((t) => t.id)).toEqual(["a", expect.any(String), "x"]);
    expect(poolLast(pic("A B").tasks)).toEqual(pic("A B").tasks);
  });
  it("drops a task or a whole chat into the pool, or a parked one into the queue", () => {
    const q = parkedPic("Ab C X Y", "xy");
    const slots = dropSlots(q, ["c"]);
    expect(slots.filter((s) => s.parked)).toEqual([
      { before: "x", join: false, parked: true },
      { before: "y", join: false, parked: true },
      { before: undefined, join: false, parked: true },
    ]);
    // The queue's end is before the first parked task, outside the pool.
    expect(slots).toContainEqual({ before: "x", join: false });
    // A whole chat goes into the pool too, between its chats (D-396).
    expect(dropSlots(q, ["a", "b"]).filter((s) => s.parked)).toEqual([
      { before: "x", join: false, parked: true },
      { before: "y", join: false, parked: true },
      { before: undefined, join: false, parked: true },
    ]);
    expect(drawPool(moveTasks(q, ["a", "b"], { before: "y", join: false, parked: true }))).toBe("C~X~A~b~Y");
    expect(drawPool(moveTasks(q, ["c"], { before: "y", join: false, parked: true }))).toBe("Ab~X~C~Y");
    expect(drawPool(moveTasks(q, ["y"], { before: "c", join: false }))).toBe("AbYC~X");
    expect(drawPool(moveTasks(q, ["y"], { before: "x", join: true }))).toBe("AbCy~X");
    expect(currentSlot(q, ["x"])).toEqual({ before: "y", join: false, parked: true });
  });
  it("steps stay on their side of the divider", () => {
    const q = parkedPic("A B X Y", "xy");
    expect(stepTasks(q, ["b"], 1)).toBe(q);
    expect(drawPool(stepTasks(q, ["b"], "bottom"))).toBe(drawPool(q));
    expect(stepTasks(q, ["x"], -1)).toBe(q);
    expect(drawPool(stepTasks(q, ["x"], 1))).toBe("AB~Y~X");
    expect(drawPool(stepTasks(q, ["y"], "top"))).toBe("AB~Y~X");
  });
  it("Claude's moves and edits keep the pool last, all or nothing", () => {
    const q = parkedPic("A B X Y", "xy");
    expect(drawPool(editTasks(q, [{ id: "a", moveTo: "bottom" }]))).toBe("BA~X~Y");
    expect(drawPool(editTasks(q, [{ id: "a", moveTo: { before: "x" } }]))).toBe("BA~X~Y");
    expect(() => editTasks(q, [{ id: "a", moveTo: { after: "x" } }])).toThrow(
      /can't go into the parked pool/,
    );
    expect(() => editTasks(q, [{ id: "y", moveTo: "top" }])).not.toThrow();
    expect(drawPool(editTasks(q, [{ id: "y", moveTo: "top" }]))).toBe("AB~Y~X");
    expect(() => editTasks(q, [{ id: "x", moveTo: { before: "a" } }])).toThrow(/stays in the parked pool/);
    expect(drawPool(editTasks(q, [{ id: "x", parked: false }]))).toBe("ABX~Y");
    expect(drawPool(editTasks(q, [{ id: "a", parked: true }]))).toBe("B~X~Y~A");
    expect(() => editTasks(q, [{ id: "x", stopAfter: true }])).toThrow(/parked/);
    expect(() => editTasks(q, [{ id: "x", newChat: false }])).toThrow(/first parked task/);
    expect(drawPool(editTasks(q, [{ id: "y", newChat: false }]))).toBe("AB~X~y");
    // All or nothing: the second edit breaks a rule, so the first doesn't apply either.
    expect(() =>
      editTasks(q, [
        { id: "a", parked: true },
        { id: "b", moveTo: { after: "y" } },
      ]),
    ).toThrow();
    expect(parseTaskEdits([{ id: "x", parked: false }])).toEqual([{ id: "x", parked: false }]);
  });
  it("tells Claude which tasks are parked, and counts them apart from the queue's work", () => {
    const q = parkedPic("A X", "x");
    expect(listing(q)).toContain("[Queued, parked] X");
    expect(compactListing(q)).toContain("- x [Queued, parked] X");
    const c = countTasks(q.tasks);
    expect(c).toMatchObject({ total: 1, willRun: 1, parked: 1, chats: 1 });
    expect(c.by.upNext).toBe(1);
  });
});

describe("parking a whole chat (D-396)", () => {
  it("parks a chat together, in order, joins intact, and unparks it as a group", () => {
    const q = parkedPic("Abc D X", "x");
    const parked = setParked(q, ["a", "b", "c"], true);
    expect(drawPool(parked)).toBe("D~X~A~b~c");
    // Unparking the group puts it back last before the pool, still one chat.
    const back = setParked(parked, ["a", "b", "c"], false);
    expect(drawPool(back)).toBe("DAbc~X");
    expect(chatGroups(back).map((g) => g.tasks.length)).toEqual([1, 3, 1]);
    // Two chats at once keep their own joins.
    expect(drawPool(setParked(pic("Ab Cd E"), ["a", "b", "c", "d"], true))).toBe("E~A~b~C~d");
  });
  it("parks one task of a chat alone, and the chat's next task takes over", () => {
    const q = pic("Abc D");
    expect(drawPool(setParked(q, ["a"], true))).toBe("BcD~A");
    expect(drawPool(setParked(q, ["b"], true))).toBe("AcD~B");
    // Two neighbours that go together stay one chat; the one that lost its head's chat doesn't.
    expect(drawPool(setParked(q, ["b", "c"], true))).toBe("AD~B~c");
    expect(drawPool(setParked(q, ["a", "c"], true))).toBe("BD~A~C");
  });
  it("splits a parked group like the queue when one task leaves it", () => {
    const q = setParked(pic("Abc D"), ["a", "b", "c"], true);
    expect(drawPool(q)).toBe("D~A~b~c");
    // The middle one goes to the queue: its chat is cut in two.
    expect(drawPool(moveTasks(q, ["b"], { before: "d", join: false }))).toBe("BD~A~c");
    // The head leaves: the next task starts the parked chat.
    expect(drawPool(moveTasks(q, ["a"], { before: "d", join: false }))).toBe("AD~B~c");
    expect(drawPool(setParked(q, ["a"], false))).toBe("DA~B~c");
    // A task dropped inside the card joins it; at its end too, but not next to a single idea.
    const withIdea = setParked(pic("Ab C D"), ["a", "b", "d"], true);
    expect(drawPool(withIdea)).toBe("C~A~b~D");
    expect(drawPool(moveTasks(withIdea, ["c"], { before: "b", join: true, parked: true }))).toBe("~A~c~b~D");
    expect(drawPool(moveTasks(withIdea, ["c"], { before: "d", join: true, parked: true }))).toBe("~A~b~c~D");
    expect(dropSlots(withIdea, ["c"])).not.toContainEqual({ before: undefined, join: true, parked: true });
    expect(drawPool(moveTasks(withIdea, ["c"], { before: undefined, join: false, parked: true }))).toBe(
      "~A~b~D~C",
    );
  });
  it("keeps the invariants: the pool's first starts a chat, nothing continues across", () => {
    const q = pic("Ab C");
    // The pool's first task never continues the queue's chat, however it got there.
    expect(
      drawPool({ ...q, tasks: poolLast(q.tasks.map((t) => (t.id === "b" ? { ...t, parked: true } : t))) }),
    ).toBe("AC~B");
    expect(() => editTasks(parkedPic("A X y", "xy"), [{ id: "x", newChat: false }])).toThrow(
      /first parked task/,
    );
    const p = parkedPic("A X y", "xy");
    expect(nextTask(p)?.id).toBe("a");
    expect(nextTask({ ...p, tasks: p.tasks.slice(1) })).toBeUndefined();
    expect(
      dropSlots(p, ["a"])
        .filter((s) => s.parked)
        .every((s) => s.join === false || s.before !== "x"),
    ).toBe(true);
  });
  it("Claude parks and unparks a whole chat with wholeChat, and adds a parked chat", () => {
    const q = parkedPic("Abc D X", "x");
    const edited = editTasks(q, [{ id: "b", parked: true, wholeChat: true }]);
    expect(drawPool(edited)).toBe("D~X~A~b~c");
    expect(drawPool(editTasks(edited, [{ id: "c", parked: false, wholeChat: true }]))).toBe("DAbc~X");
    // Without wholeChat only that task goes.
    expect(drawPool(editTasks(q, [{ id: "b", parked: true }]))).toBe("AcD~X~B");
    // A chat that already ran: its queued rest goes, as one chat of its own.
    expect(drawPool(editTasks(pic("Abc D", "a"), [{ id: "b", parked: true, wholeChat: true }]))).toBe(
      "AD~B~c",
    );
    expect(parseTaskEdits([{ id: "b", parked: true, wholeChat: true }])).toEqual([
      { id: "b", parked: true, wholeChat: true },
    ]);
    expect(() => parseTaskEdits([{ id: "b", wholeChat: true }])).toThrow(/needs a moveTo or parked/);
    // The add tool: parked with the same chat is one parked chat.
    const added = addTasks(q, ["one", "two", "three"], { newChat: false, parked: true });
    expect(drawPool(added)).toBe("AbcD~X~t1~t2~t3");
    const first = addTasks(parkedPic("A", ""), ["one", "two"], { newChat: false, parked: true });
    expect(drawPool(first)).toBe("A~T1~t2");
  });
});

describe("deleting tasks (the Queue tab's Remove, addon_tasks_delete)", () => {
  it("hands a chat to its next task when its first one is deleted, as a move away does", () => {
    expect(draw(removeTasks(pic("Abc D"), ["a"]))).toBe("BcD");
    expect(draw(removeTasks(pic("Abc D"), ["a", "b"]))).toBe("CD");
    expect(draw(removeTasks(pic("Abc D"), ["b"]))).toBe("AcD");
    expect(draw(removeTasks(pic("Abc D"), ["a", "b", "c"], { queuedOnly: true }))).toBe("D");
    // After a chat that ran, its next queued task still continues it.
    expect(draw(removeTasks(pic("Abc D", "a"), ["b"], { queuedOnly: true }))).toBe("AcD");
  });
  it("deletes all or nothing, and only queued tasks for Claude", () => {
    const q = pic("Ab Cd", "a");
    q.tasks[1] = { ...q.tasks[1]!, status: "running" };
    expect(() => removeTasks(q, ["c", "b"], { queuedOnly: true })).toThrow(
      "Task b is running; only queued tasks can be deleted",
    );
    expect(() => removeTasks(q, ["c", "a"], { queuedOnly: true })).toThrow(
      /Task a has finished \(done\); only queued tasks can be deleted, finished ones stay/,
    );
    expect(() => removeTasks(q, ["c", "x"], { queuedOnly: true })).toThrow(
      "There is no task x in this queue",
    );
    expect(() => removeTasks(q, [])).toThrow(/at least one/);
    // The Queue tab removes a finished task too, never one that runs.
    expect(draw(removeTasks(q, ["a"]))).toBe("BCd");
    expect(() => removeTasks(q, ["b"])).toThrow(/running task can't be removed/);
  });
  it("reads the tool's ids", () => {
    expect(parseTaskIds([" t3 ", "t4", "t3", 7, ""])).toEqual(["t3", "t4"]);
    expect(parseTaskIds("t5")).toEqual(["t5"]);
    expect(() => parseTaskIds([])).toThrow(/addon_tasks_list/);
    expect(() => parseTaskIds(Array.from({ length: 51 }, (_, i) => `t${i}`))).toThrow(/At most 50/);
  });
  it("names the tasks on the approval card, and why a rule blocks it", () => {
    const q = pic("Ab Cd", "a");
    expect(deletePermission(q, ["d", "c"], "Shop")).toEqual({
      title: "Delete 2 queued tasks from Shop's queue",
      tasks: [
        { id: "c", title: "C" },
        { id: "d", title: "d" },
      ],
    });
    expect(deletePermission(q, ["b"]).title).toBe("Delete a queued task");
    expect(deletePermission(q, ["a"]).blocked).toMatch(/finished ones stay as the queue's history/);
    expect(deletePermission(q, ["x"]).blocked).toBe("There is no task x in this queue");
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
        { id: c!.id, title: "New title", prompt: "new prompt", stopAfter: true },
      ]),
    );
    expect(next.running).toBe(true);
    expect(next.tasks[0]).toBe(q.tasks[0]);
    expect(next.tasks[1]!.prompt).toBe(`${b!.prompt}\n\nDon't run e2e tests.`);
    expect(next.tasks[2]).toMatchObject({ title: "New title", prompt: "new prompt", stopAfter: true });
    expect(editTasks(next, [{ id: c!.id, stopAfter: false }]).tasks[2]!.stopAfter).toBeUndefined();
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
    q.tasks[2] = { ...q.tasks[2]!, stopAfter: true };
    const text = taskContext(q, "s1");
    expect(text).toContain("never suggest these");
    expect(text).toContain(`- ${q.tasks[2]!.title}\n`);
    expect(text).toContain(`- ${q.tasks[3]!.title} (after a stop line: the user runs that block later)`);
    expect(text).not.toContain(`- ${q.tasks[0]!.title}`);
    const last = queued(["a"]);
    last.tasks[0] = { ...last.tasks[0]!, status: "running", sessionId: "s1" };
    expect(taskContext(last, "s1")).not.toContain("Already queued");
  });
  it("counts and times", () => {
    const q = queued(["a", "b"]);
    q.tasks[0]!.status = "done";
    expect(counts(q)).toEqual({ queued: 1, ready: 1, parked: 0, finished: 1, total: 2 });
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
    q.tasks[1]!.parked = true;
    expect(compactListing(q)).toBe(
      "2 tasks, paused. New chats run on the project's default.\n- t1 [Done] a\n- t2 [Queued, parked] b",
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
    // Handed over after a limit: the provider it started on comes along, in handover order.
    q = {
      ...q,
      tasks: q.tasks.map((t) =>
        t.id === "t1" ? { ...t, ranOn: "claude" as const, startedOn: "chatgpt" as const } : t,
      ),
    };
    const handedOver = runsOn(q, q.tasks[0]!, "claude");
    expect(handedOver).toEqual({ provider: "claude", startedOn: "chatgpt", from: "ran" });
    expect(handoverOrder(handedOver)).toEqual(["chatgpt", "claude"]);
    expect(handoverOrder({ provider: "claude" })).toEqual(["claude"]);
    // The task that continues it runs on the provider that finished it, without the pair.
    expect(runsOn(q, q.tasks[1]!, "claude")).toEqual({ provider: "claude", from: "chat" });
  });

  it("gives new chats the queue's model, only on the queue's provider (D-408)", () => {
    let q: Queue = { ...two(), provider: "claude", model: "opus" };
    expect(runsOn(q, q.tasks[0]!, "chatgpt")).toEqual({ provider: "claude", model: "opus", from: "queue" });
    // A task on the same provider without a model takes the queue's; its own model wins.
    q = editTasks(q, [
      { id: "t1", provider: "claude" },
      { id: "t3", provider: "claude", model: "haiku" },
    ]);
    expect(runsOn(q, q.tasks[0]!, "claude")).toEqual({ provider: "claude", model: "opus", from: "task" });
    expect(runsOn(q, q.tasks[2]!, "claude")).toEqual({ provider: "claude", model: "haiku", from: "task" });
    // A task on the other provider never inherits Claude's model: ChatGPT's default.
    q = editTasks(q, [{ id: "t1", provider: "chatgpt" }]);
    expect(runsOn(q, q.tasks[0]!, "claude")).toEqual({ provider: "chatgpt", from: "task" });
    // A task that continues a chat shows that chat's provider and model.
    expect(runsOn(q, q.tasks[1]!, "claude")).toEqual({ provider: "chatgpt", from: "chat" });
    q = editTasks(q, [{ id: "t1", provider: null }]);
    expect(runsOn(q, q.tasks[1]!, "claude")).toEqual({ provider: "claude", model: "opus", from: "chat" });
    // Once it ran, what its chat ran on, even after the queue changed.
    q = {
      ...q,
      model: "sonnet",
      tasks: q.tasks.map((t) => (t.id === "t1" ? { ...t, ranOn: "claude" as const, ranModel: "opus" } : t)),
    };
    expect(runsOn(q, q.tasks[0]!, "claude")).toEqual({ provider: "claude", model: "opus", from: "ran" });
    expect(runsOn(q, q.tasks[1]!, "claude")).toEqual({ provider: "claude", model: "opus", from: "chat" });
    // A stored model of another provider than the queue's never applies.
    const odd = { ...two(), provider: "chatgpt" as const, model: "opus" };
    expect(runsOn(odd, odd.tasks[0]!, "claude")).toEqual({ provider: "chatgpt", from: "queue" });
    expect(newChatRunsOn({ provider: "chatgpt", model: "sol" }, {}, "claude")).toEqual({
      provider: "chatgpt",
      model: "sol",
      from: "queue",
    });
    expect(newChatRunsOn({}, { provider: "chatgpt" }, "claude")).toEqual({
      provider: "chatgpt",
      from: "task",
    });
  });

  it("changes the queue's Runs on and model together (D-408)", () => {
    const q = emptyQueue();
    expect(setQueueRunsOn(q, "claude", "opus")).toMatchObject({ provider: "claude", model: "opus" });
    // A model alone names its provider; a provider change drops the other provider's model.
    expect(setQueueRunsOn(q, undefined, "sol")).toMatchObject({ provider: "chatgpt", model: "sol" });
    const opus = setQueueRunsOn(q, "claude", "opus");
    expect(setQueueRunsOn(opus, "chatgpt", undefined)).toEqual({ ...q, provider: "chatgpt" });
    expect(setQueueRunsOn(opus, "claude", undefined)).toMatchObject({ provider: "claude", model: "opus" });
    expect(setQueueRunsOn(opus, undefined, null)).toEqual({ ...q, provider: "claude" });
    expect(setQueueRunsOn(opus, null, undefined)).toEqual(q);
    expect(setQueueRunsOn(opus, null, null)).toEqual(q);
    expect(parseQueueRunsOn("default", undefined)).toEqual({ provider: null, model: undefined });
    expect(parseQueueRunsOn(undefined, "default")).toEqual({ provider: undefined, model: null });
    expect(parseQueueRunsOn("claude", "sonnet")).toEqual({ provider: "claude", model: "sonnet" });
    expect(() => parseQueueRunsOn("claude", "sol")).toThrow(/isn't a Claude model/);
    expect(() => parseQueueRunsOn(undefined, "rm -rf /")).toThrow(/model id/);
    expect(listing({ ...opus, tasks: [] })).toBe("The task queue is empty. New chats run on Claude (opus).");
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

describe("runProviders: what a run's tasks ran on", () => {
  const t = (over: Partial<Task>): Task => ({
    ...queued(["x"]).tasks[0]!,
    sentAt: "2026-11-05T10:00:00Z",
    status: "done",
    ...over,
  });

  it("counts the provider each task's chat ran on, most first", () => {
    const run = runProviders([
      t({ ranOn: "claude" }),
      t({ ranOn: "chatgpt" }),
      t({ ranOn: "chatgpt" }),
      t({ status: "queued", sentAt: undefined }),
    ]);
    expect(run).toEqual({
      counts: [
        { provider: "chatgpt", tasks: 2 },
        { provider: "claude", tasks: 1 },
      ],
      unrecorded: 0,
    });
    expect(runProvidersText(run)).toBe("ChatGPT · 2 tasks, Claude · 1");
  });

  it("counts a task handed over mid-chat for both providers (D-338)", () => {
    const run = runProviders([t({ ranOn: "claude", startedOn: "chatgpt" }), t({ ranOn: "chatgpt" })]);
    expect(run.counts).toEqual([
      { provider: "chatgpt", tasks: 2 },
      { provider: "claude", tasks: 1 },
    ]);
  });

  it("never guesses: old tasks without a recorded provider stay out", () => {
    const old = runProviders([t({}), t({})]);
    expect(old).toEqual({ counts: [], unrecorded: 2 });
    expect(runProvidersText(old)).toBe("");
    const mixed = runProviders([t({ ranOn: "claude" }), t({})]);
    expect(runProvidersText(mixed)).toBe("Claude · 1 task, 1 not recorded");
  });

  it("ignores the task's own choice when it didn't start", () => {
    expect(runProviders([t({ provider: "chatgpt", sentAt: undefined, status: "skipped" })]).counts).toEqual(
      [],
    );
  });
});

describe("marking a task done by hand (D-356)", () => {
  const ended = (over: Partial<Task>): Queue => ({
    ...queued(["fix the cart"]),
    tasks: [
      {
        ...queued(["fix the cart"]).tasks[0]!,
        status: "error",
        error: "ChatGPT's usage limit",
        sentAt: "2026-11-05T10:00:00Z",
        finishedAt: "2026-11-05T10:30:00Z",
        costUsd: 0.4,
        sessionId: "s1",
        ...over,
      },
    ],
  });

  it("makes an Error or No report task Done with your note, keeping its times and cost", () => {
    const q = markDone(
      ended({}),
      "t1",
      "  Committed on main as abc123\nsecond line ",
      "2026-11-05T11:00:00Z",
    );
    const t = q.tasks[0]!;
    expect(t.status).toBe("done");
    expect(t.report).toEqual({
      outcome: "done",
      summary: "Committed on main as abc123",
      notes: [],
      followUps: [],
    });
    expect(t.markedDone).toEqual({
      at: "2026-11-05T11:00:00Z",
      was: "error",
      error: "ChatGPT's usage limit",
    });
    expect(t.error).toBeUndefined();
    expect([t.sentAt, t.finishedAt, t.costUsd, t.sessionId]).toEqual([
      "2026-11-05T10:00:00Z",
      "2026-11-05T10:30:00Z",
      0.4,
      "s1",
    ]);
    expect(countTasks(q.tasks).by.done).toBe(1);
    const silent = markDone(ended({ status: "no_report", error: undefined }), "t1");
    expect(silent.tasks[0]!.report!.summary).toBe(MARKED_DONE_SUMMARY);
    expect(silent.tasks[0]!.markedDone!.was).toBe("no_report");
  });

  it("keeps a Partly done, Failed or Blocked task's report for its details (D-391)", () => {
    const chats: TaskReport = {
      outcome: "partial",
      summary: "Did the first half",
      notes: ["The rest runs as t2"],
      followUps: ["Do the second half"],
    };
    for (const outcome of ["partial", "failed", "blocked"] as const) {
      const report = { ...chats, outcome };
      const q = markDone(
        ended({ status: outcome, error: undefined, report }),
        "t1",
        "",
        "2026-11-05T11:00:00Z",
      );
      const t = q.tasks[0]!;
      expect(t.status).toBe("done");
      expect(t.report).toEqual({ outcome: "done", summary: MARKED_DONE_SUMMARY, notes: [], followUps: [] });
      expect(t.markedDone).toEqual({ at: "2026-11-05T11:00:00Z", was: outcome, report });
      expect(listing(q)).toContain(`marked done by the user (was ${STATUS_LABEL[outcome].toLowerCase()})`);
    }
  });

  it("a marked task's failed revision replaces it but doesn't pause the running queue (D-391)", () => {
    const q = { ...markDone(ended({}), "t1"), running: true, stopOnFailure: true };
    const failed: TaskReport = { outcome: "failed", summary: "It broke", notes: [], followUps: [] };
    const r = applyReport(q, q.tasks[0]!, failed);
    expect(r.revised).toBe(true);
    expect(r.queue.tasks[0]!.status).toBe("failed");
    expect(r.pause).toBe(false);
    expect(r.queue.running).toBe(true);
    // An unmarked task's failed revision still pauses it.
    const plain = {
      ...ended({ status: "done", error: undefined, report: { ...failed, outcome: "done" } }),
      running: true,
      stopOnFailure: true,
    };
    expect(applyReport(plain, plain.tasks[0]!, failed).pause).toBe(true);
  });

  it("refuses other statuses and unknown tasks", () => {
    for (const status of ["error", "no_report", "partial", "failed", "blocked"] as const)
      expect(canMarkDone(ended({ status }).tasks[0]!)).toBe(true);
    for (const status of ["queued", "running", "needs_you", "done", "skipped"] as const) {
      expect(canMarkDone(ended({ status }).tasks[0]!)).toBe(false);
      expect(() => markDone(ended({ status }), "t1")).toThrow("only a task that ended in Error");
    }
    expect(() => markDone(ended({}), "t9")).toThrow("no task t9");
  });

  it("a chat can still report it later, as a revision", () => {
    const q = markDone(ended({}), "t1");
    expect(canRevise(q.tasks[0]!)).toBe(true);
    expect(listing(q)).toContain("[Done, marked done by the user (was error)]");
  });
});

describe("permission modes (D-363)", () => {
  it("takes Don't ask from the dialogs, and nothing unknown", () => {
    expect(parsePermissionMode("bypassPermissions")).toBe("bypassPermissions");
    expect(parsePermissionMode("plan")).toBe("plan");
    expect(parsePermissionMode(undefined)).toBeUndefined();
    expect(() => parsePermissionMode("yolo")).toThrow(/Unknown permission mode/);
  });
  it("never lets Claude's add tool pick a mode", () => {
    const [task] = parseNewTasks([{ prompt: "x", permissionMode: "bypassPermissions" }]);
    expect(task).not.toHaveProperty("permissionMode");
  });
});

describe("stop lines (D-398)", () => {
  /** A queue with stop lines after the tasks `stops` (the picture's ids). */
  const stopped = (spec: string, stops: string, done = ""): Queue => {
    const q = pic(spec, done);
    return { ...q, tasks: q.tasks.map((t) => (stops.includes(t.id) ? { ...t, stopAfter: true } : t)) };
  };

  it("puts a line after a task, ends a block there and takes the line away again", () => {
    const q = setStop(pic("A B C D E"), "b", true);
    expect(drawPool(q)).toBe("AB|CDE");
    expect(hasStopLine(q.tasks[1]!)).toBe(true);
    expect(runBlock(q).map((t) => t.id)).toEqual(["a", "b"]);
    expect(counts(q)).toMatchObject({ queued: 5, ready: 2 });
    expect(drawPool(setStop(q, "b", false))).toBe("ABCDE");
    expect(runBlock(pic("A B")).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("never splits a chat: the line snaps to the chat's end, wherever it is asked for", () => {
    const q = pic("Abc D");
    expect(drawPool(setStop(q, "a", true))).toBe("Abc|D");
    expect(drawPool(setStop(q, "b", true))).toBe("Abc|D");
    expect(drawPool(setStop(setStop(q, "c", true), "a", false))).toBe("AbcD");
    // A line saved inside a chat (or a task made to continue one) moves to its end.
    expect(drawPool(normalizeQueue(stopped("Abc D", "a")))).toBe("Abc|D");
    expect(drawPool(setNewChat(stopped("A B C", "a"), "b", false))).toBe("Ab|C");
  });

  it("belongs after a queued or running task, nowhere else", () => {
    const run = pic("A B C", "");
    run.tasks[0] = { ...run.tasks[0]!, status: "running" };
    expect(drawPool(setStop(run, "a", true))).toBe("A|BC");
    expect(runBlock(setStop(run, "a", true))).toEqual([]);
    expect(() => setStop(pic("A B", "a"), "a", true)).toThrow(/queued or running/);
    expect(() => setStop(pic("A"), "z", true)).toThrow(/no task z/);
    // Used-up lines go, except while the queue runs (the run is about to take them).
    const old = stopped("A B C", "a", "a");
    expect(drawPool(normalizeQueue(old))).toBe("ABC");
    expect(drawPool(normalizeQueue({ ...old, running: true }))).toBe("A|BC");
    expect(drawPool(normalizeQueue(stopped("A B C", "c")))).toBe("ABC|");
  });

  it("is used up when the run reaches it, and a Start after a pause passes it", () => {
    const q = { ...stopped("A B C", "a", "a"), running: true };
    const passed = passStops(q);
    expect(passed.hit).toBe(true);
    expect(drawPool(passed.queue)).toBe("ABC");
    expect(nextTask(passed.queue)?.id).toBe("b");
    expect(passStops(passed.queue)).toEqual({ queue: passed.queue, hit: false });
  });

  it("stays where it is when tasks move around it", () => {
    const q = stopped("A B C D", "b");
    // A task that moves away leaves the line behind, after the task before it.
    expect(drawPool(moveTasks(q, ["b"], { join: false }))).toBe("A|CDB");
    expect(drawPool(moveTasks(q, ["d"], { before: "a", join: false }))).toBe("DAB|C");
    // Dropped above the line the task is before it; the line stays after it. Below, the line stays put.
    expect(drawPool(moveTasks(q, ["a"], { before: "c", join: false }))).toBe("BA|CD");
    expect(drawPool(moveTasks(q, ["a"], { before: "c", join: false, pastStop: true }))).toBe("B|ACD");
    expect(drawPool(moveTasks(q, ["d"], { before: "c", join: false }))).toBe("ABD|C");
    expect(drawPool(moveTasks(q, ["d"], { before: "c", join: false, pastStop: true }))).toBe("AB|DC");
    // Joining the chat above the line is above it too.
    expect(drawPool(moveTasks(q, ["d"], { before: "c", join: true }))).toBe("ABd|C");
    // Removing or parking the task above it keeps the line after its neighbour.
    expect(drawPool(removeTasks(q, ["b"]))).toBe("A|CD");
    expect(drawPool(setParked(q, ["b"], true))).toBe("A|CD~B");
    // A line with nothing queued above it goes.
    expect(drawPool(removeTasks(stopped("A B C", "a", ""), ["a"]))).toBe("BC");
    expect(drawPool(removeTasks(pic("A B C", "a"), ["b"]))).toBe("AC");
  });

  it("offers a drop below the line as its own place, and steps over it", () => {
    const q = stopped("A B C D", "b");
    const slots = dropSlots(q, ["a"]);
    expect(slots.filter((s) => s.before === "c").map((s) => [s.join, !!s.pastStop])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    expect(sameSlot({ before: "c", join: false }, { before: "c", join: false, pastStop: true })).toBe(false);
    // c sits right below the line.
    expect(currentSlot(q, ["c"])).toEqual({ before: "d", join: false, pastStop: true });
    expect(drawPool(stepTasks(q, ["c"], -1))).toBe("ABC|D");
    expect(drawPool(stepTasks(stepTasks(q, ["c"], -1), ["c"], -1))).toBe("ABc|D");
    const one = stepTasks(q, ["a"], 1);
    expect(drawPool(one)).toBe("Ba|CD");
    const two = stepTasks(one, ["a"], 1);
    expect(drawPool(two)).toBe("BA|CD");
    expect(drawPool(stepTasks(two, ["a"], 1))).toBe("B|ACD");
  });

  it("moves a line from after one task to after another", () => {
    const q = stopped("A B C D", "b");
    expect(drawPool(moveStop(q, "b", "d"))).toBe("ABCD|");
    expect(drawPool(moveStop(q, "b", "a"))).toBe("A|BCD");
    expect(moveStop(q, "b", "b")).toBe(q);
    expect(() => moveStop(q, "a", "c")).toThrow(/no stop line after task a/);
  });

  it("is placed by Claude with stopAfter, also after the running task, and listed", () => {
    const q = pic("A B C");
    q.tasks[0] = { ...q.tasks[0]!, status: "running", sessionId: "s1" };
    const next = editTasks(
      q,
      parseTaskEdits([
        { id: "a", stopAfter: true },
        { id: "b", stopAfter: true },
      ]),
    );
    expect(drawPool(next)).toBe("A|B|C");
    const text = listing(next);
    expect(text.split("\n").filter((l) => l === STOP_LINE_TEXT)).toHaveLength(2);
    expect(text.indexOf("[Running]")).toBeLessThan(text.indexOf(STOP_LINE_TEXT));
    expect(compactListing(next)).toContain(`- ${STOP_LINE_TEXT}`);
    expect(drawPool(editTasks(next, [{ id: "b", stopAfter: false }]))).toBe("A|BC");
    // Another change to a running task is still refused.
    expect(() => editTasks(q, [{ id: "a", append: "x" }])).toThrow(/only queued tasks/);
    expect(() => parseTaskEdits([{ id: "a", stopAfter: "yes" }])).toThrow(/what to change/);
  });

  it("tells a running task's chat which queued tasks wait after a line", () => {
    const q = stopped("A B C", "b");
    q.tasks[0] = { ...q.tasks[0]!, status: "running", sessionId: "s1" };
    const text = taskContext(q, "s1");
    expect(text).toContain("- B\n");
    expect(text).toContain("- C (after a stop line: the user runs that block later)");
  });
});

describe("the counts around stop lines (D-398)", () => {
  it("counts only what runs before the next line as will run", () => {
    const q = {
      ...pic("A B C D E", "a"),
      tasks: pic("A B C D E", "a").tasks.map((t) => (t.id === "c" ? { ...t, stopAfter: true } : t)),
    };
    const c = countTasks(q.tasks);
    expect(c.by).toMatchObject({ done: 1, upNext: 2, later: 2 });
    expect(c.willRun).toBe(3);
  });
});
