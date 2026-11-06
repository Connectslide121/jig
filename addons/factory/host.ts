/**
 * Jig factory's host code. Session 0: the runs a project keeps (storage `runs` + `run:<id>`, D-116)
 * and the sample runs that show the Floor, a run's page and the inbox before runs can be started
 * (D-440). The Conductor, stage runner and tools come in later sessions
 * (docs/plan/28-factory/architecture.md).
 */
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import type { Run } from "./lib/run";
import { isSample, sampleMarkdown, sampleRuns } from "./lib/samples";

const INDEX = "runs";
const runKey = (id: string) => `run:${id}`;
const scope = (projectId: string) => ({ scope: "project" as const, id: projectId });

async function ids(api: AddonHostApi, projectId: string): Promise<string[]> {
  const v = await api.storage.get<string[]>(INDEX, scope(projectId));
  return Array.isArray(v) ? v : [];
}

async function load(api: AddonHostApi, projectId: string): Promise<Run[]> {
  const list = await ids(api, projectId);
  const runs = await Promise.all(list.map((id) => api.storage.get<Run>(runKey(id), scope(projectId))));
  return runs.filter((r): r is Run => !!r && typeof r === "object");
}

function changed(api: AddonHostApi, projectId: string): void {
  api.emit("storage", { key: INDEX });
  api.emit("changed", { projectId });
}

/** The runs of a project, newest first. */
export async function runs(args: { projectId: string }, api: AddonHostApi): Promise<Run[]> {
  if (!args?.projectId) return [];
  return (await load(api, args.projectId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One run. */
export async function run(
  args: { projectId: string; runId: string },
  api: AddonHostApi,
): Promise<Run | null> {
  if (!args?.projectId || !args.runId) return null;
  return (await api.storage.get<Run>(runKey(args.runId), scope(args.projectId))) ?? null;
}

/** Every project's runs, for the inbox and the top bar's count (what waits for you, all projects). */
export async function allRuns(_args: unknown, api: AddonHostApi): Promise<Run[]> {
  const projects = await api.projects();
  const lists = await Promise.all(projects.map((p) => load(api, p.id)));
  return lists.flat();
}

const sampleFolder = (api: AddonHostApi, projectId: string, slug: string) =>
  join(api.addon.dataDir, "samples", projectId, slug);

/** Where a run's output file is: the sample folder for sample runs, else the product repository (D-427). */
function outputPath(api: AddonHostApi, r: Run, path: string): string | undefined {
  if (isSample(r.id)) return join(sampleFolder(api, r.projectId, r.slug), path);
  return r.repo ? join(r.repo, "docs", "factory", r.slug, path) : undefined;
}

/** The absolute path of an output's file, to open in Preview or show as a thumbnail. */
export async function outputFile(
  args: { projectId: string; runId: string; outputId: string },
  api: AddonHostApi,
): Promise<string | null> {
  const r = await run(args, api);
  const o = r?.outputs.find((x) => x.id === args.outputId);
  return (r && o && outputPath(api, r, o.path)) || null;
}

/** Every output's file of a run (output id → absolute path), for the run page's thumbnails. */
export async function outputFiles(
  args: { projectId: string; runId: string },
  api: AddonHostApi,
): Promise<Record<string, string>> {
  const r = await run(args, api);
  const files: Record<string, string> = {};
  for (const o of r?.outputs ?? []) {
    const p = r && outputPath(api, r, o.path);
    if (p) files[o.id] = p;
  }
  return files;
}

/** Adds the sample runs to a project (again: replacing any earlier copy) and writes their files. */
export async function loadSamples(args: { projectId: string }, api: AddonHostApi): Promise<number> {
  const { projectId } = args;
  if (!projectId) throw new Error("No project");
  const samples = sampleRuns(projectId);
  const demo = join(api.addon.dir, "fixtures", "demo", "index.html");
  for (const r of samples) {
    await rm(sampleFolder(api, projectId, r.slug), { recursive: true, force: true });
    for (const o of r.outputs) {
      const file = join(sampleFolder(api, projectId, r.slug), o.path);
      await mkdir(dirname(file), { recursive: true });
      if (o.path.endsWith(".html")) await copyFile(demo, file);
      else await writeFile(file, sampleMarkdown(r, o), "utf8");
    }
    await api.storage.set(runKey(r.id), r, scope(projectId));
  }
  const keep = (await ids(api, projectId)).filter((id) => !isSample(id));
  await api.storage.set(INDEX, [...keep, ...samples.map((r) => r.id)], scope(projectId));
  changed(api, projectId);
  return samples.length;
}

/** Removes a project's sample runs and their files; real runs stay. */
export async function clearSamples(args: { projectId: string }, api: AddonHostApi): Promise<number> {
  const { projectId } = args;
  if (!projectId) throw new Error("No project");
  const list = await ids(api, projectId);
  const gone = list.filter(isSample);
  for (const id of gone) await api.storage.set(runKey(id), undefined, scope(projectId));
  await api.storage.set(
    INDEX,
    list.filter((id) => !isSample(id)),
    scope(projectId),
  );
  await rm(join(api.addon.dataDir, "samples", projectId), { recursive: true, force: true });
  changed(api, projectId);
  return gone.length;
}
