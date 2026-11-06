import { describe, expect, it } from "vitest";
import newIdea from "../tracks/new-idea.json";
import {
  type Facts,
  holds,
  inputs,
  nextSteps,
  nodeState,
  order,
  recipeFor,
  type Track,
  termState,
} from "./graph";
import type { GateState, Run, StageRun } from "./run";

const track = newIdea as Track;

function run(
  stages: Partial<StageRun>[] = [],
  gates: Partial<GateState>[] = [],
  extra: Partial<Run> = {},
): Run {
  return {
    id: "fx-1",
    slug: "s",
    title: "S",
    projectId: "p",
    track: "new-idea",
    languages: {},
    state: "running",
    owners: {},
    stages: stages.map((s) => ({ recipe: s.id ?? "", status: "done", attempt: 1, ...s }) as StageRun),
    outputs: [],
    gates: gates.map((g) => ({ status: "approved", revisions: 0, ...g }) as GateState),
    createdAt: "",
    updatedAt: "",
    source: { kind: "typed" },
    ...extra,
  };
}

const kinds = (steps: ReturnType<typeof nextSteps>) =>
  steps.map((s) =>
    s.kind === "open"
      ? `open ${s.gate}`
      : s.kind === "loop"
        ? `loop ${s.back} ${s.round}`
        : `${s.kind} ${s.stage}`,
  );

describe("helpers", () => {
  it("fills the recipe's level", () => {
    expect(recipeFor("demo-{level}", "L2")).toBe("demo-l2");
    expect(recipeFor("demo-{level}")).toBe("demo-l1");
    expect(recipeFor("scout", "L3")).toBe("scout");
  });

  it("evaluates when conditions", () => {
    expect(holds(undefined, {})).toBe(true);
    expect(holds("product.exists", { "product.exists": true })).toBe(true);
    expect(holds("product.exists", {})).toBe(false);
    expect(holds("!product.exists", {})).toBe(true);
    expect(holds("!product.exists", { "product.exists": true })).toBe(false);
  });

  it("orders the track for the stage-graph row", () => {
    const nodes = order(track);
    expect(nodes[0]).toEqual({ id: "S1", kind: "stage", title: "Interview" });
    expect(nodes.find((n) => n.id === "G0")?.kind).toBe("gate");
    expect(nodes.find((n) => n.id === "S7")).toEqual({ id: "S7", kind: "fanout", title: "Pack" });
  });
});

describe("node states", () => {
  const afterG1 = run([], [{ id: "G1" }]);

  it("treats an approved gate as done and any other as pending", () => {
    expect(nodeState(track, run([], [{ id: "G0" }]), {}, "G0")).toBe("done");
    expect(nodeState(track, run([], [{ id: "G0", status: "waiting" }]), {}, "G0")).toBe("pending");
  });

  it("skips fan-out instances the plan doesn't list, once the fan-out is reached", () => {
    const facts: Facts = { "plan.outputs": ["spec"] };
    expect(nodeState(track, afterG1, facts, "S7:pitch")).toBe("skipped");
    expect(nodeState(track, afterG1, facts, "S7:spec")).toBe("pending");
    expect(nodeState(track, run(), facts, "S7:pitch")).toBe("pending");
  });

  it("derives a skipped gate from its inputs", () => {
    const r = run(
      [{ id: "S1" }, { id: "S2" }, { id: "S4" }, { id: "S4b", status: "skipped" }],
      [{ id: "G0" }],
    );
    expect(nodeState(track, r, { "product.exists": true }, "GD")).toBe("skipped");
  });

  it("joins alternatives: done when one is, skipped when all are", () => {
    const facts: Facts = { "product.exists": true };
    const r = run(
      [{ id: "S1" }, { id: "S2" }, { id: "S4" }, { id: "S4b", status: "skipped" }],
      [{ id: "G0" }],
    );
    expect(termState(track, r, facts, "S4|GD")).toBe("done");
    expect(termState(track, afterG1, { "plan.outputs": [] }, "S7:pitch|S7:deck")).toBe("skipped");
    expect(termState(track, run(), {}, "S1|S2")).toBe("pending");
  });

  it("needs every input in; all skipped skips the item", () => {
    const g2 = track.stages.find((i) => i.gate === "G2")!;
    expect(inputs(track, afterG1, { "plan.outputs": ["spec"] }, g2)).toBe("pending");
    const specDone = {
      ...afterG1,
      stages: [...afterG1.stages, { id: "S7:spec", recipe: "spec", status: "done" as const, attempt: 1 }],
    };
    expect(inputs(track, specDone, { "plan.outputs": ["spec"] }, g2)).toBe("done");
    expect(inputs(track, afterG1, { "plan.outputs": [] }, g2)).toBe("skipped");
    expect(inputs(track, run(), { "plan.outputs": [] }, g2)).toBe("pending");
  });
});

