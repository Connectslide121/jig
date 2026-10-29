import type { AddonHostApi } from "@jig/sdk";
import { effectiveOrgs, inBatches, type OrgSettings, orgUrl, readSettings, type Settings } from "./lib/orgs";
import { latestRuns, type Pipeline, type Run, runState, runUrl, toPipeline, toRun } from "./lib/runs";

export type { OrgSettings, Settings };

/**
 * Azure DevOps through the user's `az` CLI (az login + azure-devops extension). No tokens stored.
 * Every organisation the login belongs to by default, or the ones you list (D-125).
 */
interface Tracked {
  org: string;
  project: string;
  runId: number;
  name: string;
  /** Checks in a row that failed (az signed out, run deleted…): given up after MAX_FAILS. */
  fails?: number;
}

const MAX_FAILS = 30;
/** Azure DevOps' resource id, for `az rest` with your az login. */
const DEVOPS = "499b84ac-1321-427f-aa17-267ca6975798";
/** At most this many az processes at a time (each starts Python, 1–3 s). */
const PARALLEL = 4;
const HOUR = 60 * 60_000;
/** Pipelines change rarely: listed again every 10 minutes; their latest runs on every refresh. */
const PIPELINES_FOR = 10 * 60_000;

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

/** Remembers an answer for a while (in this process only); a failed answer is asked again. */
function remembered<T>(ms: number) {
  const values = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = values.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = load();
    values.set(key, { at: Date.now(), value });
    value.catch(() => values.delete(key));
    return value;
  };
}
const orgsCache = remembered<string[]>(HOUR);
const projectsCache = remembered<string[]>(HOUR);
const pipelinesCache = remembered<Pipeline[]>(PIPELINES_FOR);

export async function settings(_: unknown, api: AddonHostApi): Promise<Settings> {
  return readSettings(await api.storage.get("settings"));
}

