import { describe, expect, it } from "vitest";
import { counts, earlierGapLines, keyOf, parseMatrix, recurringGaps, type TenderMatrix } from "./tenders";

const matrix = (reqs: unknown[]) => JSON.stringify({ tender: "T", buyer: "B", requirements: reqs });

describe("parseMatrix", () => {
  it("reads requirements tolerantly", () => {
    const m = parseMatrix(
      matrix([
        {
          id: "R1",
          text: "ISO 27001",
          kind: "must",
          category: "company",
          key: "cert:ISO 27001",
          status: "not-met",
        },
        { text: "Swedish UI", kind: "should", status: "maybe" },
        { id: "R3" },
        "nonsense",
      ]),
    );
    expect(m?.requirements).toEqual([
      {
        id: "R1",
        text: "ISO 27001",
        source: "",
        kind: "must",
        category: "company",
        key: "cert:iso-27001",
        status: "not-met",
        why: "",
      },
      {
        id: "R2",
        text: "Swedish UI",
        source: "",
        kind: "should",
        category: "other",
        key: "other",
        status: "unknown",
        why: "",
      },
    ]);
    expect(m?.tender).toBe("T");
  });
  it("is undefined for anything else", () => {
    expect(parseMatrix("not json")).toBeUndefined();
    expect(parseMatrix("{}")).toBeUndefined();
    expect(parseMatrix("null")).toBeUndefined();
  });
});

describe("keyOf and counts", () => {
  it("normalises keys", () => {
    expect(keyOf(" Turnover ")).toBe("turnover");
    expect(keyOf(undefined)).toBe("other");
  });
  it("counts per status and the blocking ones", () => {
    const m = parseMatrix(
      matrix([
        { text: "a", status: "met" },
        { text: "b", status: "not-met", kind: "must" },
        { text: "c", status: "not-met", kind: "should" },
        { text: "d", status: "flagged" },
      ]),
    );
    expect(m && counts(m)).toEqual({ met: 1, "not-met": 2, unknown: 0, flagged: 1, total: 4, blocking: 1 });
  });
});

const tender = (runId: string, at: string, reqs: Array<Record<string, unknown>>): TenderMatrix => ({
  runId,
  title: `Tender ${runId}`,
  at,
  matrix: parseMatrix(matrix(reqs)) ?? { tender: "", buyer: "", deadline: "", requirements: [] },
});

describe("recurringGaps", () => {
  const list = [
    tender("a", "2026-01-01", [
      { text: "ISO 27001 (old words)", key: "cert:iso-27001", status: "not-met", kind: "must" },
      { text: "Turnover", key: "turnover", status: "met" },
      { text: "One-off", key: "other", status: "not-met" },
    ]),
    tender("b", "2026-03-01", [
      { text: "ISO 27001 certified", key: "cert:iso-27001", status: "not-met", kind: "must" },
      { text: "ISO 27001 again", key: "cert:iso-27001", status: "not-met" },
      { text: "Turnover 50M", key: "turnover", status: "unknown", kind: "should" },
      { text: "One-off", key: "other", status: "not-met" },
    ]),
    tender("c", "2026-02-01", [{ text: "Turnover", key: "turnover", status: "not-met", kind: "should" }]),
  ];
  it("groups unmet requirements by key across tenders, the most frequent first", () => {
    const gaps = recurringGaps(list);
    expect(gaps.map((g) => [g.key, g.tenders.length, g.must])).toEqual([
      ["cert:iso-27001", 2, 2],
      ["turnover", 2, 0],
    ]);
    expect(gaps[0]?.text).toBe("ISO 27001 certified");
    expect(gaps[0]?.tenders.map((t) => t.runId)).toEqual(["b", "a"]);
  });
  it("lists earlier gaps for the gap report, or says it is the first", () => {
    expect(earlierGapLines([])).toEqual(["- none: this is the first tender with a matrix"]);
    expect(earlierGapLines(list.slice(0, 1))).toEqual([
      "- cert:iso-27001 (ISO 27001 (old words)): 1 earlier tender: Tender a",
    ]);
  });
});
