/**
 * What Claude's Pipelines tools answer (D-371), as plain text: runs on one line each, one run's stages,
 * jobs and failing steps. Pure (tested in report.test.ts). The tools only read: runs are started by the
 * user from the Run form.
 */
import { type PipelineRun, REASONS, runAge, runDuration, stageLine } from "./devops";
import type { Run } from "./runs";

/** Which runs the `runs` tool lists. */
export type RunFilter = "running" | "recent" | "failed";

/** A run with the pipeline and Azure DevOps project it belongs to. */
export interface ListedRun extends PipelineRun {
  pipeline: string;
  pipelineId: number;
  org: string;
  project: string;
}

/** A run as `lib/runs` reads it (the organisations' overview), in the shape the tools print. */
export function fromRun(run: Run): PipelineRun {
  const time = (v?: string) => (v ? Date.parse(v) || 0 : 0);
  return {
    id: run.id,
    number: run.buildNumber,
    status: run.status,
    result: run.result && run.result !== "none" ? run.result : "",
    branch: run.branch,
    reason: "",
    queued: time(run.queueTime),
    started: time(run.startTime),
    finished: time(run.finishTime),
    by: run.requestedBy ?? "",
    params: {},
  };
}

/** One word (or two) for where a run is: queued, running, succeeded, failed… */
export function runWord(run: Pick<PipelineRun, "status" | "result">): string {
  if (run.status === "notStarted" || run.status === "postponed") return "queued";
  if (run.status === "cancelling") return "cancelling";
  if (run.status !== "completed") return "running";
  return (
    (
      {
        succeeded: "succeeded",
        partiallySucceeded: "partially succeeded",
        failed: "failed",
        canceled: "cancelled",
      } as Record<string, string>
    )[run.result] ?? "finished"
  );
}

/** Does a run belong in the list asked for? */
export function matchesFilter(run: Pick<PipelineRun, "status" | "result">, filter: RunFilter): boolean {
  if (filter === "running") return run.status !== "completed";
  if (filter === "failed") return run.status === "completed" && run.result === "failed";
  return true;
}

/** A run on one line: `#412 CI · 20261105.3 · running for 4m · main · CI · Ana · Build ✓ → Deploy ▶`. */
export function runText(run: PipelineRun, now = Date.now()): string {
  const word = runWord(run);
  const age = runAge(run, now);
  const when =
    word === "queued"
      ? `queued ${age} ago`
      : word === "running" || word === "cancelling"
        ? `${word} for ${age}`
        : `${word} ${age} ago (took ${runDuration(run, now)})`;
  const stages = stageLine(run);
  return [`#${run.id}`, run.number, when, run.branch, REASONS[run.reason] ?? run.reason, run.by, stages]
    .filter(Boolean)
    .join(" · ");
}

/** A pipeline's newest run in a list of pipelines ("never run" when it has none). */
export function latestText(run: PipelineRun | null | undefined, now = Date.now()): string {
  return run ? `newest run ${runText(run, now)}` : "never run";
}

