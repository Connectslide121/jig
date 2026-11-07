/**
 * Calibrated estimates (D-471, session 8's "never the AI's own guess"): how long a stage takes, measured
 * from the stages earlier runs finished: the median and the 80th percentile, with how many runs they
 * come from. Fewer than `MIN_MEASURED` measurements give no number at all. Pure.
 */

import type { Level, Run } from "./run";
import { isSample } from "./samples";

/** Measurements below this give no estimate: a person fills the number in. */
export const MIN_MEASURED = 3;

export interface Measurement {
  runId: string;
  track: string;
  level?: Level;
  stage: string;
  recipe: string;
  ms: number;
}

/** Every finished stage of real runs with its duration (started → ended), samples and skipped left out. */
export function measurements(runs: Run[]): Measurement[] {
  const out: Measurement[] = [];
  for (const r of runs) {
    if (isSample(r.id)) continue;
    for (const s of r.stages) {
      if (s.status !== "done" || !s.startedAt || !s.endedAt || s.recipe === "plan") continue;
      const ms = Date.parse(s.endedAt) - Date.parse(s.startedAt);
      if (!Number.isFinite(ms) || ms <= 0) continue;
      out.push({ runId: r.id, track: r.track, level: r.level, stage: s.id, recipe: s.recipe, ms });
    }
  }
  return out;
}

/** The p-th percentile (0–1) of a list, nearest rank; undefined when it is empty. */
export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * s.length));
  return s[Math.min(s.length, rank) - 1];
}

export interface Estimate {
  /** What it estimates ("Build at L2"). */
  label: string;
  /** How many measurements it comes from. */
  n: number;
  medianMs?: number;
  p80Ms?: number;
  /** "median of 6 earlier L2 builds", or why there's no number. */
  basis: string;
}

/**
 * A stage's estimate from earlier runs: the same recipe (`build`, or `demo-l2`), at the same level
 * when one is given, the run itself left out. No numbers below `MIN_MEASURED`.
 */
export function estimate(
  runs: Run[],
  q: { recipe: string; level?: Level; label: string; noun: string; exclude?: string },
): Estimate {
  const ms = measurements(runs)
    .filter((m) => m.recipe === q.recipe && (!q.level || m.level === q.level) && m.runId !== q.exclude)
    .map((m) => m.ms);
  const what = `${q.level ? `${q.level} ` : ""}${q.noun}`;
  if (ms.length < MIN_MEASURED)
    return {
      label: q.label,
      n: ms.length,
      basis: `not enough measured runs yet (${ms.length} earlier ${what}${ms.length === 1 ? "" : "s"}, ${MIN_MEASURED} needed)`,
    };
  const median = percentile(ms, 0.5);
  return {
    label: q.label,
    n: ms.length,
    medianMs: median,
    p80Ms: percentile(ms, 0.8),
    basis: `median of ${ms.length} earlier ${what}s`,
  };
}

/** A duration as people say it: "45 min", "2 h 10 min", "3 d 4 h". */
export function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** The estimates a change request's quote uses: the demo and the build at its level (D-471). */
export function quoteEstimates(runs: Run[], run: Pick<Run, "id" | "level">): Estimate[] {
  const level = run.level ?? "L1";
  return [
    estimate(runs, {
      recipe: `demo-${level.toLowerCase()}`,
      label: `Demo (${level})`,
      noun: "demo",
      exclude: run.id,
    }),
    estimate(runs, { recipe: "build", level, label: `Build (${level})`, noun: "build", exclude: run.id }),
  ];
}

/** Estimates as lines for a stage's brief: the numbers with their basis, or that a person fills them in. */
export function estimateLines(list: Estimate[]): string[] {
  return list.map((e) =>
    e.medianMs === undefined
      ? `- ${e.label}: TO FILL IN, ${e.basis}`
      : `- ${e.label}: ${duration(e.medianMs)} (80% of runs within ${duration(e.p80Ms ?? e.medianMs)}), ${e.basis}`,
  );
}
