/**
 * A finished run's report (D-355), made only when you ask for it from History: one AI call (Settings →
 * AI features → "Task run report") over the run's tasks as they reported, never their transcripts.
 * Jig builds the input (`reportPrompt`), checks the JSON that comes back (`parseRunReport`) and keeps it
 * with the run (`reports` in the add-on's project storage). Pure: no Jig or Electron imports.
 */
import { durationMs, formatMs, type Run, STATUS_LABEL, type Task } from "./tasks";

export type AwareKind = "bug" | "regression" | "flaky" | "decision" | "assumption" | "risk" | "surprise";
export type NeedKind = "push" | "deploy" | "signin" | "decision" | "testing" | "other";
export type ProposalKind = "fix" | "feature" | "cleanup";

export const AWARE_KINDS: AwareKind[] = [
  "bug",
  "regression",
  "flaky",
  "decision",
  "assumption",
  "risk",
  "surprise",
];
export const NEED_KINDS: NeedKind[] = ["push", "deploy", "signin", "decision", "testing", "other"];
export const PROPOSAL_KINDS: ProposalKind[] = ["fix", "feature", "cleanup"];

export const AWARE_LABEL: Record<AwareKind, string> = {
  bug: "Bug fixed",
  regression: "Regression",
  flaky: "Flaky test",
  decision: "Decided alone",
  assumption: "Assumption",
  risk: "Risk",
  surprise: "Surprise",
};
export const NEED_LABEL: Record<NeedKind, string> = {
  push: "Push",
  deploy: "Deploy",
  signin: "Sign in",
  decision: "Decision",
  testing: "Test by hand",
  other: "Other",
};
export const PROPOSAL_LABEL: Record<ProposalKind, string> = {
  fix: "Fixes",
  feature: "Feature ideas",
  cleanup: "Cleanups and tests",
};

/** One line per task: what changed and where it was committed. */
export interface ReportTaskLine {
  taskId: string;
  line: string;
  committed?: string;
}
export interface ReportAware {
  kind: AwareKind;
  text: string;
  taskIds: string[];
}
export interface ReportStuck {
  taskId: string;
  what: string;
  unblock: string;
}
export interface ReportNeed {
  kind: NeedKind;
  text: string;
  /** The repository, for commits not pushed. */
  repo?: string;
  taskIds: string[];
}
/** Follow-ups merged into one proposal with a prompt ready to queue. */
export interface ReportProposal {
  /** `p1`, `p2`…: given by Jig, in the order they came. */
  id: string;
  kind: ProposalKind;
  title: string;
  why: string;
  prompt: string;
  /** The follow-ups it came from (`followUpId`). */
  sources: string[];
  /** When you queued it from the report. */
  queuedAt?: string;
  /** A follow-up no proposal took, kept as its task suggested it (so none is lost). */
  asSuggested?: boolean;
}

export interface RunReport {
  runId: string;
  madeAt: string;
  /** Who made it: the provider and model of the AI feature at the time. */
  provider: "claude" | "chatgpt";
  model: string;
  overview: string;
  tasks: ReportTaskLine[];
  aware: ReportAware[];
  stuck: ReportStuck[];
  needsYou: ReportNeed[];
  proposals: ReportProposal[];
}

/** A follow-up's id in the report's input and output: the task's id and its 1-based place (`t3.2`). */
export const followUpId = (taskId: string, index: number) => `${taskId}.${index + 1}`;

/** Every follow-up of a run's tasks by id, with the task it came from. */
export function runFollowUps(run: Pick<Run, "tasks">): Map<string, { task: Task; text: string }> {
  const all = new Map<string, { task: Task; text: string }>();
  for (const task of run.tasks)
    for (const [i, text] of (task.report?.followUps ?? []).entries())
      all.set(followUpId(task.id, i), { task, text });
  return all;
}

/** Whether a report can be made: the run finished (an open run's tasks are still changing). */
export function canReport(run: Pick<Run, "finishedAt">): boolean {
  return !!run.finishedAt;
}

/** The longest input the report sends: the add-on limit is 200k characters; this leaves room. */
export const REPORT_INPUT_LIMIT = 150_000;

const cut = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

/** How much of each task's text goes in, from everything to the least; prompts are cut first. */
const BUDGETS = [
  { prompt: Infinity, answer: 4000, text: Infinity },
  { prompt: 2000, answer: 2000, text: Infinity },
  { prompt: 500, answer: 800, text: Infinity },
  { prompt: 150, answer: 300, text: 1500 },
  { prompt: 0, answer: 0, text: 400 },
];

