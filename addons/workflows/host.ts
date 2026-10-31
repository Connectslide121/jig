import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import {
  describeWorkflow,
  type EventTrigger,
  eventFires,
  isDue,
  isEventTrigger,
  markStep,
  newRun,
  nextStep,
  pipelineResultMatches,
  pushMark,
  type Run,
  runsUnattended,
  type Step,
  type StepInput,
  skillName,
  type Trigger,
  toSkill,
  triggerLabel,
  type Workflow,
  workflowFromInput,
} from "./lib/workflow";

/**
 * Workflows (D-112): stored per project in this add-on's storage (private to you, in `~/.jig`). Runs
 * are driven by the workflow tab; commands and pipelines run here. Schedules and events (a push, a
 * pipeline finishing; D-177) fire while Jig is open: a workflow Jig can do alone runs; otherwise you
 * get a notification to start it.
 */
const key = (projectId: string) => `workflows:${projectId}`;

export async function list({ projectId }: { projectId: string }, api: AddonHostApi): Promise<Workflow[]> {
  return (await api.storage.get<Workflow[]>(key(projectId))) ?? [];
}

export async function save({ workflow }: { workflow: Workflow }, api: AddonHostApi): Promise<Workflow> {
  const all = await list({ projectId: workflow.projectId }, api);
  const next = { ...workflow, updatedAt: new Date().toISOString() };
  const index = all.findIndex((w) => w.id === workflow.id);
  if (index >= 0) all[index] = next;
  else all.push(next);
  await api.storage.set(key(workflow.projectId), all);
  api.emit("changed", { projectId: workflow.projectId });
  return next;
}

export async function remove({ projectId, id }: { projectId: string; id: string }, api: AddonHostApi) {
  await api.storage.set(
    key(projectId),
    (await list({ projectId }, api)).filter((w) => w.id !== id),
  );
  await api.storage.set(`runs:${id}`, undefined);
  api.emit("changed", { projectId });
}

export async function runs({ id }: { id: string }, api: AddonHostApi): Promise<Run[]> {
  return (await api.storage.get<Run[]>(`runs:${id}`)) ?? [];
}

export async function saveRun({ run }: { run: Run }, api: AddonHostApi): Promise<void> {
  const all = await runs({ id: run.workflowId }, api);
  const index = all.findIndex((r) => r.id === run.id);
  if (index >= 0) all[index] = run;
  else all.unshift(run);
  await api.storage.set(`runs:${run.workflowId}`, all.slice(0, 20));
  api.emit("runs", { workflowId: run.workflowId });
}

/** A command line in the platform's shell; the output (last 4000 characters) and whether it worked. */
export async function runCommand(
  { command, cwd }: { command: string; cwd: string },
  api: AddonHostApi,
): Promise<{ ok: boolean; output: string }> {
  const [shell, args] =
    process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", command]] : ["sh", ["-c", command]];
  const r = await api.exec(shell, args as string[], { cwd, timeoutMs: 30 * 60_000 });
  const output = `${r.stdout}${r.stderr ? `\n${r.stderr}` : ""}`.trim();
  return { ok: r.code === 0, output: output.slice(-4000) || `exit code ${r.code}` };
}

export async function runPipeline(
  { pipeline }: { pipeline: NonNullable<Step["pipeline"]> },
  api: AddonHostApi,
): Promise<{ ok: boolean; output: string }> {
  const r = await api.exec(
    "az",
    [
      "pipelines",
      "run",
      "--id",
      String(pipeline.id),
      "--org",
      pipeline.org,
      "--project",
      pipeline.project,
      ...(pipeline.branch ? ["--branch", pipeline.branch] : []),
      "-o",
      "json",
      "--only-show-errors",
    ],
    { timeoutMs: 120_000, env: { AZURE_CORE_NO_COLOR: "1" } },
  );
  if (r.code !== 0) return { ok: false, output: r.stderr.trim().slice(-2000) || "az pipelines run failed" };
  try {
    const run = JSON.parse(r.stdout) as { buildNumber?: string; id?: number };
    return { ok: true, output: `Started run ${run.buildNumber ?? run.id}.` };
  } catch {
    return { ok: true, output: "Started." };
  }
}

