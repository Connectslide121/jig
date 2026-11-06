import { describe, expect, it } from "vitest";
import {
  addOutput,
  addStage,
  decideGate,
  deriveState,
  failStage,
  finishStage,
  JIG,
  ME,
  moveOutput,
  openGate,
  type Run,
  setStageStatus,
  stageNeedsYou,
  startStage,
  timeline,
} from "./run";

const T = (m: number) => new Date(Date.UTC(2026, 0, 1, 9, m)).toISOString();

function run(extra: Partial<Run> = {}): Run {
  return {
    id: "fx-1",
    slug: "shift-swap",
    title: "Shift swap",
    projectId: "p1",
    track: "new-idea",
    languages: { all: "en" },
    state: "running",
    owners: {},
    stages: [],
    outputs: [],
    gates: [],
    createdAt: T(0),
    updatedAt: T(0),
    source: { kind: "typed" },
    ...extra,
  };
}

describe("stages", () => {
  it("adds a stage blocked, or replaces one with the same id", () => {
    let r = addStage(run(), { id: "S2", recipe: "scout" });
    expect(r.stages).toEqual([{ id: "S2", recipe: "scout", status: "blocked", attempt: 0 }]);
    r = addStage(r, { id: "S2", recipe: "scout", status: "ready" });
    expect(r.stages).toHaveLength(1);
    expect(r.stages[0]?.status).toBe("ready");
  });

  it("starts only a ready stage, counting the attempt", () => {
    const r = addStage(run(), { id: "S2", recipe: "scout", status: "ready" });
    const started = startStage(r, "S2", { chatId: "c1", at: T(1) });
    expect(started.stages[0]).toMatchObject({ status: "running", attempt: 1, chatId: "c1", startedAt: T(1) });
    expect(started.updatedAt).toBe(T(1));
    expect(() => startStage(started, "S2")).toThrow(/not ready/);
    expect(() => startStage(r, "S9")).toThrow(/No stage/);
  });

  it("finishes a running stage with its report and leaves the input alone", () => {
    const r = startStage(addStage(run(), { id: "S2", recipe: "scout", status: "ready" }), "S2", { at: T(1) });
    const done = finishStage(r, "S2", { summary: "Reuse 3 modules", outputs: ["scout.md"], notes: [] }, T(5));
    expect(done.stages[0]).toMatchObject({ status: "done", endedAt: T(5) });
    expect(done.stages[0]?.report?.summary).toBe("Reuse 3 modules");
    expect(r.stages[0]?.status).toBe("running");
    expect(() => finishStage(addStage(run(), { id: "S3", recipe: "x" }), "S3", undefined)).toThrow();
  });

  it("retries a failed stage once, then waits for you", () => {
    let r = addStage(run(), { id: "S5", recipe: "demo-l1", status: "ready" });
    r = startStage(r, "S5");
    r = failStage(r, "S5");
    expect(r.stages[0]?.status).toBe("ready");
    r = startStage(r, "S5");
    r = failStage(r, "S5");
    expect(r.stages[0]?.status).toBe("needs-you");
    expect(r.state).toBe("waiting");
  });

  it("takes the number of retries from the track", () => {
    let r = startStage(addStage(run(), { id: "S5", recipe: "x", status: "ready" }), "S5");
    r = failStage(r, "S5", { retries: 0 });
    expect(r.stages[0]?.status).toBe("needs-you");
  });

  it("marks a stage that asks you and sets graph statuses", () => {
    const r = startStage(addStage(run(), { id: "S1", recipe: "interview", status: "ready" }), "S1");
    expect(stageNeedsYou(r, "S1").stages[0]?.status).toBe("needs-you");
    expect(
      setStageStatus(addStage(run(), { id: "S4b", recipe: "d" }), "S4b", "skipped").stages[0]?.status,
    ).toBe("skipped");
  });
});

