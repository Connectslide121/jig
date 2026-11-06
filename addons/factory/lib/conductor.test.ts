import { describe, expect, it } from "vitest";
import track from "../tracks/new-idea.json";
import {
  advance,
  afterTurn,
  type ChatState,
  changesAt,
  chatNote,
  factsOf,
  forkRun,
  readyStages,
  resetFrom,
  runningCount,
} from "./conductor";
import type { Track } from "./graph";
import {
  addOutput,
  decideGate,
  finishStage,
  ME,
  type Run,
  type StageReport,
  type StageRun,
  startStage,
} from "./run";

const TRACK = track as Track;
const T = (m: number) => new Date(Date.UTC(2026, 0, 1, 9, m)).toISOString();

function fresh(extra: Partial<Run> = {}): Run {
  return {
    id: "fx-1",
    slug: "shift-swap",
    title: "Shift swap",
    projectId: "p1",
    track: "new-idea",
    level: "L1",
    languages: { all: "en" },
    state: "running",
    owners: {},
    stages: [],
    outputs: [],
    gates: [],
    createdAt: T(0),
    updatedAt: T(0),
    source: { kind: "typed" },
    plan: { outputs: ["spec", "pitch"], build: false, permissionMode: "acceptEdits", productExists: false },
    ...extra,
  };
}

const report = (extra: Partial<StageReport> = {}): StageReport => ({
  summary: "ok",
  outputs: [],
  notes: [],
  ...extra,
});

/** Starts and finishes every ready stage, the critic passing from `passFrom` on. */
function work(run: Run, passFrom = 2): Run {
  let r = run;
  for (const s of readyStages(r)) {
    r = startStage(r, s.id, { chatId: `chat-${s.id}`, at: T(1) });
    const quality = s.recipe === "critique" ? { pass: (s.version ?? 1) >= passFrom, score: 80 } : undefined;
    r = finishStage(r, s.id, report({ quality, notes: quality?.pass ? [] : ["Fix the contrast"] }), T(2));
  }
  return advance(TRACK, r, T(3)).run;
}

const statuses = (run: Run) =>
  Object.fromEntries(run.stages.map((s) => [s.id, `${s.status}${s.version ? `@${s.version}` : ""}`]));
const approve = (run: Run, gate: Parameters<typeof decideGate>[1]) =>
  advance(TRACK, decideGate(run, gate, { kind: "approve", by: ME }, { at: T(4) }), T(4)).run;
/** The Plan step (D-460): you confirm the plan, the run goes on. */
const plan = (run: Run) =>
  advance(TRACK, { ...finishStage(run, "S3", report(), T(5)), state: "running" }, T(5)).run;

