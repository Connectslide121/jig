import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import type { ProjectScripts, ScriptGroup } from "../../shared/terminals";
import { publishActivity } from "../activity/bus";
import { getConfig } from "../config";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";
import { terminalManager } from "../terminals";
import { defaultShell, makeWhich, shellFamily } from "../terminals/shell";
import { findGitBash } from "./bash";
import { discoverScriptsAndDirs } from "./discover";
import { createScriptWatcher } from "./watch";

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

let gitBash: { found?: string } | undefined;

/** The shell scripts run in and, on Windows, the Git Bash for `.sh` files (looked up once). */
function discoverOptions() {
  const shell = shellFamily(
    defaultShell(getConfig().terminal.shell, process.platform, process.env, makeWhich(process.env)),
  );
  if (process.platform !== "win32") return { shell };
  gitBash ??= { found: findGitBash(process.env, existsSync) };
  return { shell, bash: gitBash.found };
}

async function loadScripts(projectId: string) {
  const info = (await projectStore().state()).projects.find((p) => p.id === projectId);
  if (!info) throw new JigError("not_found", "Project not found");
  const repos = info.repos.map((r) => r.path);
  const { scripts, dirs } = await discoverScriptsAndDirs(
    info.path,
    process.platform,
    repos,
    discoverOptions(),
  );
  const result: ProjectScripts = { projectId, scripts, groups: await groupsFor(projectId) };
  return { result, dirs };
}

export async function projectScripts(projectId: string): Promise<ProjectScripts> {
  return (await loadScripts(projectId)).result;
}

/** Re-lists a project's scripts when their files change and tells the view (D-238). */
const scriptWatcher = createScriptWatcher(loadScripts, (result) => emit("scripts.changed", result));

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
  handle("scripts.list", async ({ projectId }) => {
    const loaded = await loadScripts(projectId);
    scriptWatcher.track(projectId, loaded);
    return loaded.result;
  });
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