function taskBlock(task: Task, n: number, b: (typeof BUDGETS)[number]): string {
  const r = task.report;
  const lines = [
    `### Task ${n}`,
    `id: ${task.id}`,
    `title: ${task.title}`,
    `status: ${STATUS_LABEL[task.status]}`,
  ];
  if (task.sentAt) lines.push(`time: ${formatMs(durationMs(task))}`);
  if (task.costUsd) lines.push(`cost: $${task.costUsd.toFixed(2)}`);
  if (task.ranOn) lines.push(`ran on: ${task.ranOn}`);
  if (b.prompt > 0) lines.push(`prompt:\n${cut(task.prompt, b.prompt)}`);
  if (task.error) lines.push(`error: ${cut(task.error, 600)}`);
  if (r) {
    lines.push(`reported outcome: ${r.outcome}`, `summary: ${cut(r.summary, b.text)}`);
    if (r.notes.length) lines.push("notes:", ...r.notes.map((x) => `- ${cut(x, b.text)}`));
    if (r.followUps.length)
      lines.push(
        "follow-ups:",
        ...r.followUps.map((x, i) => `- [${followUpId(task.id, i)}] ${cut(x, b.text)}`),
      );
  } else if (task.answer && b.answer > 0)
    lines.push(`its last answer (no report):\n${cut(task.answer, b.answer)}`);
  return lines.join("\n");
}

const INSTRUCTIONS = `Write a structured report on this task-queue run for the user, who did not watch it. Use only what the tasks reported below; never invent work, commits or problems. Answer with JSON only, no Markdown fences, in this shape:
{
  "overview": "2-4 sentences: what the run did and how it went",
  "tasks": [{ "taskId": "t1", "line": "one line: what changed", "committed": "where it was committed (commit, branch, repo), if the report says" }],
  "aware": [{ "kind": "bug|regression|flaky|decision|assumption|risk|surprise", "text": "one or two sentences", "taskIds": ["t1"] }],
  "stuck": [{ "taskId": "t2", "what": "what happened", "unblock": "what would unblock it" }],
  "needsYou": [{ "kind": "push|deploy|signin|decision|testing|other", "text": "what the user must do", "repo": "the repository, for commits not pushed", "taskIds": ["t1"] }],
  "proposals": [{ "kind": "fix|feature|cleanup", "title": "short title", "why": "one sentence", "prompt": "a complete prompt that could be queued as a task on its own", "sources": ["t1.1", "t3.2"] }]
}
Rules:
- "tasks": one entry per task that ran, in order.
- "aware": bugs found and fixed along the way (in the code under work or in the tool itself), regressions and flaky tests, decisions taken without the user ("on my own") and assumptions, risks and surprises.
- "stuck": every task that is blocked, partly done, failed, errored or has no report.
- "needsYou": pushes, deploys, sign-ins, decisions and manual testing the reports ask of the user; commits not pushed, one entry per repository, only when the reports say so.
- "proposals": read ALL follow-ups first, then drop duplicates, merge overlapping ones and combine related ones into fewer, better-scoped proposals. Every follow-up id goes into the "sources" of exactly one proposal. A prompt says what to do and how to check it is done, standing on its own.
- Leave a list empty when nothing fits. Use the task and follow-up ids exactly as given.`;

/** The report's prompt: the instructions, then every task; long texts are cut to stay under the limit. */
export function reportPrompt(run: Run, limit = REPORT_INPUT_LIMIT): string {
  const head = `${INSTRUCTIONS}\n\n## The run\nstarted: ${run.startedAt}\nfinished: ${run.finishedAt ?? "still open"}\ntasks: ${run.tasks.length}\n\n`;
  let text = "";
  for (const b of BUDGETS) {
    text = head + run.tasks.map((t, i) => taskBlock(t, i + 1, b)).join("\n\n");
    if (text.length <= limit) return text;
  }
  return cut(text, limit);
}

const str = (v: unknown, max = 4000): string => (typeof v === "string" ? cut(v.trim(), max) : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
function oneOf<T extends string>(v: unknown, all: readonly T[], fallback: T): T {
  return all.includes(v as T) ? (v as T) : fallback;
}

/** The JSON object in an answer: the whole answer, or the outermost braces (fences and preamble go). */
function jsonOf(answer: string): unknown {
  const text = answer.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The answer has no JSON in it");
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error("The answer's JSON doesn't parse");
    }
  }
}

/**
 * Checks the AI's answer against the run: unknown task and follow-up ids are dropped, empty items go,
 * kinds fall back to "other"-like defaults, proposals get Jig's own ids. Throws when it isn't JSON or
 * has nothing in it.
 */
