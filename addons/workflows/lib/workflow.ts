/**
 * Workflows (pure, tested; D-112): a named list of steps per project, run by hand, with help, or on a
 * schedule while Jig is open. Each step is manual (you tick it), auto (Jig or Claude does it) or "ask
 * me" (Jig asks before doing it).
 */
export type StepKind = "check" | "command" | "script" | "pipeline" | "claude" | "wait";
export type StepMode = "manual" | "auto" | "ask";

export interface Step {
  id: string;
  kind: StepKind;
  title: string;
  mode: StepMode;
  /** command: a shell command line (git, dotnet, npm…), run in `cwd` (default: the project folder). */
  command?: string;
  cwd?: string;
  /** script: a script Jig found in the project. */
  scriptId?: string;
  /** pipeline: an Azure DevOps pipeline to start. */
  pipeline?: { org: string; project: string; id: number; branch?: string };
  /** claude: what to ask Claude (a new chat in the project). */
  prompt?: string;
}

export type Trigger =
  | { kind: "none" }
  /** Every day, every weekday (Mon–Fri) or one day of the week (0 = Sunday), at `time` (HH:MM, local). */
  | { kind: "schedule"; every: "day" | "weekday" | "week"; time: string; day?: number };

export interface Workflow {
  id: string;
  name: string;
  /** What it is for (from a suggestion's goal, or yours). */
  goal?: string;
  projectId: string;
  steps: Step[];
  trigger: Trigger;
  createdAt: string;
  updatedAt: string;
}

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface Run {
  id: string;
  workflowId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "done" | "failed" | "stopped";
  /** Started by you, or by the schedule. */
  by: "you" | "schedule";
  steps: Array<{ id: string; status: StepStatus; output?: string; at?: string }>;
}

export const STEP_KINDS: Array<{ kind: StepKind; label: string; canRun: boolean }> = [
  { kind: "check", label: "A check you do", canRun: false },
  { kind: "command", label: "A command (git, dotnet, npm…)", canRun: true },
  { kind: "script", label: "A script of the project", canRun: true },
  { kind: "pipeline", label: "An Azure DevOps pipeline", canRun: true },
  { kind: "claude", label: "A message to Claude", canRun: true },
  { kind: "wait", label: "Wait for your OK", canRun: false },
];

/** Steps Jig can't do itself are always yours (a check, waiting for your OK). */
export function effectiveMode(step: Step): StepMode {
  return step.kind === "check" || step.kind === "wait" ? "manual" : step.mode;
}

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newStep(kind: StepKind = "check", title = ""): Step {
  return { id: newId("s"), kind, title, mode: kind === "check" || kind === "wait" ? "manual" : "ask" };
}

/**
 * A step from a line of text (a suggestion's steps, or a pasted checklist): a command when it looks
 * like one (`git pull`, `dotnet publish -c Release`), else a check you do.
 */