describe("nextSteps on the new idea track", () => {
  it("starts the interview first, as an interactive stage", () => {
    expect(nextSteps(track, run())).toEqual([
      { kind: "start", stage: "S1", recipe: "interview", interactive: true },
    ]);
  });

  it("opens G0 after the scout and waits on it", () => {
    const r = run([{ id: "S1" }, { id: "S2" }]);
    expect(kinds(nextSteps(track, r))).toEqual(["open G0"]);
    expect(nextSteps(track, run([{ id: "S1" }, { id: "S2" }], [{ id: "G0", status: "waiting" }]))).toEqual(
      [],
    );
  });

  it("takes the product kit for an existing product, directions for a new one", () => {
    const r = run([{ id: "S1" }, { id: "S2" }], [{ id: "G0" }]);
    expect(kinds(nextSteps(track, r, { "product.exists": true }))).toEqual(["start S4", "skip S4b"]);
    expect(kinds(nextSteps(track, r, {}))).toEqual(["skip S4", "start S4b"]);
  });

  it("builds the demo at the run's level once the kit or a direction is in", () => {
    const r = run(
      [{ id: "S1" }, { id: "S2" }, { id: "S4" }, { id: "S4b", status: "skipped" }],
      [{ id: "G0" }],
      { level: "L2" },
    );
    expect(nextSteps(track, r, { "product.exists": true })).toEqual([
      { kind: "start", stage: "S5", recipe: "demo-l2", interactive: false },
    ]);
    const viaGd = run(
      [{ id: "S1" }, { id: "S2" }, { id: "S4", status: "skipped" }, { id: "S4b" }],
      [{ id: "G0" }, { id: "GD", status: "waiting" }],
    );
    expect(nextSteps(track, viaGd, {})).toEqual([]);
  });

  const toCritic = (version: number, extra: Partial<StageRun>[] = []) =>
    run(
      [
        { id: "S1" },
        { id: "S2" },
        { id: "S4" },
        { id: "S4b", status: "skipped" },
        { id: "S5", version },
        { id: "S6" },
        ...extra,
      ],
      [{ id: "G0" }],
    );

  it("loops back to the demo until the quality gate passes, at most 3 rounds", () => {
    const facts = { "product.exists": true };
    expect(kinds(nextSteps(track, toCritic(1), facts))).toEqual(["loop S5 2"]);
    expect(kinds(nextSteps(track, toCritic(2), facts))).toEqual(["loop S5 3"]);
    expect(kinds(nextSteps(track, toCritic(3), facts))).toEqual(["open G1"]);
    expect(kinds(nextSteps(track, toCritic(1), { ...facts, "quality.pass": true }))).toEqual(["open G1"]);
  });

  it("fans the pack out over the plan's outputs after G1, then opens the review gates", () => {
    const facts: Facts = { "product.exists": true, "quality.pass": true, "plan.outputs": ["spec", "pitch"] };
    const g1 = (gates: Partial<GateState>[] = [], stages: Partial<StageRun>[] = []) =>
      run(
        [
          { id: "S1" },
          { id: "S2" },
          { id: "S4" },
          { id: "S4b", status: "skipped" },
          { id: "S5", version: 1 },
          { id: "S6" },
          ...stages,
        ],
        [{ id: "G0" }, { id: "G1" }, ...gates],
      );
    expect(nextSteps(track, g1(), facts)).toEqual([
      { kind: "start", stage: "S7:spec", recipe: "spec", interactive: false },
      { kind: "start", stage: "S7:pitch", recipe: "pitch", interactive: false },
    ]);
    const packed = g1([], [{ id: "S7:spec" }, { id: "S7:pitch", status: "running" }]);
    expect(kinds(nextSteps(track, packed, facts))).toEqual(["open G2"]);
    const both = g1([{ id: "G2", status: "waiting" }], [{ id: "S7:spec" }, { id: "S7:pitch" }]);
    expect(kinds(nextSteps(track, both, facts))).toEqual(["open G4"]);
  });

  it("builds only when asked, and publishes after the sales material", () => {
    const facts: Facts = { "product.exists": true, "quality.pass": true, "plan.outputs": ["spec", "pitch"] };
    const r = run(
      [
        { id: "S1" },
        { id: "S2" },
        { id: "S4" },
        { id: "S4b", status: "skipped" },
        { id: "S5", version: 1 },
        { id: "S6" },
        { id: "S7:spec" },
        { id: "S7:pitch" },
      ],
      [{ id: "G0" }, { id: "G1" }, { id: "G2" }, { id: "G4" }],
    );
    expect(kinds(nextSteps(track, r, facts))).toEqual(["skip S8", "open G5"]);
    expect(kinds(nextSteps(track, r, { ...facts, "build.requested": true }))).toEqual([
      "start S8",
      "open G5",
    ]);
  });
});
