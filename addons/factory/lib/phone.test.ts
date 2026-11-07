import { describe, expect, it } from "vitest";
import { DONE_FRESH_MS, settledText, subjectOf, tapOf, wantedCards } from "./phone";
import type { Output, Run, StageRun } from "./run";

const T0 = Date.UTC(2026, 0, 1, 9);
const at = (m: number) => new Date(T0 + m * 60_000).toISOString();

function run(extra: Partial<Run> = {}): Run {
  return {
    id: "r1",
    slug: "shift-swap",
    title: "Shift swap",
    projectId: "p1",
    track: "new-idea",
    languages: {},
    state: "waiting",
    owners: {},
    stages: [],
    outputs: [],
    gates: [],
    createdAt: at(0),
    updatedAt: at(0),
    source: { kind: "typed" },
    ...extra,
  };
}

const out = (
  id: string,
  kind: string,
  path: string,
  version = 1,
  status: Output["status"] = "draft",
): Output => ({
  id,
  kind,
  path,
  version,
  status,
  history: [],
});

const stage = (id: string, extra: Partial<StageRun> = {}): StageRun => ({
  id,
  recipe: id,
  status: "running",
  attempt: 1,
  ...extra,
});

const title = (s: StageRun) => `The ${s.id}`;

describe("wantedCards", () => {
  it("sends the demo gate with its latest version, Approve, Ask for changes (a reply) and Open", () => {
    const cards = wantedCards(
      run({
        gates: [{ id: "G1", status: "waiting", revisions: 1 }],
        outputs: [
          out("d1", "demo", "demo/v1/index.html", 1, "superseded"),
          out("d2", "demo", "demo/v2/index.html", 2),
        ],
      }),
      title,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "gate:G1", demo: 2 });
    expect(cards[0]?.text).toContain("**Shift swap** · Demo v2 is ready");
    expect(cards[0]?.buttons.map((b) => [b.id, !!b.reply])).toEqual([
      ["approve", false],
      ["changes", true],
      ["open", false],
    ]);
  });

  it("leaves out gates someone else owns (they get a board card) and closed ones", () => {
    const cards = wantedCards(
      run({
        owners: { G4: { kind: "person", name: "Alex" } },
        gates: [
          { id: "G2", status: "approved", revisions: 0 },
          { id: "G4", status: "waiting", revisions: 0 },
        ],
      }),
      title,
    );
    expect(cards).toEqual([]);
  });

  it("lists a docs gate's outputs still to review, not their files, at most eight", () => {
    const outputs = Array.from({ length: 10 }, (_, i) => out(`s${i}`, "spec", `docs/spec-${i}.md`));
    outputs.push(
      out("pdf", "spec-file", "docs/spec-0.pdf"),
      out("ok", "glossary", "docs/glossary.md", 1, "approved"),
    );
    const [card] = wantedCards(
      run({ gates: [{ id: "G2", status: "waiting", revisions: 0 }], outputs }),
      title,
    );
    expect(card?.text).toContain("Docs review waits for you");
    expect(card?.text).toContain("• spec-7.md\n• and 2 more");
    expect(card?.text).not.toContain("spec-0.pdf");
    expect(card?.text).not.toContain("glossary");
  });

  it("asks you to pick a direction in Jig: only Open", () => {
    const [card] = wantedCards(run({ gates: [{ id: "GD", status: "waiting", revisions: 0 }] }), title);
    expect(card?.buttons.map((b) => b.id)).toEqual(["open"]);
  });

  it("puts a stage's one question on the card with an Answer reply button", () => {
    const [card] = wantedCards(
      run({
        stages: [stage("interview", { status: "needs-you" })],
        questions: [
          {
            id: "q1",
            stage: "interview",
            round: 1,
            text: "Who approves?",
            suggestion: "The planner",
            askedAt: at(1),
          },
          { id: "q0", stage: "interview", round: 1, text: "Old", askedAt: at(0), answer: "x" },
        ],
      }),
      title,
    );
    expect(card?.key).toBe("ask:interview");
    expect(card?.text).toContain("needs you · The interview\n\nWho approves?\n\n*Suggested:* The planner");
    expect(card?.buttons.map((b) => b.id)).toEqual(["answer", "open"]);
  });

  it("sends several questions to Jig, and a stage's own question as an Answer", () => {
    const many = wantedCards(
      run({
        stages: [stage("interview", { status: "needs-you" })],
        questions: [
          { id: "q1", stage: "interview", round: 1, text: "A?", askedAt: at(1) },
          { id: "q2", stage: "interview", round: 1, text: "B?", askedAt: at(1) },
        ],
      }),
      title,
    )[0];
    expect(many?.text).toContain("Answer them in Jig.");
    expect(many?.buttons.map((b) => b.id)).toEqual(["open"]);
    const asked = wantedCards(
      run({ stages: [stage("spec", { status: "needs-you", question: "Which API?" })] }),
      title,
    )[0];
    expect(asked?.text).toContain("Which API?");
    expect(asked?.buttons.map((b) => b.id)).toEqual(["answer", "open"]);
  });

  it("says why a run is stuck", () => {
    const [card] = wantedCards(run({ state: "stuck", stages: [stage("deck", { status: "failed" })] }), title);
    expect(card).toMatchObject({ key: "stuck" });
    expect(card?.text).toContain("The deck failed after its retries.");
  });

  it("sends 'is done' only soon after a run finished, and nothing for a stopped run", () => {
    const done = run({
      state: "done",
      updatedAt: at(0),
      outputs: [out("a", "spec", "spec.md", 1, "approved"), out("b", "spec-file", "spec.pdf", 1, "approved")],
    });
    expect(wantedCards(done, title, T0 + 60_000)[0]?.text).toContain("1 output approved.");
    expect(wantedCards(done, title, T0 + DONE_FRESH_MS + 1)).toEqual([]);
    expect(
      wantedCards(run({ state: "stopped", gates: [{ id: "G1", status: "waiting", revisions: 0 }] }), title),
    ).toEqual([]);
  });
});

