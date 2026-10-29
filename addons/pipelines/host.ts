import { basename, join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import {
  branchList,
  fromBuild,
  isRetired,
  newestPerPipeline,
  type PipelineInfo,
  type PipelineRun,
  parseParameters,
  parseRemote,
  runParameters,
  stagesOf,
} from "./lib/devops";
import { effectiveOrgs, inBatches, type OrgSettings, orgUrl, readSettings, type Settings } from "./lib/orgs";
import { latestRuns, type Pipeline, type Run, runState, runUrl, toPipeline, toRun } from "./lib/runs";

export type { OrgSettings, PipelineInfo, PipelineRun, Settings };

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

// ── Pipelines of your repositories, like the pipelines plugin (D-148) ──────────────────────────────

/** Found pipelines are kept (storage `found`) and looked for again after this long, or on request. */
const FIND_AGAIN = 6 * HOUR;

export interface Found {
  at: number;
  pipelines: PipelineInfo[];
  /** Repositories whose pipelines couldn't be listed, with why. */
  errors: string[];
}

async function git(api: AddonHostApi, cwd: string, args: string[]) {
  const r = await api.exec("git", args, { cwd, timeoutMs: 20_000, env: { GIT_TERMINAL_PROMPT: "0" } });
  return r.code === 0 ? r.stdout : "";
}

/** Every repository checkout of your workspaces, each once. */
async function checkouts(api: AddonHostApi): Promise<Array<{ path: string; name: string }>> {
  const seen = new Set<string>();
  return (await api.workspaces())
    .filter((w) => w.exists)
    .flatMap((w) => (w.isGitRepo ? [{ path: w.path, name: w.name }] : (w.repos ?? [])))
    .map((r) => ({ path: r.path, name: r.name || basename(r.path) }))
    .filter((r) => !seen.has(r.path.toLowerCase()) && Boolean(seen.add(r.path.toLowerCase())));
}

/**
 * The pipelines of the Azure DevOps repositories you have checked out: each checkout's `origin`, the
 * pipelines building that repository (not retired ones), their YAML file and its run-time parameters.
 * A repository checked out twice (worktrees) counts once.
 */
export async function pipelines({ force }: { force?: boolean } = {}, api: AddonHostApi): Promise<Found> {
  const kept = await api.storage.get<Found>("found");
  if (kept && !force && Date.now() - kept.at < FIND_AGAIN) return kept;
  const remotes = new Map<
    string,
    { path: string; name: string; org: string; project: string; repo: string }
  >();
  for (const c of await checkouts(api)) {
    const remote = parseRemote(await git(api, c.path, ["remote", "get-url", "origin"]));
    if (!remote) continue;
    const id = `${remote.org}/${remote.project}/${remote.repo}`.toLowerCase();
    if (!remotes.has(id)) remotes.set(id, { ...c, ...remote });
  }
  const errors: string[] = [];
  const found = await inBatches([...remotes.values()], PARALLEL, async (r) => {
    const common = ["--org", orgUrl(r.org), "--project", r.project];
    try {
      const listed =
        (await az<Array<{ id: number; name: string; queueStatus?: string }>>(api, [
          "pipelines",
          "list",
          ...common,
          "--repository",
          r.repo,
          "--repository-type",
          "tfsgit",
        ])) ?? [];
      return await inBatches(
        listed.filter((p) => !isRetired(p.name, p.queueStatus ?? "enabled")),
        PARALLEL,
        async (p): Promise<PipelineInfo> => {
          // biome-ignore lint/suspicious/noExplicitAny: az JSON.
          const shown = await az<any>(api, ["pipelines", "show", "--id", String(p.id), ...common]);
          const yaml = String(shown?.process?.yamlFilename ?? "").replace(/^\/+/, "");
          const text = yaml ? await api.fs.readFile(join(r.path, yaml)).catch(() => "") : "";
          return {
            key: `${r.org}/${r.project}/${p.id}`,
            org: r.org,
            project: r.project,
            id: p.id,
            name: p.name,
            repoPath: r.path,
            repoName: r.name,
            yaml,
            defaultBranch: String(shown?.repository?.defaultBranch ?? "refs/heads/main").replace(
              /^refs\/heads\//,
              "",
            ),
            params: parseParameters(text),
          };
        },
      );
    } catch (error) {
      errors.push(`${r.name}: ${(error as Error).message}`);
      return [];
    }
  });
  const result: Found = {
    at: Date.now(),
    pipelines: found
      .flat()
      .sort((a, b) => a.repoName.localeCompare(b.repoName) || a.name.localeCompare(b.name)),
    errors,
  };
  // A failed search (signed out…) doesn't replace pipelines found before.
  if (result.pipelines.length || !kept?.pipelines.length) await api.storage.set("found", result);
  return result.pipelines.length || !kept ? result : { ...kept, errors };
}

/** A finished run's stages don't change: asked for once. */
const finishedStages = new Map<string, PipelineRun["stages"]>();

/**
 * The newest run of each pipeline (`keys` from `pipelines`), with its stages: one `az pipelines runs
 * list` per Azure DevOps project, a timeline per run (once for a finished one).
 */
export async function latest(
  { keys }: { keys: string[] },
  api: AddonHostApi,
): Promise<{ runs: Record<string, PipelineRun | null>; error?: string }> {
  const byProject = new Map<string, { org: string; project: string; ids: number[] }>();
  for (const key of keys) {
    const [org, project, id] = key.split("/");
    if (!org || !project || !id) continue;
    const group = byProject.get(`${org}/${project}`) ?? { org, project, ids: [] };
    group.ids.push(Number(id));
    byProject.set(`${org}/${project}`, group);
  }
  const runs: Record<string, PipelineRun | null> = Object.fromEntries(keys.map((k) => [k, null]));
  let error: string | undefined;
  await inBatches([...byProject.values()], PARALLEL, async ({ org, project, ids }) => {
    const common = ["--org", orgUrl(org), "--project", project];
    try {
      const list =
        // biome-ignore lint/suspicious/noExplicitAny: az JSON.
        (await az<any[]>(api, [
          "pipelines",
          "runs",
          "list",
          ...common,
          "--pipeline-ids",
          ...ids.map(String),
          "--top",
          String(Math.max(20, ids.length * 5)),
          "--query-order",
          "QueueTimeDesc",
        ])) ?? [];
      const newest = newestPerPipeline(
        list.flatMap((b) => {
          const run = fromBuild(b);
          return run ? [{ ...run, pipelineId: Number(b.definition?.id) }] : [];
        }),
      );
      await inBatches([...newest.entries()], PARALLEL, async ([id, run]) => {
        const stageKey = `${org}/${project}/${run.id}`;
        let stages = finishedStages.get(stageKey);
        if (!stages) {
          const timeline = await az<{ records?: Array<Record<string, unknown>> }>(api, [
            "devops",
            "invoke",
            "--area",
            "build",
            "--resource",
            "Timeline",
            "--route-parameters",
            `project=${project}`,
            `buildId=${run.id}`,
            "--org",
            orgUrl(org),
            "--api-version",
            "7.1",
          ]).catch(() => null);
          stages = stagesOf(timeline);
          // A failed read is asked again next time; a finished run's real stages are kept.
          if (timeline && run.status === "completed") finishedStages.set(stageKey, stages);
        }
        runs[`${org}/${project}/${id}`] = { ...run, stages };
      });
    } catch (e) {
      error = (e as Error).message;
    }
  });
  return { runs, error };
}

/** The branches to run a pipeline on: the default first, then the checkout's and origin's. */
export async function branches({ key }: { key: string }, api: AddonHostApi): Promise<string[]> {
  const p = (await api.storage.get<Found>("found"))?.pipelines.find((x) => x.key === key);
  if (!p) return [];
  const refs = await git(api, p.repoPath, [
    "for-each-ref",
    "--format=%(refname)",
    "--sort=-committerdate",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  return branchList(refs, p.defaultBranch);
}

/** Queues a run with the branch and parameters picked in the Run form, and keeps an eye on it. */
export async function queue(
  { key, branch, values }: { key: string; branch: string; values: Record<string, string> },
  api: AddonHostApi,
) {
  const p = (await api.storage.get<Found>("found"))?.pipelines.find((x) => x.key === key);
  if (!p) throw new Error("That pipeline isn't known any more: find pipelines again.");
  const params = runParameters(p.params, values);
  const started = toRun(
    await az<unknown>(api, [
      "pipelines",
      "run",
      "--id",
      String(p.id),
      "--org",
      orgUrl(p.org),
      "--project",
      p.project,
      "--branch",
      branch || p.defaultBranch,
      ...(params.length ? ["--parameters", ...params] : []),
    ]),
  );
  await track(api, { org: orgUrl(p.org), project: p.project, runId: started.id, name: p.name });
  return { number: started.buildNumber, url: runUrl(orgUrl(p.org), p.project, started.id) };
}

/** Runs a pipeline from "More pipelines" (no checkout here): on a branch, with the YAML's defaults. */
export async function runOther(
  {
    org,
    project,
    id,
    branch,
    name,
  }: { org: string; project: string; id: number; branch?: string; name: string },
  api: AddonHostApi,
) {
  const started = toRun(
    await az<unknown>(api, [
      "pipelines",
      "run",
      "--id",
      String(id),
      "--org",
      orgUrl(org),
      "--project",
      project,
      ...(branch ? ["--branch", branch] : []),
    ]),
  );
  await track(api, { org: orgUrl(org), project, runId: started.id, name });
  return { number: started.buildNumber, url: runUrl(orgUrl(org), project, started.id) };
}

async function track(api: AddonHostApi, run: Tracked) {
  const tracked = (await api.storage.get<Tracked[]>("tracked")) ?? [];
  await api.storage.set("tracked", [...tracked, run]);
  api.emit("runs-changed");
}

/** Tools → Run a pipeline…: the view opens that pipeline's Run form. */
export async function openRunForm({ key }: { key: string }, api: AddonHostApi) {
  api.emit("open-run", key);
}
