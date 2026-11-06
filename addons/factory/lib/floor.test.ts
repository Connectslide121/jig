import { describe, expect, it } from "vitest";
import track from "../tracks/new-idea.json";
import { duration, graphBoxes, kpis, LANES, laneOf, progress, since } from "./floor";
import type { Track } from "./graph";
import { isSample, SAMPLE_PREFIX, sampleMarkdown, sampleRuns } from "./samples";

const NOW = Date.UTC(2026, 0, 10, 12, 0);
const samples = sampleRuns("p1", NOW);
const byTitle = (title: string) => samples.find((r) => r.title === title)!;

describe("lanes", () => {
  it("puts each sample run in its lane, one or more per lane but Launch", () => {
    expect(Object.fromEntries(samples.map((r) => [r.title, laneOf(r)]))).toEqual({
      "Guest check-in": "interview",
      "Shift swap": "demo",
      "Route planner": "review",
      "Invoice reminders": "review",
      "Sales course pack": "pack",
      Waitlist: "done",
    });
    expect(LANES.map((l) => l.title)).toEqual(["Interview", "Demo", "Review", "Pack", "Launch", "Done"]);
  });

  it("moves a run to Launch once it builds or publishes, and to Done when stopped", () => {
    const r = byTitle("Sales course pack");
    expect(laneOf({ ...r, gates: [...r.gates, { id: "G5", status: "waiting", revisions: 0 }] })).toBe(
      "launch",
    );
    expect(laneOf({ ...r, state: "stopped" })).toBe("done");
    expect(laneOf({ ...r, state: "planning" })).toBe("interview");
    expect(
      laneOf({
        ...byTitle("Route planner"),
        stages: [],
        gates: [{ id: "G1", status: "approved", revisions: 0 }],
      }),
    ).toBe("pack");
  });
});

describe("progress", () => {
  it("says what each card's ring means", () => {
    expect(progress(byTitle("Guest check-in"))).toEqual({ value: 7 / 12, label: "coverage 7/12" });
    expect(progress(byTitle("Shift swap")).label).toBe("v2 · building");
    expect(progress(byTitle("Route planner"))).toEqual({ value: 1, label: "demo v1" });
    expect(progress(byTitle("Sales course pack"))).toEqual({ value: 9 / 11, label: "9 / 11 outputs" });
    expect(progress(byTitle("Waitlist"))).toEqual({ value: 1, label: "4 outputs" });
    expect(progress({ ...byTitle("Waitlist"), state: "stopped" }).label).toBe("stopped");
  });

  it("handles an interview without a brief yet", () => {
    expect(progress({ ...byTitle("Guest check-in"), brief: undefined })).toEqual({
      value: 0,
      label: "coverage 0/0",
    });
  });
});

describe("times", () => {
  it("writes durations the way the cards do", () => {
    const at = (m: number) => new Date(NOW - m * 60_000).toISOString();
    expect(since(at(25), NOW)).toBe("25 m");
    expect(since(at(60), NOW)).toBe("1 h");
    expect(since(at(220), NOW)).toBe("3 h 40 m");
    expect(since(at(125), NOW)).toBe("2 h 05 m");
    expect(since(at(1440), NOW)).toBe("1 d");
    expect(since(at(1560), NOW)).toBe("1 d 2 h");
    expect(since(new Date(NOW + 5000).toISOString(), NOW)).toBe("0 m");
    expect(duration(250)).toBe("4 h 10 m");
  });
});

describe("kpis", () => {
  it("counts running runs, what waits for you, idea → demo and approvals as is", () => {
    const k = kpis(samples);
    expect(k.running).toBe(5);
    expect(k.waitingForYou).toBe(2);
    expect(k.ideaToDemo).toBeGreaterThan(0);
    expect(k.approvedAsIs).toBeGreaterThan(0.5);
    expect(k.approvedAsIs).toBeLessThan(1);
    expect(kpis([])).toEqual({
      running: 0,
      waitingForYou: 0,
      ideaToDemo: undefined,
      approvedAsIs: undefined,
    });
  });
});

describe("samples", () => {
  it("prefixes every sample id and keeps them unique", () => {
    expect(samples.every((r) => isSample(r.id) && r.id.startsWith(SAMPLE_PREFIX))).toBe(true);
    expect(new Set(samples.map((r) => r.id)).size).toBe(samples.length);
    expect(isSample("fx-abc")).toBe(false);
  });

  it("writes Markdown with front-matter that says it's a draft by Jig", () => {
    const r = byTitle("Sales course pack");
    const md = sampleMarkdown(r, r.outputs.find((o) => o.kind === "pitch")!);
    expect(md.startsWith("---\nstatus: draft\nversion: 1\n")).toBe(true);
    expect(md).toContain("# Sales course pack · pitch");
    expect(md).toContain("Draft by Jig");
  });
});

describe("graphBoxes", () => {
  const boxes = (title: string) =>
    Object.fromEntries(
      graphBoxes(byTitle(title), track as Track).map((b) => [
        b.id,
        `${b.status}${b.detail ? ` ${b.detail}` : ""}`,
      ]),
    );

  it("shows how far each stage and gate got, in the track's order", () => {
    const b = boxes("Shift swap");
    expect(b.S1).toBe("done");
    expect(b.G0).toBe("done");
    expect(b.S5).toBe("running v2");
    expect(b.G1).toBe("changes");
    expect(b.S7).toBe("pending");
    expect(Object.keys(b)[0]).toBe("S1");
  });

  it("sums a fan-out and marks it when one of its stages asks you", () => {
    expect(boxes("Sales course pack").S7).toBe("needs-you 9/11");
    expect(boxes("Sales course pack").G4).toBe("waiting");
  });
});
