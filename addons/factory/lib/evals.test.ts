import { describe, expect, it } from "vitest";
import { type EvalResult, evalDecisions, evalOutcome, evalRecipes, evalTable } from "./evals";
import type { GateState, Run, StageRun } from "./run";

const NOW = "2026-01-01T01:00:00.000Z";

function run(stages: Partial<StageRun>[], gates: Partial<GateState>[] = [], extra: Partial<Run> = {}): Run {
  return {
    id: "fx-1",
    slug: "a",
    title: "Gift cards",
    projectId: "p",
    track: "new-idea",
    level: "L2",
    languages: {},
    state: "running",
    owners: {},
    stages: stages.map((s) => ({ id: "S5", recipe: "demo-l2", status: "done", attempt: 0, ...s })),
    outputs: [],
    gates: gates.map((g) => ({ id: "G0", status: "closed", revisions: 0, ...g })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: NOW,
    source: { kind: "typed" },
    eval: { brief: "gift-cards", recipes: { "demo-l2": "aaaa", critique: "cccc" } },
    ...extra,
  };
}

describe("evalRecipes", () => {
  it("names the demo at the level and the critic", () => {
    expect(evalRecipes("L3")).toEqual(["demo-l3", "critique"]);
    expect(evalRecipes(undefined)).toEqual(["demo-l1", "critique"]);
  });
});

describe("evalDecisions", () => {
  it("approves waiting scout and direction gates on eval runs only", () => {
    const r = run(
      [],
      [
        { id: "G0", status: "waiting" },
        { id: "GD", status: "waiting" },
        { id: "G1", status: "waiting" },
      ],
    );
    expect(evalDecisions(r)).toEqual([{ gate: "G0" }, { gate: "GD", direction: "first" }]);
    expect(evalDecisions({ ...r, eval: undefined })).toEqual([]);
    expect(evalDecisions({ ...r, state: "stopped" })).toEqual([]);
  });
});

describe("evalOutcome", () => {
  it("waits until the quality gate settles", () => {
    expect(evalOutcome(run([{ id: "S6", recipe: "critique", status: "running" }]), NOW)).toBeUndefined();
    expect(evalOutcome({ ...run([]), eval: undefined }, NOW)).toBeUndefined();
  });
  it("records the critic's score and the demo versions once G1 opens", () => {
    const r = run(
      [
        { id: "S5", version: 2 },
        {
          id: "S6",
          recipe: "critique",
          report: { summary: "", outputs: [], notes: [], quality: { pass: true, score: 86 } },
        },
      ],
      [{ id: "G1", status: "waiting" }],
    );
    expect(evalOutcome(r, NOW)).toEqual({
      runId: "fx-1",
      brief: "gift-cards",
      title: "Gift cards",
      level: "L2",
      recipes: { "demo-l2": "aaaa", critique: "cccc" },
      score: 86,
      pass: true,
      rounds: 2,
      ms: 3_600_000,
      at: NOW,
      note: undefined,
    });
  });
  it("ends as failed when a stage needs a person", () => {
    const o = evalOutcome(
      run([{ id: "S2", recipe: "scout", status: "needs-you", question: "Which market?" }]),
      NOW,
    );
    expect(o?.pass).toBe(false);
    expect(o?.note).toBe("S2 needs a person: Which market?");
  });
});

describe("evalTable", () => {
  const res = (
    at: string,
    demo: string,
    score: number | undefined,
    pass: boolean,
    rounds = 1,
  ): EvalResult => ({
    runId: at,
    brief: "b",
    title: "t",
    recipes: { "demo-l2": demo, critique: "c1" },
    score,
    pass,
    rounds,
    ms: 1,
    at,
  });
  it("groups per recipe version with the trend against the version before", () => {
    const rows = evalTable([
      res("2026-01-03", "v2", 90, true),
      res("2026-01-01", "v1", 60, false, 3),
      res("2026-01-02", "v1", 80, true),
      res("2026-01-04", "v2", undefined, false),
    ]);
    expect(rows).toEqual([
      {
        recipe: "demo-l2",
        version: "v1 · critic c1",
        n: 2,
        passed: 1,
        avgScore: 70,
        avgRounds: 2,
        trend: undefined,
        last: "2026-01-02",
      },
      {
        recipe: "demo-l2",
        version: "v2 · critic c1",
        n: 2,
        passed: 1,
        avgScore: 90,
        avgRounds: 1,
        trend: 20,
        last: "2026-01-04",
      },
    ]);
  });
});
