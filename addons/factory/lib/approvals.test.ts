import { describe, expect, it } from "vitest";
import { againText, BY_BOARD, boardSteps, cardDescription, cardTitle, readCard } from "./approvals";
import type { BoardCard, GateState, Run } from "./run";

const AT = "2026-01-01T09:00:00.000Z";
const BOARD = { boardId: "b1", name: "Shop · Stories", type: "User Story" };
const CARD: BoardCard = {
  id: 42,
  url: "https://dev.azure.com/contoso/Shop/_workitems/edit/42",
  round: 0,
  seen: 0,
};

function run(gates: GateState[], extra: Partial<Run> = {}): Run {
  return {
    id: "shift-swap",
    slug: "shift-swap",
    title: "Shift swap",
    projectId: "p1",
    track: "new-idea",
    languages: {},
    state: "waiting",
    owners: { G1: { kind: "person", name: "Customer contact" }, G2: { kind: "me" } },
    stages: [],
    outputs: [],
    gates,
    createdAt: AT,
    updatedAt: AT,
    source: { kind: "typed" },
    plan: {
      outputs: ["spec"],
      build: false,
      permissionMode: "acceptEdits",
      productExists: true,
      approvals: BOARD,
    },
    ...extra,
  };
}

const gate = (
  id: GateState["id"],
  status: GateState["status"],
  extra: Partial<GateState> = {},
): GateState => ({
  id,
  status,
  revisions: 0,
  ...extra,
});

describe("boardSteps", () => {
  it("makes a card for a waiting gate a person owns, never for yours or without a board", () => {
    const r = run([gate("G1", "waiting"), gate("G2", "waiting")]);
    expect(boardSteps(r)).toEqual([{ kind: "create", gate: "G1", owner: "Customer contact" }]);
    expect(boardSteps({ ...r, plan: { ...r.plan!, approvals: undefined } })).toEqual([]);
  });

  it("leaves GD in Jig: picking a direction needs it", () => {
    const r = run([gate("GD", "waiting")], { owners: { GD: { kind: "person", name: "Designer" } } });
    expect(boardSteps(r)).toEqual([]);
  });

  it("reads a card, and says when the gate waits again after changes", () => {
    expect(boardSteps(run([gate("G1", "waiting", { card: CARD })]))).toEqual([
      { kind: "poll", gate: "G1", card: CARD },
    ]);
    expect(boardSteps(run([gate("G1", "waiting", { revisions: 1, card: CARD })]))).toEqual([
      { kind: "again", gate: "G1", card: CARD },
    ]);
    expect(boardSteps(run([gate("G1", "changes", { revisions: 1, card: CARD })]))).toEqual([]);
    expect(boardSteps(run([gate("G1", "closed", { revisions: 1, card: CARD })]))).toEqual([]);
  });

  it("closes the card when the gate is settled: a comment unless it was the board's own decision", () => {
    expect(boardSteps(run([gate("G1", "approved", { decidedBy: "me", card: CARD })]))).toEqual([
      { kind: "close", gate: "G1", card: CARD, text: "Approved in Jig." },
    ]);
    expect(
      boardSteps(run([gate("G1", "approved", { decidedBy: `${BY_BOARD}Customer contact`, card: CARD })])),
    ).toEqual([{ kind: "close", gate: "G1", card: CARD }]);
    expect(boardSteps(run([gate("G1", "waiting", { card: CARD })], { state: "stopped" }))).toEqual([
      { kind: "close", gate: "G1", card: CARD, text: "The run was stopped in Jig." },
    ]);
  });
});

describe("readCard", () => {
  const c = (text: string, at = AT) => ({ by: "Customer contact", at, text });
  it("approves a done card, asks for changes from a new 'changes:' comment first", () => {
    expect(readCard({ done: true, comments: [] }, CARD)).toEqual({ decision: { kind: "approve" }, seen: 0 });
    expect(readCard({ done: false, comments: [c("Looks fine so far")] }, CARD)).toEqual({ seen: 1 });
    expect(readCard({ done: true, comments: [c("Changes: bigger buttons\nand a logo")] }, CARD)).toEqual({
      decision: { kind: "changes", note: "bigger buttons\nand a logo", by: "Customer contact" },
      seen: 1,
    });
  });
  it("ignores comments it has read and an empty 'changes:'", () => {
    expect(readCard({ done: false, comments: [c("changes: old")] }, { ...CARD, seen: 1 })).toEqual({
      seen: 1,
    });
    expect(readCard({ done: false, comments: [c("changes:  ")] }, CARD)).toEqual({ seen: 1 });
  });
});

describe("card text", () => {
  it("names the run and gate and says how to decide", () => {
    const r = run([gate("G1", "waiting")]);
    expect(cardTitle(r, "G1")).toBe("Shift swap · Demo review");
    const d = cardDescription(r, "G1", { done: "Closed" });
    expect(d).toContain("move this card to Closed");
    expect(d).toContain('"changes:"');
    expect(againText(r, "G1")).toContain("round 1");
  });
});