export function parseRunReport(
  answer: string,
  run: Run,
  made: { provider: "claude" | "chatgpt"; model: string; at?: string },
): RunReport {
  const raw = obj(jsonOf(answer));
  const taskIds = new Set(run.tasks.map((t) => t.id));
  const followUps = runFollowUps(run);
  const ids = (v: unknown) => [...new Set(list(v).filter((id): id is string => taskIds.has(id as string)))];
  const seenLine = new Set<string>();
  const tasks: ReportTaskLine[] = [];
  for (const item of list(raw.tasks).map(obj)) {
    const taskId = str(item.taskId);
    const line = str(item.line, 600);
    if (!taskIds.has(taskId) || !line || seenLine.has(taskId)) continue;
    seenLine.add(taskId);
    const committed = str(item.committed, 300);
    tasks.push({ taskId, line, ...(committed ? { committed } : {}) });
  }
  // In the run's order, whatever order they came in.
  const order = new Map(run.tasks.map((t, i) => [t.id, i]));
  tasks.sort((a, b) => order.get(a.taskId)! - order.get(b.taskId)!);
  const aware = list(raw.aware)
    .map(obj)
    .map((i) => ({
      kind: oneOf(i.kind, AWARE_KINDS, "surprise"),
      text: str(i.text, 1200),
      taskIds: ids(i.taskIds),
    }))
    .filter((i) => i.text);
  const stuck = list(raw.stuck)
    .map(obj)
    .map((i) => ({ taskId: str(i.taskId), what: str(i.what, 1200), unblock: str(i.unblock, 1200) }))
    .filter((i) => taskIds.has(i.taskId) && (i.what || i.unblock));
  const needsYou = list(raw.needsYou)
    .map(obj)
    .map((i) => {
      const repo = str(i.repo, 200);
      return {
        kind: oneOf(i.kind, NEED_KINDS, "other"),
        text: str(i.text, 1200),
        ...(repo ? { repo } : {}),
        taskIds: ids(i.taskIds),
      };
    })
    .filter((i) => i.text);
  const used = new Set<string>();
  const proposals: ReportProposal[] = [];
  for (const i of list(raw.proposals).map(obj)) {
    const prompt = str(i.prompt, 8000);
    const title = str(i.title, 200) || cut(prompt, 80);
    if (!prompt) continue;
    // A follow-up belongs to one proposal: the first that names it.
    const sources = list(i.sources).filter(
      (s): s is string => typeof s === "string" && followUps.has(s) && !used.has(s),
    );
    for (const s of sources) used.add(s);
    proposals.push({
      id: `p${proposals.length + 1}`,
      kind: oneOf(i.kind, PROPOSAL_KINDS, "feature"),
      title,
      why: str(i.why, 600),
      prompt,
      sources: [...new Set(sources)],
    });
  }
  const overview = str(raw.overview, 2000);
  if (!overview && !tasks.length && !aware.length && !stuck.length && !needsYou.length && !proposals.length)
    throw new Error("The answer has no report in it");
  // Follow-ups the answer left out stay queueable, as their tasks suggested them.
  for (const [id, { text }] of followUps) {
    if (used.has(id)) continue;
    proposals.push({
      id: `p${proposals.length + 1}`,
      kind: "feature",
      title: cut(text, 90),
      why: "",
      prompt: text,
      sources: [id],
      asSuggested: true,
    });
  }
  return {
    runId: run.id,
    madeAt: made.at ?? new Date().toISOString(),
    provider: made.provider,
    model: made.model,
    overview,
    tasks,
    aware,
    stuck,
    needsYou,
    proposals,
  };
}

/** Marks proposals as queued (`at`); others stay as they are. */
export function markQueued(report: RunReport, ids: string[], at = new Date().toISOString()): RunReport {
  const set = new Set(ids);
  return {
    ...report,
    proposals: report.proposals.map((p) => (set.has(p.id) && !p.queuedAt ? { ...p, queuedAt: at } : p)),
  };
}

/** Saves a report among a project's reports, keeping only runs still in the history. */
export function saveReport(
  reports: Record<string, RunReport>,
  report: RunReport,
  runIds: string[],
): Record<string, RunReport> {
  const keep = new Set(runIds);
  const next: Record<string, RunReport> = {};
  for (const [id, r] of Object.entries(reports)) if (keep.has(id)) next[id] = r;
  if (keep.has(report.runId)) next[report.runId] = report;
  return next;
}