export function stepFromText(text: string): Step {
  const t = text.trim().replace(/^[-*\d.)\s]+/, "");
  const command =
    /^`([^`]+)`$/.exec(t)?.[1] ??
    (/^(git|dotnet|npm|pnpm|yarn|az|func|docker|kubectl|pwsh|\.\/|python|node)\b/.test(t) ? t : undefined);
  if (command) return { ...newStep("command", command), command, mode: "ask" };
  return newStep("check", t);
}

export function draftWorkflow(
  draft: { name?: string; goal?: string; steps?: string[] },
  projectId: string,
  now = new Date(),
): Workflow {
  return {
    id: newId("w"),
    name: draft.name?.trim() || "New workflow",
    goal: draft.goal?.trim() || undefined,
    projectId,
    steps: (draft.steps ?? []).filter((s) => s.trim()).map(stepFromText),
    trigger: { kind: "none" },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function newRun(wf: Workflow, by: Run["by"] = "you", now = new Date()): Run {
  return {
    id: newId("r"),
    workflowId: wf.id,
    startedAt: now.toISOString(),
    status: "running",
    by,
    steps: wf.steps.map((s) => ({ id: s.id, status: "pending" })),
  };
}

/** The step to do next, and how: Jig does it (auto), asks first (ask), or waits for you (manual). */
export function nextStep(wf: Workflow, run: Run): { step: Step; mode: StepMode } | undefined {
  if (run.status !== "running") return undefined;
  for (const r of run.steps) {
    if (r.status === "done" || r.status === "skipped") continue;
    const step = wf.steps.find((s) => s.id === r.id);
    if (!step) continue;
    return { step, mode: effectiveMode(step) };
  }
  return undefined;
}

/** The run with a step's new status; it ends when every step is done or skipped, or one failed. */
export function markStep(
  run: Run,
  stepId: string,
  status: StepStatus,
  output?: string,
  now = new Date(),
): Run {
  const steps = run.steps.map((s) =>
    s.id === stepId ? { ...s, status, output: output?.slice(-4000), at: now.toISOString() } : s,
  );
  const failed = status === "failed";
  const finished = steps.every((s) => s.status === "done" || s.status === "skipped");
  return {
    ...run,
    steps,
    status: failed ? "failed" : finished ? "done" : "running",
    finishedAt: failed || finished ? now.toISOString() : undefined,
  };
}

/** A schedule's most recent due time at or before `now` (local time). */
export function lastDue(trigger: Trigger, now: Date): Date | undefined {
  if (trigger.kind !== "schedule") return undefined;
  const [h, m] = trigger.time.split(":").map(Number);
  for (let back = 0; back <= 7; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h ?? 0, m ?? 0);
    if (d > now) continue;
    const day = d.getDay();
    if (trigger.every === "weekday" && (day === 0 || day === 6)) continue;
    if (trigger.every === "week" && day !== (trigger.day ?? 1)) continue;
    return d;
  }
  return undefined;
}

/** Due when the last due time passed after the last time it was triggered (and Jig ran meanwhile). */
export function isDue(
  trigger: Trigger,
  lastTriggered: string | undefined,
  now: Date,
  created?: string,
): boolean {
  const due = lastDue(trigger, now);
  if (!due) return false;
  const since = lastTriggered ?? created;
  return !since || new Date(since) < due;
}

/** A schedule can run without you only when every step is something Jig does itself (auto commands, pipelines). */
export function runsUnattended(wf: Workflow): boolean {
  return (
    wf.steps.length > 0 &&
    wf.steps.every((s) => effectiveMode(s) === "auto" && (s.kind === "command" || s.kind === "pipeline"))
  );
}

export function triggerLabel(t: Trigger): string {
  if (t.kind !== "schedule") return "By hand";
  const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const when = t.every === "day" ? "Every day" : t.every === "weekday" ? "Weekdays" : days[t.day ?? 1];
  return `${when} at ${t.time}`;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 60) || "workflow";

export function skillName(wf: Workflow): string {
  return slug(wf.name);
}

/** The workflow as a Claude Code skill (`.claude/skills/<name>/SKILL.md`): Claude follows the steps. */
export function toSkill(wf: Workflow): string {
  const lines = wf.steps.map((s, i) => {
    const n = `${i + 1}.`;
    const ask =
      effectiveMode(s) === "auto"
        ? ""
        : effectiveMode(s) === "ask"
          ? " (ask me before doing it)"
          : " (I do this one; wait until I say it's done)";
    if (s.kind === "command")
      return `${n} ${s.title || s.command}: run \`${s.command}\`${s.cwd ? ` in \`${s.cwd}\`` : ""}${ask}.`;
    if (s.kind === "pipeline" && s.pipeline)
      return `${n} ${s.title}: start Azure DevOps pipeline ${s.pipeline.id} in ${s.pipeline.project} (\`az pipelines run --id ${s.pipeline.id} --org ${s.pipeline.org} --project "${s.pipeline.project}"${s.pipeline.branch ? ` --branch ${s.pipeline.branch}` : ""}\`)${ask}.`;
    if (s.kind === "claude") return `${n} ${s.title || "Ask Claude"}: ${s.prompt ?? ""}${ask}.`;
    if (s.kind === "wait") return `${n} ${s.title || "Wait for my OK"}: stop and wait until I confirm.`;
    if (s.kind === "script") return `${n} ${s.title}: run the project's script ${s.scriptId ?? ""}${ask}.`;
    return `${n} ${s.title}: ask me to do this and wait until I confirm.`;
  });
  const description = (wf.goal || wf.name).replace(/\n/g, " ").slice(0, 200);
  return [
    "---",
    `name: ${skillName(wf)}`,
    `description: ${description}. Use when I ask to ${wf.name.toLowerCase()}.`,
    "---",
    "",
    `# ${wf.name}`,
    "",
    ...(wf.goal ? [wf.goal, ""] : []),
    "Do these steps in order. Stop and tell me if one fails.",
    "",
    ...lines,
    "",
  ].join("\n");
}

/** The first message of a chat that moves the workflow to the cloud (a routine or a pipeline). */
export function cloudPrompt(wf: Workflow): string {
  return [
    `Move my Jig workflow "${wf.name}" to the cloud so it runs without Jig open.`,
    wf.goal ? `What it is for: ${wf.goal}` : "",
    `When it runs: ${triggerLabel(wf.trigger)}.`,
    "Steps:",
    ...wf.steps.map(
      (s, i) =>
        `${i + 1}. [${s.kind}, ${effectiveMode(s)}] ${s.title}${s.command ? ` — \`${s.command}\`` : ""}${s.prompt ? ` — ${s.prompt}` : ""}`,
    ),
    "",
    "Propose the better fit and do it after I agree: a Claude Code routine (RemoteTrigger) when the steps need judgement, or an Azure DevOps pipeline (YAML in the repository) when they are builds and deployments. Steps I do by hand stay mine: say how they fit.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
