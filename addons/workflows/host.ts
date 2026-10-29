import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import {
  isDue,
  markStep,
  newRun,
  nextStep,
  type Run,
  runsUnattended,
  type Step,
  skillName,
  toSkill,
  type Workflow,
} from "./lib/workflow";

/**
 * Workflows (D-112): stored per project in this add-on's storage (private to you, in `~/.jig`). Runs
 * are driven by the workflow tab; commands and pipelines run here. Schedules fire while Jig is open:
 * a workflow Jig can do alone runs; otherwise you get a notification to start it.
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
async function runUnattended(wf: Workflow, folder: string, api: AddonHostApi): Promise<Run> {
  let run = newRun(wf, "schedule");
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

/** Watcher (every minute): scheduled workflows that are due. */
export async function checkSchedules(_: unknown, api: AddonHostApi) {
  const triggered = (await api.storage.get<Record<string, string>>("triggered")) ?? {};
  const now = new Date();
  let changed = false;
  for (const project of await api.projects()) {
    for (const wf of await list({ projectId: project.id }, api)) {
      if (!isDue(wf.trigger, triggered[wf.id], now, wf.createdAt)) continue;
      triggered[wf.id] = now.toISOString();
      changed = true;
      if (runsUnattended(wf)) {
        const run = await runUnattended(wf, project.path, api);
        api.notify({
          title: `${wf.name} ${run.status === "done" ? "ran" : "failed"}`,
          message:
            run.status === "done"
              ? `${project.name}: every step done.`
              : `${project.name}: a step failed. Open Workflows for the output.`,
          tone: run.status === "done" ? "success" : "danger",
        });
      } else
        api.notify({
          title: `Time for ${wf.name}`,
          message: `${project.name}: open Workflows to run it (some steps need you).`,
          tone: "info",
        });
    }
  }
  if (changed) await api.storage.set("triggered", triggered);
}
