/**
 * The factory report (D-472): what the factory did in a project, measured from its runs, never guessed.
 * Runs by track and state, how long each stage takes, the critic's scores and rounds, how much of what
 * Jig drafts people approve as written, and gates that could be lighter on that evidence (suggestions
 * only: nothing changes by itself). `reportHtml` renders it as one self-contained page for Pages. Pure.
 */
import { duration, measurements, percentile } from "./estimates";
import { type EvalResult, type EvalRow, evalTable } from "./evals";
import { reviewerOf, trustByKind } from "./gates";
import type { Run } from "./run";
import { isSample } from "./samples";

/** Below this many decisions a kind's approval rate says nothing yet. */
export const MIN_DECIDED = 5;
/** Approved as written this often, a kind could take a lighter review. */
export const LIGHTER_AT = 0.9;
/** Approved as written less often than this, the kind's recipe needs work. */
export const RECIPE_WORK_BELOW = 0.5;

export interface StageTime {
  recipe: string;
  n: number;
  medianMs: number;
  p80Ms: number;
}

export interface KindTrust {
  kind: string;
  gate?: string;
  decided: number;
  approvedAsIs: number;
  rate?: number;
  reviewMinutes?: number;
}

export interface Report {
  runs: number;
  byTrack: Array<{ track: string; n: number }>;
  byState: Array<{ state: string; n: number }>;
  stages: StageTime[];
  critic: {
    /** Runs whose quality gate settled. */
    n: number;
    /** Of those, how many passed on the first demo. */
    firstPass: number;
    avgScore?: number;
    avgRounds?: number;
  };
  trust: KindTrust[];
  /** Gates that could change on the evidence: never applied by Jig. */
  suggestions: string[];
  evals: EvalRow[];
}

const counts = (values: string[]) =>
  [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())]
    .map(([k, n]) => ({ k, n }))
    .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));

/** The report over a project's runs (samples and evals left out) and the recipe evals. */
export function factoryReport(all: Run[], evals: EvalResult[] = []): Report {
  const runs = all.filter((r) => !isSample(r.id) && !r.eval);
  const byRecipe = new Map<string, number[]>();
  for (const m of measurements(runs)) byRecipe.set(m.recipe, [...(byRecipe.get(m.recipe) ?? []), m.ms]);
  const stages = [...byRecipe]
    .map(([recipe, ms]) => ({
      recipe,
      n: ms.length,
      medianMs: percentile(ms, 0.5) ?? 0,
      p80Ms: percentile(ms, 0.8) ?? 0,
    }))
    .sort((a, b) => b.n - a.n || a.recipe.localeCompare(b.recipe));
  const critiqued = runs
    .map((r) => ({ r, s6: r.stages.find((s) => s.id === "S6" && s.status === "done" && s.report?.quality) }))
    .filter((x) => x.s6);
  const scores = critiqued
    .map((x) => x.s6?.report?.quality?.score)
    .filter((s): s is number => s !== undefined);
  const rounds = critiqued.map((x) => x.r.stages.find((s) => s.id === "S5")?.version ?? 1);
  const trust = trustByKind(runs.flatMap((r) => r.outputs)).map((t) => ({ ...t, gate: reviewerOf(t.kind) }));
  return {
    runs: runs.length,
    byTrack: counts(runs.map((r) => r.track)).map(({ k, n }) => ({ track: k, n })),
    byState: counts(runs.map((r) => r.state)).map(({ k, n }) => ({ state: k, n })),
    stages,
    critic: {
      n: critiqued.length,
      firstPass: critiqued.filter((x) => x.s6?.report?.quality?.pass && rounds[critiqued.indexOf(x)] === 1)
        .length,
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined,
      avgRounds: rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : undefined,
    },
    trust,
    suggestions: suggestions(trust),
    evals: evalTable(evals),
  };
}

