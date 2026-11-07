import { describe, expect, it } from "vitest";
import type { EvalResult } from "./evals";
import { factoryReport, reportHtml, suggestions } from "./report";
import type { Output, Run, StageRun } from "./run";

const H = 3_600_000;
const at = (h: number) => new Date(Date.UTC(2026, 0, 1) + h * H).toISOString();

const out = (id: string, kind: string, status: "approved" | "rejected", edited = false): Output => ({
  id,
  kind,
  path: `${id}.md`,
  version: 1,
  status,
  history: [
    { status: "draft", by: "jig", at: at(0), edited: false },
    { status, by: "me", at: at(1), edited },
  ],
});

function run(id: string, extra: Partial<Run> = {}, stages: Partial<StageRun>[] = []): Run {
  return {
    id,
    slug: id,
    title: id,
    projectId: "p",
    track: "new-idea",
    languages: {},
    state: "done",
    owners: {},
    stages: stages.map((s) => ({
      id: "S2",
      recipe: "scout",
      status: "done",
      attempt: 0,
      startedAt: at(0),
      endedAt: at(1),
      ...s,
    })),
    outputs: [],
    gates: [],
    createdAt: at(0),
    updatedAt: at(0),
    source: { kind: "typed" },
    ...extra,
  };
}

const critic = (pass: boolean, score: number): Partial<StageRun> => ({
  id: "S6",
  recipe: "critique",
  report: { summary: "", outputs: [], notes: [], quality: { pass, score } },
});

describe("factoryReport", () => {
  const runs = [
    run("fx-1", {}, [{}, { id: "S5", recipe: "demo-l1", version: 1 }, critic(true, 90)]),
    run("fx-2", { state: "running" }, [
      { endedAt: at(3) },
      { id: "S5", recipe: "demo-l1", version: 2 },
      critic(true, 80),
    ]),
    run("fx-3", { track: "tender" }, [{ endedAt: at(2) }]),
    run("fx-sample-x", {}, [{ endedAt: at(50) }]),
    run("fx-e", { eval: { brief: "b", recipes: {} } }, [{ endedAt: at(50) }]),
  ];
  const r = factoryReport(runs);
  it("counts real runs by track and state, samples and evals left out", () => {
    expect(r.runs).toBe(3);
    expect(r.byTrack).toEqual([
      { track: "new-idea", n: 2 },
      { track: "tender", n: 1 },
    ]);
    expect(r.byState).toEqual([
      { state: "done", n: 2 },
      { state: "running", n: 1 },
    ]);
  });
  it("measures stage times per recipe", () => {
    expect(r.stages.find((s) => s.recipe === "scout")).toEqual({
      recipe: "scout",
      n: 3,
      medianMs: 2 * H,
      p80Ms: 3 * H,
    });
  });
  it("sums up the critic: first passes, scores and demo versions", () => {
    expect(r.critic).toEqual({ n: 2, firstPass: 1, avgScore: 85, avgRounds: 1.5 });
  });
  it("reports trust per kind and the evals per recipe version", () => {
    const withOutputs = factoryReport(
      [run("fx-o", { outputs: [out("a", "spec", "approved"), out("b", "spec", "approved", true)] })],
      [
        {
          runId: "e",
          brief: "b",
          title: "t",
          recipes: { "demo-l1": "h1", critique: "c" },
          score: 70,
          pass: true,
          rounds: 1,
          ms: 1,
          at: at(0),
        } satisfies EvalResult,
      ],
    );
    expect(withOutputs.trust).toEqual([
      { kind: "spec", gate: "G2", decided: 2, approvedAsIs: 1, rate: 0.5, reviewMinutes: 60 },
    ]);
    expect(withOutputs.evals.map((e) => e.version)).toEqual(["h1 · critic c"]);
  });
});

describe("suggestions", () => {
  it("suggests lighter gates and recipe work only on enough decisions", () => {
    expect(
      suggestions([
        { kind: "spec", gate: "G2", decided: 10, approvedAsIs: 9, rate: 0.9 },
        { kind: "deck", gate: "G4", decided: 6, approvedAsIs: 2, rate: 2 / 6 },
        { kind: "pitch", gate: "G4", decided: 4, approvedAsIs: 4, rate: 1 },
        { kind: "tests", gate: "G2", decided: 8, approvedAsIs: 6, rate: 0.75 },
      ]),
    ).toEqual([
      "spec: 90% of 10 approved as written. Its gate (G2) could be lighter: a glance, or approval on the board only.",
      "deck: only 33% of 6 approved as written. Its recipe needs work: read what people changed.",
    ]);
  });
});

describe("reportHtml", () => {
  it("renders a self-contained page with escaped text and no scripts", () => {
    const html = reportHtml(factoryReport([run("fx-1", { track: "new-idea" }, [{}])]), {
      project: "Shop <beta>",
      at: at(0),
    });
    expect(html).toContain("<title>Factory report · Shop &lt;beta&gt;</title>");
    expect(html).toContain("2026-01-01");
    expect(html).toContain("<td>scout</td>");
    expect(html).not.toContain("<script");
    expect(html).toContain("Nothing measured yet.");
  });
});
