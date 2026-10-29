/**
 * Pipelines like the pipelines plugin (pure, tested in devops.test.ts): the Azure DevOps repository a
 * git remote points at, the run-time parameters a pipeline's YAML declares, and how a run reads.
 */

/** One run-time parameter of a pipeline, as its YAML declares it under `parameters:`. */
export interface PipelineParam {
  name: string;
  /** Its `displayName`, or its name. */
  label: string;
  type: string;
  /** The default as text: `true` / `false` for a boolean. */
  defaultValue: string;
  /** What to pick from: the YAML's `values`, `true`/`false` for a boolean, empty for free text. */
  values: string[];
}

/** A pipeline of a repository you have checked out. */
export interface PipelineInfo {
  /** `<org>/<project>/<id>`: unique across organisations. */
  key: string;
  org: string;
  project: string;
  id: number;
  name: string;
  /** The checkout's folder (absolute) and its short name. */
  repoPath: string;
  repoName: string;
  /** The YAML file inside the repository, '' when the pipeline isn't YAML. */
  yaml: string;
  defaultBranch: string;
  params: PipelineParam[];
}

export interface PipelineStage {
  name: string;
  /** pending, inProgress, completed. */
  state: string;
  /** succeeded, succeededWithIssues, failed, canceled, skipped, or '' while it runs. */
  result: string;
}

/** A pipeline's run, in ms since the epoch (0 = not yet). */
export interface PipelineRun {
  id: number;
  number: string;
  /** notStarted, inProgress, cancelling, completed… */
  status: string;
  /** succeeded, partiallySucceeded, failed, canceled, or '' while it runs. */
  result: string;
  branch: string;
  /** manual, individualCI, batchedCI, schedule… */
  reason: string;
  queued: number;
  started: number;
  finished: number;
  by: string;
  params: Record<string, string>;
  stages?: PipelineStage[];
}

/**
 * The Azure DevOps organisation, project and repository a git remote points at, or null for any other
 * host: `https://org.visualstudio.com/Project/_git/Repo`, `https://dev.azure.com/org/Project/_git/Repo`
 * (with or without a user) and `git@ssh.dev.azure.com:v3/org/Project/Repo`.
 */
export function parseRemote(url: string): { org: string; project: string; repo: string } | null {
  const clean = url.trim();
  const decode = (part: string) => decodeURIComponent(part);
  let m =
    /^https?:\/\/(?:[^@/]+@)?([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/?#]+)/i.exec(
      clean,
    );
  if (m) return { org: m[1]!, project: decode(m[2]!), repo: decode(m[3]!) };
  m = /^https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i.exec(clean);
  if (m) return { org: decode(m[1]!), project: decode(m[2]!), repo: decode(m[3]!) };
  m =
    /^(?:ssh:\/\/)?[^@]+@(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com):v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i.exec(
      clean,
    );
  if (m) return { org: decode(m[1]!), project: decode(m[2]!), repo: decode(m[3]!) };
  return null;
}

const unquote = (text: string) => {
  const t = text.trim();
  return (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))
    ? t.slice(1, -1)
    : t;
};

/**
 * The run-time parameters a pipeline's YAML declares: each `- name:` under the top-level `parameters:`
 * with its `displayName`, `type`, `default` and `values` (inline `[a, b]` or a list beneath).
 */