/** What the evidence says about reviews: lighter ones for kinds people approve as written, recipes to fix. */
export function suggestions(trust: KindTrust[]): string[] {
  const out: string[] = [];
  for (const t of trust) {
    if (t.decided < MIN_DECIDED || t.rate === undefined) continue;
    const pct = Math.round(t.rate * 100);
    if (t.rate >= LIGHTER_AT)
      out.push(
        `${t.kind}: ${pct}% of ${t.decided} approved as written. ${t.gate ? `Its gate (${t.gate})` : "Its review"} could be lighter: a glance, or approval on the board only.`,
      );
    else if (t.rate < RECIPE_WORK_BELOW)
      out.push(
        `${t.kind}: only ${pct}% of ${t.decided} approved as written. Its recipe needs work: read what people changed.`,
      );
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (v?: number) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);
const num = (v?: number, digits = 0) => (v === undefined ? "—" : v.toFixed(digits));

function table(head: string[], rows: string[][], numeric: number[]): string {
  if (!rows.length) return `<p class="none">Nothing measured yet.</p>`;
  const cell = (tag: string, v: string, i: number) =>
    `<${tag}${numeric.includes(i) ? ' class="n"' : ""}>${v}</${tag}>`;
  return `<table><thead><tr>${head.map((h, i) => cell("th", esc(h), i)).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((v, i) => cell("td", v, i)).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/**
 * The report as one page: system colours only (it follows the reader's light or dark), no scripts, no
 * files beside it.
 */
export function reportHtml(r: Report, meta: { project: string; at: string }): string {
  const day = meta.at.slice(0, 10);
  const sections = [
    `<section><h2>Runs</h2><p class="big">${r.runs}</p>${table(
      ["Track", "Runs"],
      r.byTrack.map((t) => [esc(t.track), String(t.n)]),
      [1],
    )}${table(
      ["State", "Runs"],
      r.byState.map((t) => [esc(t.state), String(t.n)]),
      [1],
    )}</section>`,
    `<section><h2>How long stages take</h2>${table(
      ["Recipe", "Runs", "Median", "80% within"],
      r.stages.map((s) => [esc(s.recipe), String(s.n), duration(s.medianMs), duration(s.p80Ms)]),
      [1, 2, 3],
    )}</section>`,
    `<section><h2>The critic</h2>${table(
      ["Quality gates", "First demo passed", "Average score", "Average demo versions"],
      r.critic.n
        ? [
            [
              String(r.critic.n),
              `${r.critic.firstPass} (${pct(r.critic.firstPass / r.critic.n)})`,
              num(r.critic.avgScore),
              num(r.critic.avgRounds, 1),
            ],
          ]
        : [],
      [0, 1, 2, 3],
    )}</section>`,
    `<section><h2>Approved as written</h2>${table(
      ["Output", "Gate", "Decided", "As written", "Rate", "Median review"],
      r.trust.map((t) => [
        esc(t.kind),
        esc(t.gate ?? "—"),
        String(t.decided),
        String(t.approvedAsIs),
        pct(t.rate),
        t.reviewMinutes === undefined ? "—" : duration(t.reviewMinutes * 60_000),
      ]),
      [2, 3, 4, 5],
    )}${
      r.suggestions.length
        ? `<h3>On this evidence</h3><ul>${r.suggestions.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p class="none">Suggestions only: Jig changes no gate by itself.</p>`
        : `<p class="none">No gate to change yet: a kind needs ${MIN_DECIDED} decisions first.</p>`
    }</section>`,
    `<section><h2>Recipe evals</h2>${table(
      ["Recipe", "Version", "Runs", "Passed", "Average score", "Trend", "Demo versions"],
      r.evals.map((e) => [
        esc(e.recipe),
        `<code>${esc(e.version)}</code>`,
        String(e.n),
        String(e.passed),
        num(e.avgScore),
        e.trend === undefined ? "—" : `${e.trend >= 0 ? "+" : ""}${e.trend.toFixed(0)}`,
        num(e.avgRounds, 1),
      ]),
      [2, 3, 4, 5, 6],
    )}</section>`,
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Factory report · ${esc(meta.project)}</title>
<style>
:root{color-scheme:light dark;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.5}
body{margin:0;background:Canvas;color:CanvasText}
main{max-width:56rem;margin:0 auto;padding:2rem 1.5rem 4rem}
h1{font-size:1.5rem;margin:0}
.sub{color:GrayText;margin:.25rem 0 1.5rem}
section{border-top:1px solid color-mix(in srgb,CanvasText 15%,transparent);padding:1rem 0}
h2{font-size:1rem;margin:0 0 .75rem}
h3{font-size:.875rem;margin:1rem 0 .25rem}
.big{font-size:2rem;font-weight:600;margin:0 0 .5rem;font-variant-numeric:tabular-nums}
table{border-collapse:collapse;width:100%;margin:0 0 .75rem}
th,td{text-align:left;padding:.375rem .5rem;border-bottom:1px solid color-mix(in srgb,CanvasText 10%,transparent)}
th{color:GrayText;font-weight:500;font-size:.75rem}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.none{color:GrayText}
code{font-size:.75rem}
</style></head><body><main>
<h1>Factory report</h1>
<p class="sub">${esc(meta.project)} · ${esc(day)} · measured from the factory's runs</p>
${sections.join("\n")}
</main></body></html>
`;
}
