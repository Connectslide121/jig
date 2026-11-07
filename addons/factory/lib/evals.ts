/**
 * Recipe evals (D-472): a golden brief run up to its quality gate, scored by the critic, then compared
 * per recipe version (the demo recipe's and the critic's own content hashes). Jig decides the eval
 * run's gates itself and stops it when the quality gate settles. Pure.
 */
import type { GateId, Run } from "./run";

export interface EvalResult {
  runId: string;
  /** The golden brief (`fixtures/briefs/<id>.md`). */
  brief: string;
  title: string;
  level?: string;
  /** The recipes it used, recipe id → short content hash (`demo-l2` → `3fa9c210`). */
  recipes: Record<string, string>;
  /** The critic's last score (0–100), when it gave one. */
  score?: number;
  pass: boolean;
  /** How many demo versions it took (1 when the first passed). */
  rounds: number;
  ms: number;
  at: string;
  /** Why it ended early, when it did (a stage needs a person, it failed). */
  note?: string;
}

/** The recipes an eval compares: the demo at its level and the critic. */
export function evalRecipes(level: string | undefined): string[] {
  return [`demo-${(level ?? "L1").toLowerCase()}`, "critique"];
}

/** The gates Jig decides on an eval run now: the scout's (G0) and, for a new brand, the first direction (GD). */
export function evalDecisions(run: Run): Array<{ gate: GateId; direction?: string }> {
  if (!run.eval || run.state === "stopped" || run.state === "done") return [];
  return run.gates
    .filter((g) => g.status === "waiting" && (g.id === "G0" || g.id === "GD"))
    .map((g) => (g.id === "GD" ? { gate: g.id, direction: "first" } : { gate: g.id }));
}

/**
 * Whether an eval run is over, and its result: the quality gate settled (G1 opened), or it can't go on
 * without a person (a stage needs you or failed, the run is stuck).
 */
export function evalOutcome(run: Run, now: string): EvalResult | undefined {
  if (!run.eval) return undefined;
  const g1 = run.gates.find((g) => g.id === "G1");
  const blocked = run.stages.find((s) => s.status === "needs-you" || s.status === "failed");
  const settled = (g1 && g1.status !== "closed") || run.state === "stuck" || blocked;
  if (!settled) return undefined;
  const critic = run.stages.find((s) => s.id === "S6");
  const quality = critic?.status === "done" ? critic.report?.quality : undefined;
  const demo = run.stages.find((s) => s.id === "S5");
  return {
    runId: run.id,
    brief: run.eval.brief,
    title: run.title,
    level: run.level,
    recipes: run.eval.recipes,
    score: quality?.score,
    pass: !!quality?.pass && !blocked,
    rounds: demo?.version ?? 0,
    ms: Math.max(0, Date.parse(now) - Date.parse(run.createdAt)),
    at: now,
    note: blocked
      ? `${blocked.id} ${blocked.status === "failed" ? "failed" : "needs a person"}${blocked.question ? `: ${blocked.question}` : ""}`
      : run.state === "stuck" && !g1
        ? "The run got stuck"
        : undefined,
  };
}

/** A recipe version's eval numbers, and how its average score moved from the version before. */
export interface EvalRow {
  /** The demo recipe it compares (`demo-l2`). */
  recipe: string;
  /** The demo recipe's and the critic's short hashes: "3fa9c210 · critic 0b1c2d3e". */
  version: string;
  n: number;
  passed: number;
  avgScore?: number;
  avgRounds: number;
  /** Average score minus the previous version's of the same recipe; undefined for the first. */
  trend?: number;
  /** The newest result's time. */
  last: string;
}

/** The results grouped per recipe version, oldest version first within each recipe. */
export function evalTable(results: EvalResult[]): EvalRow[] {
  const groups = new Map<string, EvalResult[]>();
  for (const r of [...results].sort((a, b) => a.at.localeCompare(b.at))) {
    const recipe = Object.keys(r.recipes).find((k) => k.startsWith("demo-")) ?? "demo";
    const key = `${recipe}\u0000${r.recipes[recipe] ?? "?"}\u0000${r.recipes.critique ?? "?"}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const rows: EvalRow[] = [];
  const lastAvg = new Map<string, number | undefined>();
  for (const [key, list] of groups) {
    const [recipe = "demo", demoHash = "?", criticHash = "?"] = key.split("\u0000");
    const scores = list.map((r) => r.score).filter((s): s is number => typeof s === "number");
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
    const before = lastAvg.get(recipe);
    rows.push({
      recipe,
      version: `${demoHash} · critic ${criticHash}`,
      n: list.length,
      passed: list.filter((r) => r.pass).length,
      avgScore,
      avgRounds: list.reduce((a, r) => a + r.rounds, 0) / list.length,
      trend: before !== undefined && avgScore !== undefined ? avgScore - before : undefined,
      last: list[list.length - 1]?.at ?? "",
    });
    if (avgScore !== undefined) lastAvg.set(recipe, avgScore);
  }
  return rows.sort((a, b) => a.recipe.localeCompare(b.recipe));
}

/** Eval results kept: the newest 200. */
export const EVALS_MAX = 200;
