import { describe, expect, it } from "vitest";
import {
  filesOf,
  groupLabel,
  inbox,
  isMine,
  mainKind,
  median,
  mineCount,
  outputName,
  ownerName,
  ownerOf,
  retriesLeft,
  reviewerOf,
  revisionsLeft,
  trust,
  trustByKind,
  waitsForMe,
} from "./gates";
import type { Output, Run } from "./run";
import { sampleRuns } from "./samples";

const NOW = Date.UTC(2026, 0, 10, 12, 0);
const samples = sampleRuns("p1", NOW);
const byTitle = (title: string) => samples.find((r) => r.title === title)!;

describe("owners and caps", () => {
  it("maps output kinds to the gate that reviews them", () => {
    expect(reviewerOf("demo")).toBe("G1");
    expect(reviewerOf("spec")).toBe("G2");
    expect(reviewerOf("pitch")).toBe("G4");
    expect(reviewerOf("newsletter")).toBe("G4m");
    expect(reviewerOf("something-new")).toBe("G2");
    expect(reviewerOf("deck-file")).toBe("G4");
    expect(reviewerOf("demo-file")).toBe("G1");
    expect(mainKind("teaser-file")).toBe("teaser");
  });

  it("makes you the owner unless the plan picked someone", () => {
    const r = byTitle("Sales course pack");
    expect(ownerOf(r, "G1")).toEqual({ kind: "me" });
    expect(ownerOf(r, "G4")).toEqual({ kind: "person", name: "Sales lead" });
    expect(isMine(ownerOf(r, "G1"))).toBe(true);
    expect(ownerName({ kind: "me" })).toBe("You");
    expect(ownerName({ kind: "person" })).toBe("Someone");
  });

  it("counts the revisions and retries left", () => {
    const r = byTitle("Invoice reminders");
    expect(revisionsLeft(r, "G1")).toBe(2);
    expect(revisionsLeft(r, "G2")).toBe(3);
    expect(revisionsLeft(r, "G1", 1)).toBe(0);
    expect(retriesLeft(r, "S1")).toBe(1);
    expect(retriesLeft(r, "S9")).toBe(2);
  });
});

describe("inbox", () => {
  const items = inbox(samples);

  it("lists what waits for a person across runs, grouped, questions first", () => {
    expect(items.map((i) => `${i.group} ${i.runTitle} ${i.label}`)).toEqual([
      "ask Sales course pack Marketing asks you",
      "G1 Invoice reminders Demo v2",
      "G1 Route planner Demo v1",
      "G4 Sales course pack Pitch v1",
      "G4 Sales course pack Sales course v1",
    ]);
  });

  it("keeps who owns each row, and counts yours for the top bar", () => {
    expect(items.find((i) => i.runTitle === "Invoice reminders")?.owner.name).toBe("Customer contact");
    expect(mineCount(items)).toBe(2);
    expect(waitsForMe(byTitle("Route planner"))).toBe(true);
    expect(waitsForMe(byTitle("Invoice reminders"))).toBe(false);
    expect(waitsForMe(byTitle("Waitlist"))).toBe(false);
  });

  it("calls a waiting Plan step Plan the run", () => {
    const r = byTitle("Route planner");
    const planned: Run = {
      ...r,
      outputs: [],
      gates: [],
      stages: [
        { id: "S3", recipe: "plan", status: "needs-you", version: 1, attempt: 1, startedAt: r.createdAt },
      ],
    };
    expect(inbox([planned])).toMatchObject([{ kind: "ask", label: "Plan the run", stageId: "S3" }]);
  });

  it("shows a waiting gate without outputs as one row", () => {
    const r: Run = { ...byTitle("Route planner"), outputs: [] };
    expect(inbox([r])).toMatchObject([{ kind: "gate", label: "Demo review", status: "waiting" }]);
  });

  it("shows a run out of revisions as needing a person", () => {
    const r: Run = {
      ...byTitle("Shift swap"),
      state: "stuck",
    };
    expect(inbox([r])).toMatchObject([
      { group: "stuck", label: "Demo review: out of revisions", status: "stuck" },
    ]);
    expect(groupLabel("stuck")).toBe("Needs a person");
    expect(groupLabel("ask")).toBe("Questions");
    expect(groupLabel("G4m")).toBe("Marketing");
  });
});

describe("trust", () => {
  const o = (history: [Output["status"], number, boolean?][]): Output => ({
    id: "x",
    kind: "spec",
    path: "spec.md",
    version: 1,
    status: history[history.length - 1]![0],
    history: history.map(([status, min, edited]) => ({
      status,
      by: status === "draft" ? "jig" : "me",
      at: new Date(NOW + min * 60_000).toISOString(),
      edited: !!edited,
    })),
  });

  it("counts approvals without edits and the median review time", () => {
    const t = trust([
      o([
        ["draft", 0],
        ["approved", 10],
      ]),
      o([
        ["draft", 0],
        ["approved", 30, true],
      ]),
      o([
        ["draft", 0],
        ["rejected", 20],
      ]),
      o([["draft", 0]]),
    ]);
    expect(t).toEqual({ decided: 3, approvedAsIs: 1, rate: 1 / 3, reviewMinutes: 20 });
    expect(trust([])).toEqual({ decided: 0, approvedAsIs: 0, rate: undefined, reviewMinutes: undefined });
  });

  it("counts per kind, most decided first, a stage's files with their output (D-467)", () => {
    const spec = o([
      ["draft", 0],
      ["approved", 10],
    ]);
    const deck = {
      ...spec,
      id: "d",
      kind: "deck",
      history: [...spec.history.slice(0, 1), { ...spec.history[1]!, edited: true }],
    };
    const file = { ...spec, id: "f", kind: "deck-file" };
    const rows = trustByKind([spec, { ...spec, id: "s2" }, deck, file, o([["draft", 0]])]);
    expect(rows.map((r) => [r.kind, r.decided, r.approvedAsIs])).toEqual([
      ["spec", 2, 2],
      ["deck", 1, 0],
    ]);
  });

  it("takes the median of odd and even lists", () => {
    expect(median([])).toBeUndefined();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("a stage's files", () => {
  it("go with their main output: not their own inbox rows, found by stage and version", () => {
    const base = byTitle(samples[0]!.title);
    const out = (id: string, kind: string, version = 1): Output => ({
      id,
      kind,
      stage: "S7:deck",
      path: `${id}.md`,
      version,
      status: "draft",
      history: [{ status: "draft", by: "jig", at: new Date(NOW).toISOString(), edited: false }],
    });
    const run: Run = {
      ...base,
      state: "waiting",
      gates: [{ id: "G4", status: "waiting", at: new Date(NOW).toISOString(), history: [] } as never],
      outputs: [out("deck-v1", "deck"), out("deck-v1-pdf", "deck-file"), out("deck-v0-pdf", "deck-file", 0)],
      stages: [],
    };
    expect(inbox([run]).map((i) => i.outputId)).toEqual(["deck-v1"]);
    expect(filesOf(run, run.outputs[0]!).map((f) => f.id)).toEqual(["deck-v1-pdf"]);
  });
});

describe("outputName", () => {
  it("names an output by its kind and version, and keeps an unknown kind readable", () => {
    expect(outputName({ kind: "demo", version: 2 })).toBe("Demo v2");
    expect(outputName({ kind: "course-sales", version: 1 })).toBe("Sales course v1");
    expect(outputName({ kind: "faq", version: 3 })).toBe("Faq v3");
  });
});