export function parseParameters(yaml: string): PipelineParam[] {
  const lines = yaml.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => /^parameters:\s*(#.*)?$/.test(line));
  if (start < 0) return [];
  const params: PipelineParam[] = [];
  let current: PipelineParam | null = null;
  let inValues = false;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // The next top-level key ends the block.
    const text = line.replace(/\s+#.*$/, "");
    if (!text.trim()) continue;
    const item = /^\s*-\s+name:\s*(.+)$/.exec(text);
    if (item) {
      current = { name: unquote(item[1]!), label: "", type: "string", defaultValue: "", values: [] };
      params.push(current);
      inValues = false;
      continue;
    }
    if (!current) continue;
    const field = /^\s+(displayName|type|default|values):\s*(.*)$/.exec(text);
    if (field) {
      const [, key, value = ""] = field;
      inValues = key === "values" && !value.trim();
      if (key === "displayName") current.label = unquote(value);
      else if (key === "type") current.type = unquote(value);
      else if (key === "default") current.defaultValue = unquote(value);
      else if (key === "values" && value.trim().startsWith("["))
        current.values = value.trim().slice(1, -1).split(",").map(unquote).filter(Boolean);
      continue;
    }
    const listed = /^\s+-\s+(.+)$/.exec(text);
    if (inValues && listed) current.values.push(unquote(listed[1]!));
  }
  for (const p of params) {
    if (!p.label) p.label = p.name;
    if (p.type === "boolean") {
      p.values = ["true", "false"];
      p.defaultValue = p.defaultValue.toLowerCase() === "true" ? "true" : "false";
    }
    if (!p.defaultValue && p.values.length) p.defaultValue = p.values[0]!;
  }
  return params;
}

/** A pipeline that's switched off, or named "(old) …", isn't listed. */
export function isRetired(name: string, queueStatus: string): boolean {
  return queueStatus !== "enabled" || /^\(old\)/i.test(name.trim());
}

/** A run out of `az pipelines runs list --query '[0].{id,number,…}'`. */
export function toRun(raw: Record<string, unknown> | null | undefined): PipelineRun | null {
  if (!raw || typeof raw.id !== "number") return null;
  const time = (v: unknown) => (typeof v === "string" ? Date.parse(v) || 0 : 0);
  const params: Record<string, string> = {};
  if (raw.params && typeof raw.params === "object")
    for (const [k, v] of Object.entries(raw.params as Record<string, unknown>)) params[k] = String(v);
  return {
    id: raw.id,
    number: String(raw.number ?? ""),
    status: String(raw.status ?? ""),
    result: String(raw.result ?? ""),
    branch: String(raw.branch ?? "").replace(/^refs\/heads\//, ""),
    reason: String(raw.reason ?? ""),
    queued: time(raw.queued),
    started: time(raw.started),
    finished: time(raw.finished),
    by: String(raw.by ?? ""),
    params,
  };
}

export const isActive = (run: PipelineRun | null | undefined) => !!run && run.status !== "completed";

export type RunKind = "succeeded" | "running" | "partial" | "failed" | "other";

export function runKind(run: PipelineRun | null | undefined): RunKind {
  if (!run || run.status === "notStarted" || run.status === "cancelling") return "other";
  if (isActive(run)) return "running";
  if (run.result === "succeeded") return "succeeded";
  if (run.result === "partiallySucceeded") return "partial";
  if (run.result === "failed") return "failed";
  return "other";
}

export function since(ms: number, now = Date.now()): string {
  if (!ms) return "";
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/** The run chip: Queued or Running and for how long, else the outcome and how long ago it ended. */
export function runLabel(run: PipelineRun | null | undefined, now = Date.now()): string {
  if (!run) return "never run";
  if (run.status === "notStarted") return `◷ Queued ${since(run.queued, now)}`;
  if (run.status === "cancelling") return "Cancelling";
  if (isActive(run)) return `▶ Running ${since(run.started || run.queued, now)}`;
  if (run.result === "canceled") return `Cancelled ${since(run.finished || run.queued, now)}`;
  const glyph = { running: "▶", succeeded: "✓", partial: "!", failed: "✗", other: "–" }[runKind(run)];
  return `${glyph} ${since(run.finished || run.queued, now)}`;
}

/** A stage's mark: done, failed, running, waiting; a skipped one has none (it's left out). */
function stageMark(stage: PipelineStage): string | null {
  if (stage.result === "skipped") return null;
  if (stage.state === "inProgress") return "▶";
  if (stage.state === "pending") return "○";
  return (
    ({ succeeded: "✓", succeededWithIssues: "!", failed: "✗", canceled: "–" } as Record<string, string>)[
      stage.result
    ] ?? "·"
  );
}

/** The run's stages on one line, skipped ones left out: `Build ✓ → Deploy to staging ▶`. */
export function stageLine(run: PipelineRun | null | undefined): string {
  return (run?.stages ?? [])
    .map((s) => {
      const mark = stageMark(s);
      return mark ? `${s.name} ${mark}` : null;
    })
    .filter(Boolean)
    .join(" → ");
}

/**
 * What a run did beyond the defaults: each parameter that differs from the YAML's default
 * (`Deploy to: production`); '' when it ran with the defaults.
 */
export function changedParams(
  pipeline: Pick<PipelineInfo, "params">,
  values: Record<string, string>,
): string {
  return pipeline.params
    .filter((p) => p.name in values && String(values[p.name]).toLowerCase() !== p.defaultValue.toLowerCase())
    .map((p) => `${p.label.replace(/\s*\(.*\)\s*$/, "")}: ${values[p.name]}`)
    .join(" · ");
}

export const REASONS: Record<string, string> = {
  manual: "manual",
  individualCI: "CI",
  batchedCI: "CI",
  schedule: "scheduled",
  pullRequest: "PR",
};

/** The `--parameters` arguments for a run: every parameter, as picked or its default. */
export function runParameters(params: PipelineParam[], values: Record<string, string>): string[] {
  return params.map((p) => `${p.name}=${values[p.name] ?? p.defaultValue}`);
}

/** Branch names out of `git for-each-ref` (local and origin's), the default first, each once. */
export function branchList(refs: string, defaultBranch: string, max = 64): string[] {
  const names = refs
    .split(/\r?\n/)
    .map((ref) =>
      ref
        .trim()
        .replace(/^refs\/heads\//, "")
        .replace(/^refs\/remotes\/origin\//, ""),
    )
    .filter((name) => name && name !== "HEAD" && !name.startsWith("refs/"));
  return [...new Set([defaultBranch, ...names])].slice(0, max);
}

/** A run as `az pipelines runs list` / `run` / `runs show` answer it (a build). */
export function fromBuild(raw: Record<string, unknown> | null | undefined): PipelineRun | null {
  if (!raw) return null;
  // biome-ignore lint/suspicious/noExplicitAny: az JSON.
  const b = raw as any;
  return toRun({
    id: b.id,
    number: b.buildNumber,
    status: b.status,
    result: b.result ?? "",
    branch: b.sourceBranch,
    reason: b.reason,
    queued: b.queueTime,
    started: b.startTime,
    finished: b.finishTime,
    by: b.requestedFor?.displayName ?? b.requestedBy?.displayName,
    params: b.templateParameters,
  });
}

/** The stages out of a build's timeline (`az devops invoke --area build --resource Timeline`), in order. */
export function stagesOf(
  timeline: { records?: Array<Record<string, unknown>> } | null | undefined,
): PipelineStage[] {
  return (timeline?.records ?? [])
    .filter((r) => r.type === "Stage")
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((r) => ({
      name: String(r.name ?? ""),
      state: String(r.state ?? ""),
      result: String(r.result ?? ""),
    }));
}

/** The pipelines' newest run each, out of a project's runs (newest first or not). */
export function newestPerPipeline(
  runs: Array<PipelineRun & { pipelineId: number }>,
): Map<number, PipelineRun> {
  const newest = new Map<number, PipelineRun>();
  for (const run of runs) {
    const current = newest.get(run.pipelineId);
    if (!current || run.id > current.id) newest.set(run.pipelineId, run);
  }
  return newest;
}