describe("settledText", () => {
  const id = (s: string) => `The ${s}`;
  it("says how a gate was decided", () => {
    const r = run({ gates: [{ id: "G1", status: "approved", revisions: 0 }] });
    expect(settledText(r, "gate:G1", id)).toBe("**Shift swap** · Demo review\n\n✅ Approved");
    const c = run({ gates: [{ id: "G1", status: "changes", revisions: 1 }] });
    expect(settledText(c, "gate:G1", id)).toContain("Changes asked");
    const again = run({ gates: [{ id: "G1", status: "closed", revisions: 1, note: "Bigger" }] });
    expect(settledText(again, "gate:G1", id)).toContain("✏️ Changes asked: Bigger");
  });
  it("says answered, moving again, or stopped", () => {
    expect(settledText(run(), "ask:spec", id)).toContain("The spec\n\n✅ Answered");
    expect(settledText(run(), "stuck", id)).toContain("Moving again");
    expect(settledText(run({ state: "stopped" }), "ask:spec", id)).toContain("stopped");
  });
});

describe("subjectOf and tapOf", () => {
  it("reads the keys", () => {
    expect(subjectOf("gate:G4m")).toEqual({ kind: "gate", gate: "G4m" });
    expect(subjectOf("ask:deck-images")).toEqual({ kind: "ask", stage: "deck-images" });
    expect(subjectOf("done")).toEqual({ kind: "done" });
    expect(subjectOf("gate:G9")).toBeUndefined();
  });
  it("turns taps into decisions and answers; a reply button needs its text", () => {
    expect(tapOf("gate:G1", "approve")).toEqual({ kind: "decide", gate: "G1", decision: "approve" });
    expect(tapOf("gate:G1", "changes", " Bigger button ")).toEqual({
      kind: "decide",
      gate: "G1",
      decision: "changes",
      note: "Bigger button",
    });
    expect(tapOf("gate:G1", "changes")).toBeUndefined();
    expect(tapOf("ask:spec", "answer", "REST")).toEqual({ kind: "answer", stage: "spec", text: "REST" });
    expect(tapOf("done", "open")).toEqual({ kind: "open" });
    expect(tapOf("done", "approve")).toBeUndefined();
  });
});