/** Does a pipeline answer to what was asked (its key, id, or part of its name, any case)? */
export function matchesPipeline(p: { key?: string; id: number; name: string }, query?: string): boolean {
  if (!query?.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    p.key?.toLowerCase() === q || String(p.id) === q || p.name.toLowerCase().includes(q.replace(/^#/, ""))
  );
}

/** Does a name answer to a filter (part of it, any case; no filter matches everything)? */
export const matchesName = (name: string, query?: string) =>
  !query?.trim() || name.toLowerCase().includes(query.trim().toLowerCase());

/** The organisation, project and run id out of a run's link (`…/_build/results?buildId=412`). */
export function parseRunUrl(url: string): { org: string; project: string; id: number } | null {
  const m =
    /^https?:\/\/(?:dev\.azure\.com\/([^/]+)|([^./]+)\.visualstudio\.com)\/([^/]+)\/_build\/results\?(?:.*&)?buildId=(\d+)/i.exec(
      url.trim(),
    );
  if (!m) return null;
  return {
    org: decodeURIComponent(m[1] ?? m[2]!),
    project: decodeURIComponent(m[3]!),
    id: Number(m[4]),
  };
}

/** A record of a build's timeline (`az devops invoke --area build --resource Timeline`). */
export type TimelineRecord = {
  id?: string;
  parentId?: string | null;
  type?: string;
  name?: string;
  state?: string;
  result?: string | null;
  order?: number;
  log?: { id?: number } | null;
  issues?: Array<{ type?: string; message?: string }> | null;
};

export interface RunDetail {
  stages: Array<{
    name: string;
    state: string;
    result: string;
    jobs: Array<{ name: string; state: string; result: string }>;
  }>;
  /** The steps that failed, first first, with their errors and the log to read. */
  failures: Array<{ stage: string; job: string; step: string; logId?: number; errors: string[] }>;
  warnings: number;
}

const byOrder = (a: TimelineRecord, b: TimelineRecord) => Number(a.order ?? 0) - Number(b.order ?? 0);

/** A run's stages with their jobs, and the steps that failed, out of its timeline. */
export function runDetail(timeline: { records?: TimelineRecord[] | null } | null | undefined): RunDetail {
  const records = timeline?.records ?? [];
  const byId = new Map(records.filter((r) => r.id).map((r) => [r.id!, r]));
  /** The nearest record above `r` of a type. */
  const above = (r: TimelineRecord, type: string): TimelineRecord | undefined => {
    let at = r.parentId ? byId.get(r.parentId) : undefined;
    for (let hops = 0; at && hops < 10; hops++) {
      if (at.type === type) return at;
      at = at.parentId ? byId.get(at.parentId) : undefined;
    }
    return undefined;
  };
  const text = (r: TimelineRecord) => ({
    name: String(r.name ?? ""),
    state: String(r.state ?? ""),
    result: String(r.result ?? ""),
  });
  const stageRecords = records.filter((r) => r.type === "Stage").sort(byOrder);
  const jobs = records.filter((r) => r.type === "Job").sort(byOrder);
  const stages = stageRecords.map((s) => ({
    ...text(s),
    jobs: jobs.filter((j) => above(j, "Stage") === s).map(text),
  }));
  // A pipeline without stages has its jobs at the top: shown as one stage.
  if (!stages.length && jobs.length)
    stages.push({ name: "Jobs", state: "", result: "", jobs: jobs.map(text) });
  const failures = records
    .filter((r) => r.type === "Task" && r.result === "failed")
    .sort((a, b) => {
      const job = (r: TimelineRecord) => records.indexOf(above(r, "Job") ?? r);
      return job(a) - job(b) || byOrder(a, b);
    })
    .map((r) => ({
      stage: String(above(r, "Stage")?.name ?? ""),
      job: String(above(r, "Job")?.name ?? ""),
      step: String(r.name ?? ""),
      logId: typeof r.log?.id === "number" ? r.log.id : undefined,
      errors: (r.issues ?? []).filter((i) => i.type === "error").map((i) => String(i.message ?? "")),
    }));
  const warnings = records.reduce(
    (n, r) => n + (r.issues ?? []).filter((i) => i.type === "warning").length,
    0,
  );
  return { stages, failures, warnings };
}

/** The last `count` lines of a step's log, without Azure DevOps' timestamps. */
export function logTail(log: string, count = 40): string {
  return log
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ""))
    .filter((line, i, all) => line.trim() || i < all.length - 1)
    .slice(-count)
    .join("\n")
    .trimEnd();
}

const mark = (result: string, state: string) =>
  result === "skipped"
    ? "skipped"
    : state === "inProgress"
      ? "running"
      : state === "pending"
        ? "waiting"
        : result === "succeededWithIssues"
          ? "succeeded with issues"
          : result || state;

/** One run's details as text: its line, parameters, stages and jobs, what failed, and its link. */
export function detailText(input: {
  run: PipelineRun;
  pipeline: string;
  org: string;
  project: string;
  url: string;
  detail: RunDetail | null;
  log?: string;
  now?: number;
}): string {
  const { run, detail } = input;
  const lines = [
    `${input.pipeline} (${input.org}/${input.project}) ${runText(run, input.now)}`,
    `Link: ${input.url}`,
  ];
  const params = Object.entries(run.params);
  if (params.length) lines.push(`Parameters: ${params.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (!detail) lines.push("Its stages couldn't be read.");
  else {
    if (detail.stages.length) lines.push("Stages:");
    for (const s of detail.stages) {
      lines.push(`- ${s.name}: ${mark(s.result, s.state)}`);
      for (const j of s.jobs) lines.push(`  - ${j.name}: ${mark(j.result, j.state)}`);
    }
    for (const f of detail.failures) {
      lines.push(`Failed step: ${[f.stage, f.job, f.step].filter(Boolean).join(" › ")}`);
      for (const e of f.errors.slice(0, 5)) lines.push(`  error: ${e}`);
    }
    if (detail.warnings) lines.push(`${detail.warnings} warning${detail.warnings === 1 ? "" : "s"}.`);
  }
  if (input.log) lines.push("Last lines of the failed step's log:", input.log);
  return lines.join("\n");
}
