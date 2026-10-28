/** Azure DevOps run/pipeline data from `az … -o json`, normalised. Pure (tested in runs.test.ts). */

export interface Pipeline {
  id: number;
  name: string;
  folder: string;
}

export type RunStatus = "notStarted" | "inProgress" | "completed" | "cancelling" | "postponed" | "unknown";
export type RunResult = "succeeded" | "failed" | "canceled" | "partiallySucceeded" | "none" | undefined;

export interface Run {
  id: number;
  buildNumber: string;
  status: RunStatus;
  result: RunResult;
  branch: string;
  startTime?: string;
  finishTime?: string;
  queueTime?: string;
  requestedBy?: string;
  definitionId: number;
  definitionName: string;
}

// biome-ignore lint/suspicious/noExplicitAny: az JSON.
type Json = any;

export function toPipeline(p: Json): Pipeline {
  return {
    id: Number(p.id),
    name: String(p.name ?? `Pipeline ${p.id}`),
    folder: String(p.path ?? p.folder ?? "\\").replace(/^\\$/, ""),
  };
}

export function toRun(r: Json): Run {
  return {
    id: Number(r.id),
    buildNumber: String(r.buildNumber ?? r.id),
    status: (r.status ?? "unknown") as RunStatus,
    result: (r.result ?? undefined) as RunResult,
    branch: String(r.sourceBranch ?? "").replace(/^refs\/heads\//, ""),
    startTime: r.startTime ?? undefined,
    finishTime: r.finishTime ?? undefined,
    queueTime: r.queueTime ?? undefined,
    requestedBy: r.requestedFor?.displayName ?? r.requestedBy?.displayName,
    definitionId: Number(r.definition?.id),
    definitionName: String(r.definition?.name ?? ""),
  };
}

/** The newest run per pipeline (runs come newest first from `az pipelines runs list`). */
export function latestRuns(runs: Run[]): Map<number, Run> {
  const latest = new Map<number, Run>();
  for (const run of runs) {
    const current = latest.get(run.definitionId);
    if (!current || run.id > current.id) latest.set(run.definitionId, run);
  }
  return latest;
}

/** `https://dev.azure.com/contoso`, from what people type ("contoso", with a trailing slash, …). */
export function normalizeOrg(input: string): string {
  const v = input.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (/^https?:\/\//.test(v)) return v;
  return `https://dev.azure.com/${v}`;
}

export function runUrl(org: string, project: string, runId: number): string {
  return `${normalizeOrg(org)}/${encodeURIComponent(project)}/_build/results?buildId=${runId}`;
}

export function pipelineUrl(org: string, project: string, pipelineId: number): string {
  return `${normalizeOrg(org)}/${encodeURIComponent(project)}/_build?definitionId=${pipelineId}`;
}

/** One word for a run's state, for the UI and notifications. */
export function runState(
  run: Pick<Run, "status" | "result"> | undefined,
): "running" | "queued" | "succeeded" | "failed" | "canceled" | "partial" | "none" {
  if (!run) return "none";
  if (run.status === "inProgress" || run.status === "cancelling") return "running";
  if (run.status === "notStarted" || run.status === "postponed") return "queued";
  if (run.result === "succeeded") return "succeeded";
  if (run.result === "failed") return "failed";
  if (run.result === "canceled") return "canceled";
  if (run.result === "partiallySucceeded") return "partial";
  return "none";
}