describe("the Conductor's moves", () => {
  it("walks a new-idea run through every stage, in parallel where the graph allows", () => {
    let r = advance(TRACK, fresh()).run;
    expect(statuses(r)).toEqual({ S1: "ready@1" });
    r = work(work(r));
    expect(r.gates.map((g) => `${g.id}:${g.status}`)).toEqual(["G0:waiting"]);
    expect(r.state).toBe("waiting");
    r = approve(r, "G0");
    // The Plan step waits for you.
    expect(statuses(r)).toMatchObject({ S3: "needs-you@1" });
    expect(r.state).toBe("planning");
    expect(readyStages(r)).toEqual([]);
    r = plan(r);
    // A new product: directions, not the kit.
    expect(statuses(r)).toMatchObject({ S4: "skipped", S4b: "ready@1" });
    r = approve(work(r), "GD");
    expect(statuses(r)).toMatchObject({ S5: "ready@1" });
    r = work(work(r));
    // The critic failed v1: the demo is built again as v2 with its fixes, then checked again.
    expect(statuses(r)).toMatchObject({ S5: "ready@2", S6: "blocked@1" });
    expect(r.stages.find((s) => s.id === "S5")?.feedback).toContain("Fix the contrast");
    expect(factsOf(r)["quality.pass"]).toBe(false);
    r = work(work(r));
    expect(statuses(r)).toMatchObject({ S5: "done@2", S6: "done@2" });
    expect(r.gates.find((g) => g.id === "G1")?.status).toBe("waiting");
    r = approve(r, "G1");
    // The pack fans out over the plan's outputs, all at once.
    expect(readyStages(r).map((s) => s.id)).toEqual(["S7:spec", "S7:pitch"]);
    r = work(r);
    expect(r.gates.filter((g) => g.status === "waiting").map((g) => g.id)).toEqual(["G2", "G4"]);
    r = approve(approve(r, "G2"), "G4");
    expect(r.gates.find((g) => g.id === "G5")?.status).toBe("waiting");
    r = approve(r, "G5");
    expect(r.state).toBe("done");
    expect(r.gates.map((g) => g.id)).not.toContain("G4m");
    expect(r.gates.map((g) => g.id)).not.toContain("G3");
  });

  it("loops at most three rounds, then the demo goes to its gate as it is", () => {
    let r = advance(
      TRACK,
      fresh({ plan: { outputs: [], build: false, permissionMode: "acceptEdits", productExists: true } }),
    ).run;
    r = plan(approve(work(work(r)), "G0"));
    expect(statuses(r)).toMatchObject({ S4: "ready@1", S4b: "skipped" });
    for (let i = 0; i < 10; i++) r = work(r, 99);
    expect(statuses(r)).toMatchObject({ S5: "done@3", S6: "done@3" });
    expect(r.gates.find((g) => g.id === "G1")?.status).toBe("waiting");
  });

  it("asks for changes at the demo gate: the demo runs again as its next version, the gate opens again", () => {
    let r = advance(TRACK, fresh()).run;
    r = plan(approve(work(work(r)), "G0"));
    r = approve(work(r), "GD");
    r = work(work(work(work(r))));
    expect(changesAt(TRACK, r, "G1")).toEqual(["S5"]);
    r = decideGate(r, "G1", { kind: "changes", by: ME, note: "Bigger buttons" }, { at: T(5) });
    r = resetFrom(TRACK, r, changesAt(TRACK, r, "G1"), {
      feedback: "Bigger buttons",
      keepGate: "G1",
      at: T(5),
    });
    r = advance(TRACK, r, T(5)).run;
    expect(statuses(r)).toMatchObject({ S5: "ready@3", S6: "blocked@2" });
    expect(r.stages.find((s) => s.id === "S5")?.feedback).toBe("Bigger buttons");
    expect(r.gates.find((g) => g.id === "G1")).toMatchObject({ status: "closed", revisions: 1 });
    r = work(work(r));
    expect(r.gates.find((g) => g.id === "G1")?.status).toBe("waiting");
  });

  it("re-runs a stage: everything after it waits again and its gates come off", () => {
    let r = advance(TRACK, fresh()).run;
    r = plan(approve(work(work(r)), "G0"));
    r = resetFrom(TRACK, r, ["S2"], { at: T(6) });
    expect(statuses(r)).toMatchObject({ S1: "done@1", S2: "ready@2", S4: "skipped", S4b: "blocked@1" });
    expect(r.gates).toEqual([]);
    r = advance(TRACK, r).run;
    expect(statuses(r)).toMatchObject({ S2: "ready@2" });
  });

  it("forks a run from a stage: earlier results stay, that stage and the ones after run again", () => {
    let r = advance(TRACK, fresh()).run;
    r = plan(approve(work(work(r)), "G0"));
    r = addOutput(r, { id: "scout-1", kind: "scout", stage: "S2", path: "scout.md", version: 1 });
    r = addOutput(r, { id: "brief-1", kind: "brief", stage: "S1", path: "brief.md", version: 1 });
    const f = forkRun(TRACK, r, "S2", {
      id: "fx-2",
      slug: "shift-swap-2",
      title: "Shift swap (fork)",
      feedback: "Look at Fabrikam too",
    });
    expect(f).toMatchObject({ id: "fx-2", slug: "shift-swap-2", forkOf: { runId: "fx-1", stage: "S2" } });
    expect(f.outputs.map((o) => o.id)).toEqual(["brief-1"]);
    expect(statuses(f)).toMatchObject({ S1: "done@1", S2: "ready@2" });
    expect(f.stages.find((s) => s.id === "S2")).toMatchObject({
      chatId: undefined,
      feedback: "Look at Fabrikam too",
    });
    expect(f.stages.find((s) => s.id === "S1")?.chatId).toBe("chat-S1");
  });

  it("counts stage chats across runs for the concurrency limit", () => {
    const s = (status: StageRun["status"]): StageRun => ({ id: status, recipe: "x", status, attempt: 1 });
    const a = fresh({ stages: [s("running"), s("needs-you")] });
    const b = fresh({ stages: [s("running")] });
    expect(runningCount([a, b])).toBe(2);
    expect(runningCount([a, { ...b, state: "stopped" }])).toBe(1);
  });

  it("leaves stopped and stuck runs where they are", () => {
    expect(advance(TRACK, fresh({ state: "stopped" })).run.stages).toEqual([]);
    expect(
      readyStages(
        fresh({ state: "stuck", stages: [{ id: "S1", recipe: "x", status: "ready", attempt: 0 }] }),
      ),
    ).toEqual([]);
  });
});