describe("gates", () => {
  it("opens a gate, adding it, and the run waits", () => {
    const r = openGate(run(), "G1", T(2));
    expect(r.gates).toEqual([{ id: "G1", status: "waiting", revisions: 0, at: T(2) }]);
    expect(r.state).toBe("waiting");
  });

  it("approves a gate and the run goes on", () => {
    let r = addStage(run(), { id: "S7:spec", recipe: "spec" });
    r = openGate(r, "G1");
    r = decideGate(r, "G1", { kind: "approve", by: ME }, { at: T(3) });
    expect(r.gates[0]).toMatchObject({ status: "approved", decidedBy: ME, at: T(3) });
    expect(r.state).toBe("running");
  });

  it("counts revisions and stops with 'needs a person' past the cap", () => {
    let r = openGate(run(), "G1");
    for (let i = 1; i <= 3; i++) {
      r = decideGate(r, "G1", { kind: "changes", by: ME, note: `round ${i}` });
      expect(r.gates[0]?.revisions).toBe(i);
      expect(r.state).not.toBe("stuck");
      r = openGate(r, "G1");
    }
    r = decideGate(r, "G1", { kind: "changes", by: ME });
    expect(r.state).toBe("stuck");
    expect(r.gates[0]?.revisions).toBe(3);
  });

  it("keeps the pins of a change request and its cap from the track", () => {
    const pin = { screen: "home", x: 0.2, y: 0.4, device: "desktop" as const, text: "Sort by waiting time" };
    let r = openGate(run(), "G1");
    r = decideGate(r, "G1", { kind: "changes", by: ME, pins: [pin] }, { cap: 0 });
    expect(r.state).toBe("stuck");
    expect(r.gates[0]?.pins).toEqual([pin]);
  });

  it("stops the run on reject and refuses a gate that isn't waiting", () => {
    const r = openGate(run(), "G0");
    expect(decideGate(r, "G0", { kind: "reject", by: ME }).state).toBe("stopped");
    expect(() => decideGate(run(), "G0", { kind: "approve", by: ME })).toThrow(/isn't waiting/);
  });

  it("reopens a gate after changes, clearing the last decision", () => {
    let r = openGate(run(), "G1");
    r = decideGate(r, "G1", { kind: "changes", by: ME, note: "x" });
    r = openGate(r, "G1", T(9));
    expect(r.gates[0]).toMatchObject({ status: "waiting", revisions: 1, at: T(9) });
    expect(r.gates[0]?.note).toBeUndefined();
  });
});

describe("outputs", () => {
  it("adds outputs as drafts by Jig and supersedes older open versions", () => {
    let r = addOutput(run(), { id: "d1", kind: "demo", path: "demo/v1/index.html", version: 1 }, T(1));
    expect(r.outputs[0]).toMatchObject({
      status: "draft",
      history: [{ status: "draft", by: JIG, at: T(1) }],
    });
    r = addOutput(r, { id: "d2", kind: "demo", path: "demo/v2/index.html", version: 2 }, T(2));
    expect(r.outputs.map((o) => o.status)).toEqual(["superseded", "draft"]);
    r = addOutput(r, { id: "s1", kind: "spec", path: "spec.md", version: 1 }, T(3));
    expect(r.outputs.map((o) => o.status)).toEqual(["superseded", "draft", "draft"]);
  });

  it("doesn't supersede a published or rejected version", () => {
    let r = addOutput(run(), { id: "d1", kind: "demo", path: "a", version: 1 });
    r = moveOutput(r, "d1", "rejected", { by: ME });
    r = addOutput(r, { id: "d2", kind: "demo", path: "b", version: 2 });
    expect(r.outputs[0]?.status).toBe("rejected");
  });

  it("moves an output on, recording who, when and whether it was edited", () => {
    let r = addOutput(run(), { id: "s1", kind: "spec", path: "spec.md", version: 1 }, T(1));
    r = moveOutput(r, "s1", "approved", { by: ME, edited: true, at: T(4) });
    expect(r.outputs[0]?.status).toBe("approved");
    expect(r.outputs[0]?.history[1]).toEqual({
      status: "approved",
      by: ME,
      at: T(4),
      edited: true,
      note: undefined,
    });
    r = moveOutput(r, "s1", "published", { by: ME });
    expect(r.outputs[0]?.status).toBe("published");
  });

  it("refuses moves that aren't allowed, and Jig approving anything", () => {
    const r = addOutput(run(), { id: "s1", kind: "spec", path: "spec.md", version: 1 });
    expect(() => moveOutput(r, "s1", "published", { by: ME })).toThrow(/can't go/);
    expect(() => moveOutput(r, "s1", "approved", { by: JIG })).toThrow(/person/);
    expect(moveOutput(r, "s1", "superseded", { by: JIG }).outputs[0]?.status).toBe("superseded");
    expect(() => moveOutput(r, "nope", "approved", { by: ME })).toThrow(/No output/);
  });
});

describe("deriveState", () => {
  it("is done when nothing is left, running while something is", () => {
    expect(deriveState(run({ stages: [{ id: "S2", recipe: "x", status: "done", attempt: 1 }] })).state).toBe(
      "done",
    );
    expect(deriveState(run({ stages: [{ id: "S2", recipe: "x", status: "ready", attempt: 0 }] })).state).toBe(
      "running",
    );
    expect(
      deriveState(run({ state: "done", gates: [{ id: "G1", status: "changes", revisions: 1 }] })).state,
    ).toBe("running");
  });

  it("keeps the states the Conductor sets", () => {
    for (const state of ["interview", "planning", "stuck", "stopped"] as const)
      expect(deriveState(run({ state, gates: [{ id: "G1", status: "waiting", revisions: 0 }] })).state).toBe(
        state,
      );
  });
});

describe("timeline", () => {
  it("lists stages, gates and output moves oldest first", () => {
    let r = addStage(run(), { id: "S5", recipe: "demo-l1", status: "ready" });
    r = startStage(r, "S5", { at: T(1) });
    r = finishStage(r, "S5", { summary: "Demo v1 built", outputs: [], notes: [] }, T(3));
    r = addOutput(r, { id: "d1", kind: "demo", path: "a", version: 1 }, T(3));
    r = openGate(r, "G1", T(4));
    r = decideGate(r, "G1", { kind: "approve", by: ME }, { at: T(6) });
    r = moveOutput(r, "d1", "approved", { by: ME, at: T(6) });
    expect(timeline(r, (s) => (s.id === "S5" ? "Demo" : s.id)).map((e) => e.text)).toEqual([
      "Demo started",
      "Demo v1 built",
      "G1 approved by you",
      "Demo v1 approved by you",
    ]);
  });
});
