import { describe, expect, it } from "vitest";
import {
  cardTime,
  finishedToday,
  type QueueCard,
  queueCard,
  queueState,
  sortCards,
  summarize,
} from "./dashboard";
import { addTasks, emptyQueue, type Queue, type Task } from "./tasks";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  prompt: id,
  newChat: true,
  status: "queued",
  ...over,
});

const queue = (tasks: Task[], over: Partial<Queue> = {}): Queue => ({ ...emptyQueue(), tasks, ...over });

const done = (id: string, finishedAt: string, over: Partial<Task> = {}) =>
  task(id, {
    status: "done",
    runId: "r1",
    sentAt: "2026-11-04T09:00:00Z",
    finishedAt,
    costUsd: 1.5,
    ...over,
  });

describe("queueState", () => {
  it("needs you, then running, paused with ready tasks, finished, idle", () => {
    expect(queueState(queue([task("t1", { status: "needs_you" })], { running: true }))).toBe("needs_you");
    expect(queueState(queue([task("t1")], { running: true }))).toBe("running");
    expect(queueState(queue([task("t1", { status: "running" })]))).toBe("running");
    expect(queueState(queue([done("t1", "2026-11-04T10:00:00Z"), task("t2")]))).toBe("paused");
    expect(queueState(queue([done("t1", "2026-11-04T10:00:00Z")]))).toBe("finished");
    expect(queueState(queue([task("t1", { leftOut: true })]))).toBe("idle");
  });
});

describe("queueCard", () => {
  it("is undefined for an empty queue", () => {
    expect(queueCard("p1", emptyQueue())).toBeUndefined();
  });
  it("counts the run, names the current task's chat, the next two and the last finished", () => {
    const q = queue(
      [
        done("t1", "2026-11-04T10:00:00Z", { sessionId: "s1", chatTitle: "Fix the cart" }),
        task("t2", {
          status: "failed",
          runId: "r1",
          newChat: false,
          sessionId: "s1",
          finishedAt: "2026-11-04T10:30:00Z",
          costUsd: 0.5,
        }),
        task("t3", {
          status: "needs_you",
          runId: "r1",
          newChat: false,
          sessionId: "s1",
          sentAt: "2026-11-04T11:00:00Z",
          waitingFor: "question",
        }),
        task("t4"),
        task("t5"),
        task("t6"),
      ],
      { running: true, runId: "r1" },
    );
    const card = queueCard("p1", q)!;
    expect(card.state).toBe("needs_you");
    expect(card.counts).toMatchObject({ total: 6, willRun: 6, chats: 4 });
    expect(card.counts.by).toMatchObject({ done: 1, failed: 1, needs_you: 1, upNext: 3, running: 0 });
    expect(card.costUsd).toBe(2);
    expect(card.ms).toBe(60 * 60_000);
    expect(card.current).toMatchObject({
      id: "t3",
      sessionId: "s1",
      chatTitle: "Fix the cart",
      waitingFor: "question",
    });
    expect(card.next).toEqual(["Task t4", "Task t5"]);
    expect(card.more).toBe(1);
    expect(card.last).toEqual({ id: "t2", title: "Task t2", status: "failed", sessionId: "s1" });
  });
  it("names a new chat after its task until it has a title", () => {
    const q = queue([task("t1", { status: "running", sessionId: "s9", sentAt: "2026-11-04T11:00:00Z" })]);
    expect(queueCard("p1", q)!.current?.chatTitle).toBe("Task t1");
  });
  it("says when a task waiting for its plan's limit resumes (D-376)", () => {
    const resetsAt = "2026-11-04T14:00:00Z";
    const q = queue([task("t1", { status: "running", sessionId: "s9", limitResetsAt: resetsAt })]);
    expect(queueCard("p1", q)!.current?.limitResetsAt).toBe(resetsAt);
  });
});

describe("cardTime", () => {
  it("adds the current task's time so far", () => {
    const card = { ms: 60_000, current: { sentAt: "2026-11-04T11:00:00Z" } } as QueueCard;
    expect(cardTime(card, Date.parse("2026-11-04T11:02:00Z"))).toBe(180_000);
    expect(cardTime({ ms: 5 } as QueueCard)).toBe(5);
  });
});

describe("sortCards", () => {
  it("needs you first, then running, paused, finished, idle; projects keep their order within", () => {
    const cards = [
      { id: "a", state: "idle" as const },
      { id: "b", state: "finished" as const },
      { id: "c", state: "running" as const },
      { id: "d", state: "paused" as const },
      { id: "e", state: "needs_you" as const },
      { id: "f", state: "running" as const },
    ];
    expect(sortCards(cards).map((c) => c.id)).toEqual(["e", "c", "f", "d", "b", "a"]);
  });
});

describe("finishedToday and summarize", () => {
  const now = new Date(2026, 10, 4, 15, 0);
  const today = new Date(2026, 10, 4, 9, 0).toISOString();
  const yesterday = new Date(2026, 10, 3, 22, 0).toISOString();
  it("counts each task that finished today once, with its cost", () => {
    const t1 = done("t1", today);
    expect(
      finishedToday(
        [t1, t1, done("t2", yesterday), task("t3"), task("t4", { status: "running", finishedAt: today })],
        now,
      ),
    ).toEqual({ count: 1, costUsd: 1.5 });
  });
  it("sums the cards and the projects' days", () => {
    const running = queueCard(
      "p1",
      queue([task("t1", { status: "running", runId: "r1" }), task("t2")], { running: true, runId: "r1" }),
    )!;
    const waiting = queueCard(
      "p2",
      queue([task("t1", { status: "needs_you", runId: "r1" }), task("t2"), task("t3")], {
        running: true,
        runId: "r1",
      }),
    )!;
    const finished = queueCard("p3", queue([done("t1", today)]))!;
    expect(
      summarize(
        [running, waiting, finished],
        [
          { count: 2, costUsd: 3 },
          { count: 1, costUsd: 0.25 },
        ],
      ),
    ).toEqual({
      queuesRunning: 2,
      tasksRunning: 2,
      needsYou: 1,
      queued: 3,
      finishedToday: 3,
      costToday: 3.25,
    });
  });
});

describe("a card's provider (D-330)", () => {
  it("is the queue's Runs on, else the project's default", () => {
    const q = addTasks(emptyQueue(), ["a"], { projectId: "p1", newChat: true });
    expect(queueCard("p1", q)!.provider).toBe("claude");
    expect(queueCard("p1", q, "chatgpt")!.provider).toBe("chatgpt");
    expect(queueCard("p1", { ...q, provider: "claude" }, "chatgpt")!.provider).toBe("claude");
  });
});