/** Writes the workflow as a Claude Code skill in the project: `.claude/skills/<name>/SKILL.md`. */
export async function exportSkill(
  { workflow, folder }: { workflow: Workflow; folder: string },
  api: AddonHostApi,
): Promise<string> {
  const dir = join(folder, ".claude", "skills", skillName(workflow));
  await mkdir(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  await api.fs.writeFile(file, toSkill(workflow));
  return file;
}

/** Runs an unattended workflow (every step an automatic command or pipeline) here, start to end. */
async function runUnattended(
  wf: Workflow,
  folder: string,
  api: AddonHostApi,
  by: Run["by"] = "schedule",
): Promise<Run> {
  let run = newRun(wf, by);
  await saveRun({ run }, api);
  for (let next = nextStep(wf, run); next; next = nextStep(wf, run)) {
    const s = next.step;
    const result =
      s.kind === "pipeline" && s.pipeline
        ? await runPipeline({ pipeline: s.pipeline }, api)
        : await runCommand({ command: s.command ?? "", cwd: s.cwd || folder }, api);
    run = markStep(run, s.id, result.ok ? "done" : "failed", result.output);
    await saveRun({ run }, api);
  }
  return run;
}

/** Runs a triggered workflow if Jig can do it alone, else tells you it's time to run it. */
async function fire(
  wf: Workflow,
  project: { name: string; path: string },
  api: AddonHostApi,
  by: Run["by"],
  why: string,
) {
  if (runsUnattended(wf)) {
    const run = await runUnattended(wf, project.path, api, by);
    api.notify({
      title: `${wf.name} ${run.status === "done" ? "ran" : "failed"}`,
      message:
        run.status === "done"
          ? `${project.name}: ${why}; every step done.`
          : `${project.name}: ${why}; a step failed. Open Workflows for the output.`,
      tone: run.status === "done" ? "success" : "danger",
    });
  } else
    api.notify({
      title: `Time for ${wf.name}`,
      message: `${project.name}: ${why}. Open Workflows to run it (some steps need you).`,
      tone: "info",
    });
}

/** What an event trigger watches right now: the pushed commit, or the newest finished pipeline run. */
async function eventMark(
  trigger: EventTrigger,
  folder: string,
  api: AddonHostApi,
): Promise<{ mark?: string; result?: string }> {
  if (trigger.kind === "push") {
    const git = (...args: string[]) => api.exec("git", args, { cwd: folder, timeoutMs: 10_000 });
    const branch = trigger.branch?.trim() || (await git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();
    if (!branch || branch === "HEAD") return {};
    const upstream = await git("rev-parse", "--symbolic-full-name", `${branch}@{u}`);
    if (upstream.code !== 0 || !upstream.stdout.trim()) return {};
    const reflog = await git("reflog", "show", "-n1", "--format=%H%x09%gs", upstream.stdout.trim());
    return { mark: reflog.code === 0 ? pushMark(reflog.stdout) : undefined };
  }
  const { org, project, id } = trigger.pipeline;
  if (!org || !project || !id) return {};
  const r = await api.exec(
    "az",
    [
      "pipelines",
      "runs",
      "list",
      "--pipeline-ids",
      String(id),
      "--org",
      org,
      "--project",
      project,
      "--status",
      "completed",
      "--top",
      "1",
      "-o",
      "json",
      "--only-show-errors",
    ],
    { timeoutMs: 60_000, env: { AZURE_CORE_NO_COLOR: "1" } },
  );
  if (r.code !== 0) return {};
  try {
    const [run] = JSON.parse(r.stdout) as Array<{ id?: number; result?: string }>;
    return run?.id ? { mark: String(run.id), result: run.result ?? "" } : {};
  } catch {
    return {};
  }
}

/** Watcher (every minute): scheduled workflows that are due, and workflows whose event happened. */
export async function checkSchedules(_: unknown, api: AddonHostApi) {
  const triggered = (await api.storage.get<Record<string, string>>("triggered")) ?? {};
  const marks = (await api.storage.get<Record<string, string>>("marks")) ?? {};
  const now = new Date();
  for (const project of await api.projects()) {
    for (const wf of await list({ projectId: project.id }, api)) {
      const trigger = wf.trigger;
      if (isEventTrigger(trigger)) {
        const seen: { mark?: string; result?: string } = await eventMark(trigger, project.path, api).catch(
          () => ({}),
        );
        if (!seen.mark) continue;
        // Keyed by what it watches too: changing the branch or pipeline starts afresh.
        const markKey = `${wf.id}:${JSON.stringify(trigger)}`;
        const last = marks[markKey];
        if (last === seen.mark) continue;
        // Saved before it runs, like a schedule: a long run must not fire twice.
        marks[markKey] = seen.mark;
        await api.storage.set("marks", marks);
        if (!eventFires(last, seen.mark)) continue;
        if (trigger.kind === "pipeline" && !pipelineResultMatches(trigger.result, seen.result ?? ""))
          continue;
        triggered[wf.id] = now.toISOString();
        await api.storage.set("triggered", triggered);
        await fire(
          wf,
          project,
          api,
          "event",
          trigger.kind === "push"
            ? `you pushed ${trigger.branch || "your branch"}`
            : `pipeline ${trigger.pipeline.id} finished (${seen.result || "done"})`,
        );
        continue;
      }
      if (!isDue(trigger, triggered[wf.id], now, wf.createdAt)) continue;
      // Saved before it runs: a long run must not look due again (or after a restart mid-run).
      triggered[wf.id] = now.toISOString();
      await api.storage.set("triggered", triggered);
      await fire(wf, project, api, "schedule", "it's time");
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Tools for Claude (`contributes.tools`): list, read, save, delete and run workflows from a chat.

interface ToolArgs {
  project?: string;
  chat?: { cwd?: string; projectId?: string };
}

async function resolveProject(args: ToolArgs, api: AddonHostApi) {
  const projects = await api.projects();
  const want = args.project?.trim().toLowerCase();
  const p = want
    ? projects.find((x) => x.id === args.project || x.name.toLowerCase() === want)
    : projects.find((x) => x.id === args.chat?.projectId);
  if (!p)
    throw new Error(
      `${want ? `No project "${args.project}"` : "This chat is in no project"}. Projects: ${projects.map((x) => x.name).join(", ")}`,
    );
  return p;
}

async function resolveWorkflow(args: ToolArgs & { workflow: string }, api: AddonHostApi) {
  const project = await resolveProject(args, api);
  const all = await list({ projectId: project.id }, api);
  const want = args.workflow.trim().toLowerCase();
  const wf = all.find((w) => w.id === args.workflow || w.name.toLowerCase() === want);
  if (!wf)
    throw new Error(
      `No workflow "${args.workflow}" in ${project.name}. Workflows: ${all.map((w) => w.name).join(", ") || "(none)"}`,
    );
  return { project, wf };
}

export async function toolList(args: ToolArgs, api: AddonHostApi): Promise<string> {
  const project = await resolveProject(args, api);
  const all = await list({ projectId: project.id }, api);
  if (!all.length) return `${project.name} has no workflows yet.`;
  return [
    `Workflows of ${project.name}:`,
    ...all.map(
      (w) =>
        `- ${w.name}: ${w.steps.length} steps, ${triggerLabel(w.trigger)}${w.goal ? ` — ${w.goal}` : ""}`,
    ),
  ].join("\n");
}

export async function toolGet(args: ToolArgs & { workflow: string }, api: AddonHostApi): Promise<string> {
  const { wf } = await resolveWorkflow(args, api);
  const history = (await runs({ id: wf.id }, api)).slice(0, 5);
  return [
    describeWorkflow(wf),
    history.length
      ? `Last runs: ${history.map((r) => `${r.startedAt.slice(0, 16)} ${r.status}`).join("; ")}`
      : "Never run yet.",
  ].join("\n\n");
}

export async function toolSave(
  args: ToolArgs & { name: string; goal?: string; steps: Array<StepInput | string>; trigger?: Trigger },
  api: AddonHostApi,
): Promise<string> {
  const project = await resolveProject(args, api);
  if (!args.steps?.length) throw new Error("Give the steps");
  const existing = (await list({ projectId: project.id }, api)).find(
    (w) => w.name.toLowerCase() === args.name.trim().toLowerCase(),
  );
  const saved = await save({ workflow: workflowFromInput(args, project.id, existing) }, api);
  return `${existing ? "Updated" : "Saved"} the workflow in ${project.name} (the user finds it in Workflows, left sidebar):\n${describeWorkflow(saved)}`;
}

export async function toolDelete(args: ToolArgs & { workflow: string }, api: AddonHostApi): Promise<string> {
  const { project, wf } = await resolveWorkflow(args, api);
  await remove({ projectId: project.id, id: wf.id }, api);
  return `Deleted ${wf.name} from ${project.name}.`;
}

/**
 * Runs a workflow from a chat: Jig's automatic steps (commands, pipelines) run here; it stops at the
 * first step that is the user's, asks first, or is for Claude, and says what comes next.
 */
export async function toolRun(args: ToolArgs & { workflow: string }, api: AddonHostApi): Promise<string> {
  const { project, wf } = await resolveWorkflow(args, api);
  let run = newRun(wf);
  const out: string[] = [];
  for (let next = nextStep(wf, run); next; next = nextStep(wf, run)) {
    const s = next.step;
    const runnable = next.mode === "auto" && (s.kind === "command" || s.kind === "pipeline");
    if (!runnable) {
      const n = wf.steps.indexOf(s) + 1;
      const rest = wf.steps.slice(n);
      out.push(
        `Stopped at step ${n}, "${s.title}" (${s.kind}, ${next.mode === "ask" ? "ask the user first" : next.mode === "manual" ? "the user does it" : "for you"}).`,
        s.kind === "claude"
          ? `It's a message for you: ${s.prompt ?? s.title}. Do it in this chat.`
          : s.kind === "command"
            ? `Ask the user, then run \`${s.command}\` yourself if they agree.`
            : "Ask the user to do it and tell you when it's done.",
        rest.length ? `Then: ${rest.map((x) => x.title).join(" → ")}` : "That's the last step.",
        "The user can also run it step by step in the Workflows tab.",
      );
      break;
    }
    const result =
      s.kind === "pipeline" && s.pipeline
        ? await runPipeline({ pipeline: s.pipeline }, api)
        : await runCommand({ command: s.command ?? "", cwd: s.cwd || project.path }, api);
    run = markStep(run, s.id, result.ok ? "done" : "failed", result.output);
    out.push(`${result.ok ? "✓" : "✗"} ${s.title}\n${result.output.slice(-1500)}`);
    if (!result.ok) break;
  }
  if (run.status === "running") run = { ...run, status: "stopped", finishedAt: new Date().toISOString() };
  await saveRun({ run }, api);
  return [`${wf.name}:`, ...out, run.status === "done" ? "Every step is done." : ""]
    .filter(Boolean)
    .join("\n\n");
}
