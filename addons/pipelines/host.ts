import type { AddonHostApi } from "@jig/sdk";
import {
  latestRuns,
  normalizeOrg,
  type Pipeline,
  type Run,
  runState,
  runUrl,
  toPipeline,
  toRun,
} from "./lib/runs";

/**
 * Azure DevOps through the user's `az` CLI (az login + azure-devops extension). No tokens stored.
 */
export interface Settings {
  org: string;
  projects: string[];
}

interface Tracked {
  org: string;
  project: string;
  runId: number;
  name: string;
}

async function az<T>(api: AddonHostApi, args: string[], timeoutMs = 60_000): Promise<T> {
  const r = await api.exec("az", [...args, "-o", "json", "--only-show-errors"], {
    timeoutMs,
    env: { AZURE_CORE_NO_COLOR: "1" },
  });
  if (r.code === 127) throw new Error("The Azure CLI (az) is not installed or not on PATH.");
  if (r.code !== 0) {
    const err = r.stderr.trim();
    if (/az login/i.test(err))
      throw new Error("You're not signed in to the Azure CLI. Run `az login` in a terminal.");
    if (/extension.*azure-devops|is misspelled or not recognized/i.test(err))
      throw new Error("The azure-devops extension is missing. Run `az extension add --name azure-devops`.");
    throw new Error(err.split("\n").slice(-4).join("\n") || `az ${args.slice(0, 2).join(" ")} failed`);
  }
  return (r.stdout.trim() ? JSON.parse(r.stdout) : undefined) as T;
}

export async function settings(_: unknown, api: AddonHostApi): Promise<Settings> {
  return (await api.storage.get<Settings>("settings")) ?? { org: "", projects: [] };
}

export async function saveSettings(next: Settings, api: AddonHostApi) {
  await api.storage.set("settings", {
    org: normalizeOrg(next.org),
    projects: next.projects.map((p) => p.trim()).filter(Boolean),
  });
}

/** Is everything needed there? Each check with a hint. */
export async function check(_: unknown, api: AddonHostApi) {
  const version = await api.exec("az", ["version", "-o", "json"], { timeoutMs: 30_000 });
  if (version.code !== 0)
    return { ok: false, message: "The Azure CLI (az) is not installed or not on PATH." };
  const ext = await api.exec("az", ["extension", "show", "--name", "azure-devops", "-o", "json"], {
    timeoutMs: 30_000,
  });
  if (ext.code !== 0)
    return {
      ok: false,
      message: "The azure-devops extension is missing: az extension add --name azure-devops",
    };
  const account = await api.exec("az", ["account", "show", "-o", "json"], { timeoutMs: 30_000 });
  if (account.code !== 0) return { ok: false, message: "Not signed in: run az login in a terminal." };
  return { ok: true, message: "The Azure CLI is ready." };
}

export async function listProjects({ org }: { org: string }, api: AddonHostApi): Promise<string[]> {
  const result = await az<{ value?: Array<{ name: string }> }>(api, [
    "devops",
    "project",
    "list",
    "--org",
    normalizeOrg(org),
  ]);
  return (result?.value ?? []).map((p) => p.name).sort((a, b) => a.localeCompare(b));
}

export interface ProjectPipelines {
  project: string;
  pipelines: Array<Pipeline & { latest?: Run }>;
  error?: string;
}

export async function overview(
  _: unknown,
  api: AddonHostApi,
): Promise<{ org: string; projects: ProjectPipelines[] }> {
  const s = await settings(undefined, api);
  if (!s.org || s.projects.length === 0) return { org: s.org, projects: [] };
  const projects = await Promise.all(
    s.projects.map(async (project): Promise<ProjectPipelines> => {
      try {
        const common = ["--org", s.org, "--project", project];
        const [pipelines, runs] = await Promise.all([
          az<unknown[]>(api, ["pipelines", "list", ...common]),
          az<unknown[]>(api, ["pipelines", "runs", "list", ...common, "--top", "100"]),
        ]);
        const latest = latestRuns((runs ?? []).map(toRun));
        return {
          project,
          pipelines: (pipelines ?? [])
            .map(toPipeline)
            .map((p) => ({ ...p, latest: latest.get(p.id) }))
            .sort((a, b) => (b.latest?.id ?? 0) - (a.latest?.id ?? 0) || a.name.localeCompare(b.name)),
        };
      } catch (error) {
        return { project, pipelines: [], error: (error as Error).message };
      }
    }),
  );
  return { org: s.org, projects };
}

/** Starts a pipeline on a branch and keeps an eye on it (watcher). */
export async function run(
  { project, id, branch, name }: { project: string; id: number; branch?: string; name: string },
  api: AddonHostApi,
) {
  const s = await settings(undefined, api);
  const result = await az<unknown>(api, [
    "pipelines",
    "run",
    "--id",
    String(id),
    "--org",
    s.org,
    "--project",
    project,
    ...(branch ? ["--branch", branch] : []),
  ]);
  const started = toRun(result);
  const tracked = (await api.storage.get<Tracked[]>("tracked")) ?? [];
  await api.storage.set("tracked", [...tracked, { org: s.org, project, runId: started.id, name }]);
  return { run: started, url: runUrl(s.org, project, started.id) };
}

/** Watcher: notifies when a run started from Jig finishes. */
export async function checkTrackedRuns(_: unknown, api: AddonHostApi) {
  const tracked = (await api.storage.get<Tracked[]>("tracked")) ?? [];
  if (tracked.length === 0) return;
  const still: Tracked[] = [];
  for (const t of tracked) {
    try {
      const r = toRun(
        await az<unknown>(api, [
          "pipelines",
          "runs",
          "show",
          "--id",
          String(t.runId),
          "--org",
          t.org,
          "--project",
          t.project,
        ]),
      );
      const state = runState(r);
      if (state === "running" || state === "queued") still.push(t);
      else
        api.notify({
          title: `${t.name} ${state === "succeeded" ? "succeeded" : state === "failed" ? "failed" : state === "canceled" ? "was cancelled" : "finished"}`,
          message: `Run ${r.buildNumber} on ${r.branch}`,
          tone: state === "succeeded" ? "success" : state === "failed" ? "danger" : "warning",
        });
    } catch (error) {
      api.log(`Could not check run ${t.runId}`, (error as Error).message);
      still.push(t);
    }
  }
  await api.storage.set("tracked", still);
  if (still.length !== tracked.length) api.emit("runs-changed");
}

export async function tracked(_: unknown, api: AddonHostApi) {
  return (await api.storage.get<Tracked[]>("tracked")) ?? [];
}
