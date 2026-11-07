import { describe, expect, it } from "vitest";
import { duration, estimate, estimateLines, measurements, percentile, quoteEstimates } from "./estimates";
import type { Run, StageRun } from "./run";

const H = 3_600_000;
const at = (h: number) => new Date(Date.UTC(2026, 0, 1) + h * H).toISOString();

function run(id: string, level: Run["level"], stages: Array<Partial<StageRun> & { hours?: number }>): Run {
  return {
    id,
    slug: id,
    title: id,
    projectId: "p",
    track: "change-request",
    level,
    languages: {},
    state: "done",
    owners: {},
    stages: stages.map((s, i) => ({
      id: s.id ?? `S${i}`,
      recipe: s.recipe ?? "build",
      status: s.status ?? "done",
      attempt: 0,
      startedAt: at(0),
      endedAt: s.hours === undefined ? undefined : at(s.hours),
    })),
    outputs: [],
    gates: [],
    createdAt: at(0),
    updatedAt: at(0),
    source: { kind: "typed" },
  };
}

describe("measurements", () => {
  it("measures finished stages of real runs only", () => {
    const m = measurements([
      run("fx-a", "L2", [{ hours: 2 }, { hours: 1, status: "skipped" }, { recipe: "plan", hours: 1 }, {}]),
      run("fx-sample-b", "L2", [{ hours: 2 }]),
    ]);
    expect(m).toEqual([
      { runId: "fx-a", track: "change-request", level: "L2", stage: "S0", recipe: "build", ms: 2 * H },
    ]);
  });
});

describe("percentile", () => {
  it("uses the nearest rank", () => {
    expect(percentile([], 0.5)).toBeUndefined();
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.8)).toBe(4);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.8)).toBe(8);
  });
});

describe("estimate", () => {
  const runs = [1, 2, 3, 4].map((h) => run(`fx-${h}`, "L2", [{ hours: h }]));
  it("gives the median and p80 of the same recipe at the same level", () => {
    const e = estimate([...runs, run("fx-l1", "L1", [{ hours: 50 }])], {
      recipe: "build",
      level: "L2",
      label: "Build (L2)",
      noun: "build",
    });
    expect(e).toMatchObject({ n: 4, medianMs: 2 * H, p80Ms: 4 * H, basis: "median of 4 earlier L2 builds" });
  });
  it("gives no number below three measurements, and leaves the run itself out", () => {
    const e = estimate(runs.slice(0, 3), {
      recipe: "build",
      level: "L2",
      label: "B",
      noun: "build",
      exclude: "fx-1",
    });
    expect(e.medianMs).toBeUndefined();
    expect(e.basis).toBe("not enough measured runs yet (2 earlier L2 builds, 3 needed)");
  });
});

describe("quoteEstimates and estimateLines", () => {
  it("writes the numbers with their basis, or TO FILL IN", () => {
    const runs = [1, 2, 3].map((h) => run(`fx-${h}`, "L2", [{ hours: h }]));
    const lines = estimateLines(quoteEstimates(runs, { id: "fx-new", level: "L2" }));
    expect(lines[0]).toBe(
      "- Demo (L2): TO FILL IN, not enough measured runs yet (0 earlier demos, 3 needed)",
    );
    expect(lines[1]).toBe("- Build (L2): 2 h (80% of runs within 3 h), median of 3 earlier L2 builds");
  });
});

describe("duration", () => {
  it("says it as people do", () => {
    expect(duration(10_000)).toBe("1 min");
    expect(duration(45 * 60_000)).toBe("45 min");
    expect(duration(130 * 60_000)).toBe("2 h 10 min");
    expect(duration(2 * H)).toBe("2 h");
    expect(duration(76 * H)).toBe("3 d 4 h");
  });
});
