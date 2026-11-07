/**
 * Tenders (D-471, pipeline.md → Tenders): the requirement matrix the tender analyst writes
 * (`tender/matrix.json`), its counts, and the recurring-gap report: the same unmet requirement
 * (by its `key`) across tenders, an investment decision rather than a per-tender chore. Pure.
 */

export const REQ_STATUSES = ["met", "not-met", "unknown", "flagged"] as const;
export type ReqStatus = (typeof REQ_STATUSES)[number];

export const REQ_STATUS: Record<
  ReqStatus,
  { label: string; tone: "success" | "danger" | "neutral" | "warning" }
> = {
  met: { label: "Met", tone: "success" },
  "not-met": { label: "Not met", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
  flagged: { label: "May not be required", tone: "warning" },
};

export interface Requirement {
  id: string;
  text: string;
  source: string;
  kind: "must" | "should";
  category: string;
  /** A stable name for requirements that come back (`cert:iso-27001`); `other` for one-offs. */
  key: string;
  status: ReqStatus;
  why: string;
}

export interface Matrix {
  tender: string;
  buyer: string;
  deadline: string;
  requirements: Requirement[];
}

const text = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The matrix from its JSON (tolerant: unknown statuses read as unknown); undefined when it isn't one. */
export function parseMatrix(json: string): Matrix | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { requirements?: unknown }).requirements))
    return undefined;
  const r = raw as Record<string, unknown> & { requirements: unknown[] };
  const requirements = r.requirements
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x, i): Requirement => {
      const status = (REQ_STATUSES as readonly string[]).includes(x.status as string)
        ? (x.status as ReqStatus)
        : "unknown";
      return {
        id: text(x.id, 20) || `R${i + 1}`,
        text: text(x.text),
        source: text(x.source, 200),
        kind: x.kind === "should" ? "should" : "must",
        category: text(x.category, 40) || "other",
        key: keyOf(x.key),
        status,
        why: text(x.why),
      };
    })
    .filter((x) => x.text);
  return {
    tender: text(r.tender, 200),
    buyer: text(r.buyer, 200),
    deadline: text(r.deadline, 20),
    requirements,
  };
}

/** A key as the report groups it: lower case, no spaces; `other` when there is none. */
export function keyOf(v: unknown): string {
  const k = text(v, 80).toLowerCase().replace(/\s+/g, "-");
  return k || "other";
}

export interface MatrixCounts extends Record<ReqStatus, number> {
  total: number;
  /** Must-requirements not met: what blocks a bid. */
  blocking: number;
}

export function counts(m: Matrix): MatrixCounts {
  const c: MatrixCounts = { met: 0, "not-met": 0, unknown: 0, flagged: 0, total: 0, blocking: 0 };
  for (const r of m.requirements) {
    c[r.status]++;
    c.total++;
    if (r.status === "not-met" && r.kind === "must") c.blocking++;
  }
  return c;
}

/** One tender's matrix, as the report reads it. */
export interface TenderMatrix {
  runId: string;
  title: string;
  /** When the run started (ISO): the report lists the newest first. */
  at: string;
  matrix: Matrix;
}

export interface RecurringGap {
  key: string;
  /** The requirement's words, from its newest tender. */
  text: string;
  /** How many of those tenders made it a must. */
  must: number;
  tenders: Array<{ runId: string; title: string; at: string; status: ReqStatus }>;
}

/**
 * The recurring-gap report: requirements not met (or unknown) under the same key in two or more
 * tenders, the most frequent first. One-offs (`other`) never recur.
 */
export function recurringGaps(list: TenderMatrix[], min = 2): RecurringGap[] {
  const by = new Map<string, RecurringGap>();
  for (const t of [...list].sort((a, b) => b.at.localeCompare(a.at))) {
    const seen = new Set<string>();
    for (const r of t.matrix.requirements) {
      if (r.key === "other" || (r.status !== "not-met" && r.status !== "unknown") || seen.has(r.key))
        continue;
      seen.add(r.key);
      const g = by.get(r.key) ?? { key: r.key, text: r.text, must: 0, tenders: [] };
      g.tenders.push({ runId: t.runId, title: t.title, at: t.at, status: r.status });
      if (r.kind === "must") g.must++;
      by.set(r.key, g);
    }
  }
  return [...by.values()]
    .filter((g) => g.tenders.length >= min)
    .sort((a, b) => b.tenders.length - a.tenders.length || b.must - a.must || a.key.localeCompare(b.key));
}

/** Earlier tenders' gaps for the gap report's brief: every gap key with the tenders that had it. */
export function earlierGapLines(list: TenderMatrix[]): string[] {
  const gaps = recurringGaps(list, 1);
  if (!gaps.length) return ["- none: this is the first tender with a matrix"];
  return gaps
    .slice(0, 40)
    .map(
      (g) =>
        `- ${g.key} (${g.text}): ${g.tenders.length} earlier tender${g.tenders.length === 1 ? "" : "s"}: ${g.tenders.map((t) => t.title).join(", ")}`,
    );
}