export async function saveSettings(next: Settings, api: AddonHostApi) {
  await api.storage.set("settings", readSettings(next));
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

/** The organisations your az login belongs to (Azure DevOps' profile and accounts APIs). */
export async function listOrgs(_: unknown, api: AddonHostApi): Promise<string[]> {
  return orgsCache("me", async () => {
    const rest = (uri: string, params: string[]) =>
      az<{ id?: string; value?: Array<{ accountName: string }> }>(api, [
        "rest",
        "--method",
        "get",
        "--resource",
        DEVOPS,
        "--uri",
        uri,
        "--uri-parameters",
        ...params,
      ]);
    const me = await rest("https://app.vssps.visualstudio.com/_apis/profile/profiles/me", [
      "api-version=7.1",
    ]);
    if (!me?.id) return [];
    const accounts = await rest("https://app.vssps.visualstudio.com/_apis/accounts", [
      `memberId=${me.id}`,
      "api-version=7.1",
    ]);
    return (accounts?.value ?? []).map((a) => orgUrl(a.accountName)).sort((a, b) => a.localeCompare(b));
  });
}

export async function listProjects({ org }: { org: string }, api: AddonHostApi): Promise<string[]> {
  return projectsCache(orgUrl(org).toLowerCase(), async () => {
    const result = await az<{ value?: Array<{ name: string }> }>(api, [
      "devops",
      "project",
      "list",
      "--org",
      orgUrl(org),
    ]);
    return (result?.value ?? []).map((p) => p.name).sort((a, b) => a.localeCompare(b));
  });
}

export interface ProjectPipelines {
  project: string;
  pipelines: Array<Pipeline & { latest?: Run }>;
  error?: string;
}

export interface OrgPipelines {
  org: string;
  projects: ProjectPipelines[];
  error?: string;
}

/** The organisations to show (yours by default, and the ones listed in the settings). */
async function orgsToShow(api: AddonHostApi): Promise<{ orgs: OrgSettings[]; error?: string }> {
  const s = await settings(undefined, api);
  if (!s.allOrgs) return { orgs: effectiveOrgs(s, []) };
  try {
    return { orgs: effectiveOrgs(s, await listOrgs(undefined, api)) };
  } catch (error) {
    // Not signed in, or az missing: the organisations listed by hand still show.
    return { orgs: effectiveOrgs(s, []), error: (error as Error).message };
  }
}

export async function overview(
  _: unknown,
  api: AddonHostApi,
): Promise<{ orgs: OrgPipelines[]; error?: string }> {
  const { orgs, error } = await orgsToShow(api);
  const withProjects = await inBatches(orgs, PARALLEL, async (o) => {
    try {
      return { org: o.org, projects: o.projects ?? (await listProjects({ org: o.org }, api)) };
    } catch (e) {
      return { org: o.org, projects: [] as string[], error: (e as Error).message };
    }
  });
  const pairs = withProjects.flatMap((o) => o.projects.map((project) => ({ org: o.org, project })));
  const loaded = await inBatches(pairs, PARALLEL, async ({ org, project }): Promise<ProjectPipelines> => {
    try {
      const common = ["--org", org, "--project", project];
      const pipelines = await pipelinesCache(`${org}|${project}`.toLowerCase(), async () =>
        ((await az<unknown[]>(api, ["pipelines", "list", ...common])) ?? []).map(toPipeline),
      );
      // A project without pipelines has no runs to ask for.
      const runs = pipelines.length
        ? await az<unknown[]>(api, ["pipelines", "runs", "list", ...common, "--top", "100"])
        : [];
      const latest = latestRuns((runs ?? []).map(toRun));
      return {
        project,
        pipelines: pipelines
          .map((p) => ({ ...p, latest: latest.get(p.id) }))
          .sort((a, b) => (b.latest?.id ?? 0) - (a.latest?.id ?? 0) || a.name.localeCompare(b.name)),
      };
    } catch (e) {
      return { project, pipelines: [], error: (e as Error).message };
    }
  });
  let i = 0;
  return {
    error,
    orgs: withProjects.map((o) => ({
      org: o.org,
      error: o.error,
      projects: o.projects.map(() => loaded[i++]!),
    })),
  };
}

/** Starts a pipeline on a branch and keeps an eye on it (watcher). */
export async function run(
  {
    org,
    project,
    id,
    branch,
    name,
  }: { org: string; project: string; id: number; branch?: string; name: string },
  api: AddonHostApi,
) {
  const result = await az<unknown>(api, [
    "pipelines",
    "run",
    "--id",
    String(id),
    "--org",
    orgUrl(org),
    "--project",
    project,
    ...(branch ? ["--branch", branch] : []),
  ]);
  const started = toRun(result);
  const tracked = (await api.storage.get<Tracked[]>("tracked")) ?? [];
  await api.storage.set("tracked", [...tracked, { org: orgUrl(org), project, runId: started.id, name }]);
  return { run: started, url: runUrl(orgUrl(org), project, started.id) };
}

/** Watcher: notifies when a run started from Jig finishes. */
export async function checkTrackedRuns(_: unknown, api: AddonHostApi) {
  const tracked = (await api.storage.get<Tracked[]>("tracked")) ?? [];
  if (tracked.length === 0) return;
  const finished = new Set<number>();
  const failing = new Map<number, number>();
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
      if (state === "running" || state === "queued") failing.set(t.runId, 0);
      else {
        finished.add(t.runId);
        api.notify({
          title: `${t.name} ${state === "succeeded" ? "succeeded" : state === "failed" ? "failed" : state === "canceled" ? "was cancelled" : "finished"}`,
          message: `Run ${r.buildNumber} on ${r.branch}`,
          tone: state === "succeeded" ? "success" : state === "failed" ? "danger" : "warning",
        });
      }
    } catch (error) {
      api.log(`Could not check run ${t.runId}`, (error as Error).message);
      const fails = (t.fails ?? 0) + 1;
      if (fails >= MAX_FAILS) finished.add(t.runId);
      else failing.set(t.runId, fails);
    }
  }
  // Read again: a run started while these checks ran stays tracked.
  const now = (await api.storage.get<Tracked[]>("tracked")) ?? [];
  await api.storage.set(
    "tracked",
    now
      .filter((t) => !finished.has(t.runId))
      .map((t) => (failing.has(t.runId) ? { ...t, fails: failing.get(t.runId) || undefined } : t)),
  );
  if (finished.size) api.emit("runs-changed");
}

export async function tracked(_: unknown, api: AddonHostApi) {
  return (await api.storage.get<Tracked[]>("tracked")) ?? [];
}
