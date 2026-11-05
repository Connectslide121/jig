import { describe, expect, it } from "vitest";
import {
  canReport,
  followUpId,
  markQueued,
  parseRunReport,
  reportPrompt,
  runFollowUps,
  saveReport,
} from "./report";
import { addTasks, emptyQueue, type Run, type Task } from "./tasks";

const tasks = (): Task[] =>
  addTasks(emptyQueue(), ["fix the cart", "update the readme", "deploy the shop"], {
    projectId: "p1",
    newChat: true,
  }).tasks.map((t, i) => ({
    ...t,
    status: (["done", "done", "blocked"] as const)[i]!,
    sentAt: "2026-11-05T10:00:00Z",
    finishedAt: "2026-11-05T10:05:00Z",
    sessionId: `s${i}`,
    report: {
      outcome: (["done", "done", "blocked"] as const)[i]!,
      summary: `Summary ${i + 1}`,
      notes: [`Note ${i + 1}`],
      followUps: i === 2 ? [] : [`Follow-up ${i + 1}a`, `Follow-up ${i + 1}b`],
    },
  }));
const run = (over: Partial<Run> = {}): Run => ({
  id: "r1",
  startedAt: "2026-11-05T10:00:00Z",
  finishedAt: "2026-11-05T10:20:00Z",
  tasks: tasks(),
  ...over,
});
const made = { provider: "claude" as const, model: "opus", at: "2026-11-05T11:00:00Z" };

describe("reportPrompt: the input", () => {
  it("has every task with its id, status, report and follow-ups by id", () => {
    const text = reportPrompt(run());
    expect(text).toContain("id: t1");
    expect(text).toContain("status: Blocked");
    expect(text).toContain("summary: Summary 2");
    expect(text).toContain("- Note 3");
    expect(text).toContain("- [t1.2] Follow-up 1b");
    expect(text).toContain("prompt:\nfix the cart");
    expect(followUpId("t1", 1)).toBe("t1.2");
  });

  it("stays under the limit on a big run, cutting the prompts first", () => {
    const big = run({ tasks: run().tasks.map((t) => ({ ...t, prompt: "x".repeat(20_000) })) });
    const text = reportPrompt(big, 10_000);
    expect(text.length).toBeLessThanOrEqual(10_000);
    // The reports are still whole: only the prompts were cut.
    expect(text).toContain("summary: Summary 3");
    expect(text).toContain("- [t2.2] Follow-up 2b");
    expect(text).not.toContain("x".repeat(2001));
  });

  it("only for a finished run", () => {
    expect(canReport(run())).toBe(true);
    expect(canReport(run({ finishedAt: undefined }))).toBe(false);
  });
});

describe("parseRunReport: checking the answer", () => {
  const answer = {
    overview: "Two done, one blocked.",
    tasks: [
      { taskId: "t2", line: "Readme updated", committed: "abc123 on main" },
      { taskId: "t1", line: "Cart fixed" },
      { taskId: "t9", line: "Not a task" },
      { taskId: "t1", line: "Twice" },
    ],
    aware: [
      { kind: "decision", text: "Chose the simple fix", taskIds: ["t1", "t9"] },
      { kind: "weird", text: "Unknown kind", taskIds: [] },
      { kind: "risk", text: "", taskIds: [] },
    ],
    stuck: [
      { taskId: "t3", what: "No access", unblock: "Sign in to Azure" },
      { taskId: "t9", what: "x", unblock: "y" },
    ],
    needsYou: [{ kind: "push", text: "Push main", repo: "shop", taskIds: ["t1", "t2"] }],
    proposals: [
      {
        kind: "fix",
        title: "Fix both",
        why: "Same code",
        prompt: "Fix 1a and 2a",
        sources: ["t1.1", "t2.1", "t7.1"],
      },
      { kind: "cleanup", title: "Again", prompt: "Takes 1a again and 1b", sources: ["t1.1", "t1.2"] },
      { kind: "feature", title: "No prompt", prompt: "", sources: ["t2.2"] },
    ],
  };

  it("keeps what matches the run and drops the rest", () => {
    const r = parseRunReport(JSON.stringify(answer), run(), made);
    expect(r).toMatchObject({ runId: "r1", madeAt: made.at, provider: "claude", model: "opus" });
    expect(r.tasks.map((t) => t.taskId)).toEqual(["t1", "t2"]);
    expect(r.tasks[1]!.committed).toBe("abc123 on main");
    expect(r.aware).toEqual([
      { kind: "decision", text: "Chose the simple fix", taskIds: ["t1"] },
      { kind: "surprise", text: "Unknown kind", taskIds: [] },
    ]);
    expect(r.stuck).toEqual([{ taskId: "t3", what: "No access", unblock: "Sign in to Azure" }]);
    expect(r.needsYou[0]).toEqual({ kind: "push", text: "Push main", repo: "shop", taskIds: ["t1", "t2"] });
  });

  it("gives each follow-up to one proposal, and keeps the ones left out as suggested", () => {
    const r = parseRunReport(JSON.stringify(answer), run(), made);
    expect(r.proposals.map((p) => [p.id, p.sources, !!p.asSuggested])).toEqual([
      ["p1", ["t1.1", "t2.1"], false],
      ["p2", ["t1.2"], false],
      ["p3", ["t2.2"], true],
    ]);
    expect(r.proposals[2]!.prompt).toBe("Follow-up 2b");
  });

  it("reads JSON in fences or after a preamble, and refuses no JSON or an empty report", () => {
    const fenced = `Here it is:\n\`\`\`json\n${JSON.stringify({ overview: "Fine." })}\n\`\`\``;
    expect(parseRunReport(fenced, run(), made).overview).toBe("Fine.");
    expect(() => parseRunReport("Sorry, I can't.", run(), made)).toThrow("no JSON");
    expect(() => parseRunReport("{}", run(), made)).toThrow("no report");
  });
});

describe("saving and marking", () => {
  const report = () => parseRunReport(JSON.stringify({ overview: "Ok.", proposals: [] }), run(), made);

  it("saves a report with the run and drops reports of runs no longer in the history", () => {
    const old = { ...report(), runId: "gone" };
    const next = saveReport({ gone: old }, report(), ["r1"]);
    expect(Object.keys(next)).toEqual(["r1"]);
    expect(saveReport({}, report(), [])).toEqual({});
  });

  it("marks queued proposals once", () => {
    const r = parseRunReport(JSON.stringify({ overview: "Ok." }), run(), made);
    const once = markQueued(r, ["p1"], "2026-11-05T12:00:00Z");
    expect(once.proposals[0]!.queuedAt).toBe("2026-11-05T12:00:00Z");
    expect(once.proposals[1]!.queuedAt).toBeUndefined();
    expect(markQueued(once, ["p1"], "later").proposals[0]!.queuedAt).toBe("2026-11-05T12:00:00Z");
  });

  it("lists every follow-up with its task", () => {
    expect([...runFollowUps(run()).keys()]).toEqual(["t1.1", "t1.2", "t2.1", "t2.2"]);
  });
});