describe("after a stage's turn", () => {
  const stage = (extra: Partial<StageRun> = {}): StageRun => ({
    id: "S2",
    recipe: "scout",
    status: "running",
    attempt: 1,
    sentAt: T(0),
    ...extra,
  });
  const chat = (extra: Partial<ChatState> = {}): ChatState => ({
    status: "idle",
    background: 0,
    queued: 0,
    lastAnswerAt: T(1),
    ...extra,
  });

  it("finishes a stage that reported, or fails one that said it couldn't", () => {
    expect(afterTurn(stage({ report: report() }), chat())).toBe("finish");
    expect(afterTurn(stage({ report: report({ failed: true }) }), chat())).toBe("fail");
    expect(afterTurn(stage(), chat({ status: "error" }))).toBe("error");
  });

  it("waits while the chat works, has background work or hit its plan's limit", () => {
    expect(afterTurn(stage(), chat({ status: "working" }))).toBe("wait");
    expect(afterTurn(stage(), chat({ limit: { provider: "claude", state: "waiting" } }))).toBe("wait");
    expect(afterTurn(stage(), chat({ background: 1 }), { now: Date.parse(T(2)) })).toBe("wait");
    expect(afterTurn(stage(), chat({ background: 1 }), { now: Date.parse(T(30)) })).toBe("nudge");
    // Idle without an answer since the prompt: the turn hasn't started yet.
    expect(afterTurn(stage({ sentAt: T(2) }), chat())).toBe("wait");
  });

  it("nudges once for the report, then waits for you", () => {
    expect(afterTurn(stage(), chat())).toBe("nudge");
    expect(afterTurn(stage({ nudgedAt: T(1) }), chat({ lastAnswerAt: T(2) }))).toBe("ask");
  });

  it("waits for you after questions, a question or a turn you stopped", () => {
    expect(afterTurn(stage(), chat(), { openQuestions: 2 })).toBe("ask");
    expect(afterTurn(stage({ question: "Which market?" }), chat())).toBe("ask");
    expect(afterTurn(stage(), chat({ userStoppedAt: T(1) }))).toBe("ask");
  });

  it("tells a chat cut off by a restart to carry on, once", () => {
    expect(afterTurn(stage(), chat({ cutOffAt: T(1), lastAnswerAt: undefined }))).toBe("resume");
    // Cut off by a restart, its turn ended with an error: still told to carry on, not retried.
    expect(afterTurn(stage(), chat({ status: "error", cutOffAt: T(1), lastAnswerAt: undefined }))).toBe(
      "resume",
    );
    expect(afterTurn(stage({ sentAt: T(2) }), chat(), { catchingUp: true })).toBe("resume");
    expect(afterTurn(stage({ sentAt: T(0), resumedAt: T(2) }), chat(), { catchingUp: true })).toBe("ask");
  });

  it("says what a running chat waits for", () => {
    expect(chatNote(chat({ limit: { provider: "claude", state: "waiting" } }))).toBe(
      "Waiting for the plan's reset",
    );
    expect(chatNote(chat({ status: "needs_you", waitingFor: "permission" }))).toContain("permission");
    expect(chatNote(chat({ status: "working" }))).toBeUndefined();
  });
});

describe("the run's state", () => {
  it("is interview until the interview is over", () => {
    let r = advance(TRACK, fresh({ state: "interview" })).run;
    expect(r.state).toBe("interview");
    r = startStage(r, "S1", { chatId: "c1" });
    r = advance(TRACK, r).run;
    expect(r.state).toBe("interview");
    r = advance(TRACK, finishStage({ ...r, state: "running" }, "S1", report())).run;
    expect(r.state).toBe("running");
    expect(readyStages(r).map((s) => s.id)).toEqual(["S2"]);
  });
});
