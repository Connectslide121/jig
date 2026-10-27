import { randomUUID } from "node:crypto";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import type { ProjectScripts, ScriptGroup } from "../../shared/terminals";
import { publishActivity } from "../activity/bus";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";
import { terminalManager } from "../terminals";
import { discoverScripts } from "./discover";

/** Script groups ("Start local" = front + back) per project, in `~/.jig/scripts.json`. */
const GroupsSchema = z.object({
  groups: z
    .record(
      z.string(),
      z.array(z.object({ id: z.string(), name: z.string(), scriptIds: z.array(z.string()) })),
    )
    .default({}),
});

async function groupsFor(projectId: string): Promise<ScriptGroup[]> {
  return (await readJson(paths.scripts(), GroupsSchema)).groups[projectId] ?? [];
}

async function saveGroups(projectId: string, groups: ScriptGroup[]) {
  const data = await readJson(paths.scripts(), GroupsSchema);
  data.groups[projectId] = groups;
  await writeJson(paths.scripts(), data);
}

export async function projectScripts(projectId: string): Promise<ProjectScripts> {
  const project = await projectStore().get(projectId);
  return { projectId, scripts: await discoverScripts(project.path), groups: await groupsFor(projectId) };
}

function runningTerminal(projectId: string, scriptId: string) {
  return terminalManager()
    .list()
    .find((t) => t.projectId === projectId && t.scriptId === scriptId && t.status === "running");
}

export async function runScript(projectId: string, scriptId: string) {
  const existing = runningTerminal(projectId, scriptId);
  if (existing) return existing;
  const { scripts } = await projectScripts(projectId);
  const script = scripts.find((s) => s.id === scriptId);
  if (!script) throw new JigError("not_found", "Script not found (was it renamed?)");
  // A finished run of the same script is replaced, so the panel doesn't fill up.
  for (const old of terminalManager().list())
    if (old.projectId === projectId && old.scriptId === scriptId) terminalManager().close(old.id);
  publishActivity({ kind: "script.run", text: script.command, projectId, detail: { script: script.name } });
  return terminalManager().create({
    projectId,
    cwd: script.cwd,
    command: script.command,
    title: script.folder ? `${script.folder}: ${script.name}` : script.name,
    scriptId,
  });
}

export function registerScriptHandlers(): void {
  handle("scripts.list", ({ projectId }) => projectScripts(projectId));
  handle("scripts.run", ({ projectId, scriptId }) => runScript(projectId, scriptId));
  handle("scripts.stop", ({ projectId, scriptId }) => {
    const t = runningTerminal(projectId, scriptId);
    if (t) terminalManager().kill(t.id);
  });
  handle("scripts.restart", async ({ projectId, scriptId }) => {
    const t = runningTerminal(projectId, scriptId);
    if (t) {
      terminalManager().close(t.id);
      await new Promise((r) => setTimeout(r, 300));
    }
    return runScript(projectId, scriptId);
  });
  handle("scripts.saveGroup", async ({ projectId, group }) => {
    const groups = await groupsFor(projectId);
    const saved = { ...group, id: group.id ?? randomUUID(), name: group.name.trim() || "Group" };
    const next = groups.some((g) => g.id === saved.id)
      ? groups.map((g) => (g.id === saved.id ? saved : g))
      : [...groups, saved];
    await saveGroups(projectId, next);
    const result = await projectScripts(projectId);
    emit("scripts.changed", result);
    return result;
  });
  handle("scripts.deleteGroup", async ({ projectId, groupId }) => {
    await saveGroups(
      projectId,
      (await groupsFor(projectId)).filter((g) => g.id !== groupId),
    );
    const result = await projectScripts(projectId);
    emit("scripts.changed", result);
    return result;
  });
  handle("scripts.runGroup", async ({ projectId, groupId }) => {
    const group = (await groupsFor(projectId)).find((g) => g.id === groupId);
    if (!group) throw new JigError("not_found", "Group not found");
    const started = [];
    for (const scriptId of group.scriptIds) started.push(await runScript(projectId, scriptId));
    return started;
  });
}
