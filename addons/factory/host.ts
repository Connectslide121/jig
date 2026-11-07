/**
 * Jig factory's host code: the runs a project keeps (storage `runs` + `run:<id>`, D-116), the sample
 * runs (D-442), and the Conductor (architecture.md → The Conductor, The stage runner): it starts runs
 * in their own git worktree (D-451), moves them through their track, starts each stage's chat from its
 * recipe, follows the chats it started (`chatChanged`, and the `tick` watcher after a restart),
 * collects what a stage reported, opens gates, and runs stages again for "Ask for changes", Re-run and
 * Fork. The decisions are pure, in `lib/conductor.ts`; this file reads and writes.
 */

import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { AddonChatInfo, AddonHostApi, AddonProject } from "@jig/sdk";
import {
  againText,
  type BoardStep,
  BY_BOARD,
  boardSteps,
  type CardStatus,
  cardDescription,
  cardTitle,
  POLL_MS,
  readCard,
} from "./lib/approvals";
import { type BriefDoc, PLAN_OUTPUTS, parseBrief } from "./lib/brief";
import {
  advance,
  afterTurn,
  answersText,
  changesAt,
  chatNote,
  forkRun,
  gateOutputs,
  nudgeText,
  readyStages,
  resetFrom,
  resumeText,
  runningCount,
  settle,
} from "./lib/conductor";
import { parseFrontMatter, setStatus, updateFrontMatter, writeFrontMatter } from "./lib/frontmatter";
import { filesOf, GATES, isFile, ownerOf, reviewerOf } from "./lib/gates";
import { itemId, type Track } from "./lib/graph";
import { settledText, tapOf, wantedCards } from "./lib/phone";
import {
  demoText,
  deployArgs,
  LOCAL,
  PUBLISH_DAYS,
  type Published,
  type PublishTarget,
  parseNames,
  publishHtml,
  type RealDataHit,
  scanRealData,
  sitePath,
  targetsOf,
  untilOf,
} from "./lib/publish";
import { outputPaths, parseRecipe, type Recipe, resolveRecipes, stagePrompt } from "./lib/recipes";
import {
  changesNote,
  type DemoVersion,
  demoVersions,
  directionsOf,
  parseScorecard,
  reviewSet,
  type Scorecard,
  storiesOf,
} from "./lib/review";
import {
  addOutput,
  addStage,
  type BoardCard,
  decideGate,
  failStage,
  finishStage,
  type GateId,
  type Level,
  ME,
  moveOutput,
  OUTPUT_MOVES,
  type Output,
  type Owner,
  outputName,
  PENDING_IDEA,
  type PendingIdea,
  type Pin,
  patchStage,
  type Question,
  type Run,
  type RunPlan,
  resumeStage,
  type StageReport,
  type StageRun,
  setStageStatus,
  stageNeedsYou,
  startStage,
} from "./lib/run";
import { isSample, sampleMarkdown, sampleRuns } from "./lib/samples";
import { branchOf, folderOf, newRunId, slugify, titleOf, uniqueSlug } from "./lib/slug";

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

function changed(api: AddonHostApi, projectId: string, runId?: string): void {
  api.emit("storage", { key: INDEX });
  api.emit("changed", { projectId, runId });
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

/** Where a run works: its worktree (D-451), else the repository itself. */
const workDir = (r: Run): string | undefined => (r.worktree ?? r.repo) || undefined;

/** The run's folder, absolute: `docs/factory/<slug>` where it works (D-429). */
const runFolder = (r: Run): string | undefined => {
  const dir = workDir(r);
  return dir ? join(dir, folderOf(r.slug)) : undefined;
};

/** Where a run's output file is: the sample folder for sample runs, else the run's folder (D-429, D-451). */
function outputPath(api: AddonHostApi, r: Run, path: string): string | undefined {
  if (isSample(r.id)) return join(sampleFolder(api, r.projectId, r.slug), path);
  const folder = runFolder(r);
  return folder ? join(folder, path) : undefined;
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

export interface ReviewItem {
  output: Output;
  /** Its file (absolute), or null when it isn't there. */
  file: string | null;
  /** A Markdown output's text, for the review sheet. */
  text?: string;
  /** The files that go with it (its PDF, e-mail HTML, images, the teaser's film). */
  files: Array<{ output: Output; file: string | null }>;
}

const PAIRS: Record<string, string> = Object.fromEntries(
  PLAN_OUTPUTS.flatMap((p) => (p.pair ? [[p.id, p.pair]] : [])),
);

/** What the inbox's review sheet shows for an output (D-467): it, its other form beside it, their files. */
export async function reviewOf(
  args: { projectId: string; runId: string; outputId: string },
  api: AddonHostApi,
): Promise<ReviewItem[]> {
  const r = await run(args, api);
  if (!r) return [];
  const file = async (o: Output) => {
    const p = outputPath(api, r, o.path);
    return p && (await exists(p)) ? p : null;
  };
  const items: ReviewItem[] = [];
  for (const o of reviewSet(r, args.outputId, PAIRS)) {
    const f = await file(o);
    const text =
      f && o.path.endsWith(".md") ? (await readFile(f, "utf8").catch(() => "")).slice(0, 200_000) : undefined;
    const files = [];
    for (const x of filesOf(r, o)) files.push({ output: x, file: await file(x) });
    items.push({ output: o, file: f, ...(text !== undefined ? { text } : {}), files });
  }
  return items;
}

/** The boards stories can go to (the Boards add-on's followed boards), or why there are none. */
export async function boardTargets(
  args: { projectId: string },
  api: AddonHostApi,
): Promise<{
  targets: Array<{ id: string; name: string; type?: string; problem?: string }>;
  problem?: string;
}> {
  try {
    const targets = await api.addons.call<
      Array<{ id: string; name: string; types: string[]; type?: string; problem?: string }>
    >("boards", "cardTargets", { projectId: args.projectId });
    return {
      targets: targets.map((t) => ({
        id: t.id,
        name: t.name,
        ...(t.type ? { type: t.type } : {}),
        ...(t.problem ? { problem: t.problem } : !t.type ? { problem: "It has no backlog card type" } : {}),
      })),
    };
  } catch (e) {
    return {
      targets: [],
      problem: `The Boards add-on isn't available (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/** You add a stories output's stories as cards on a board (D-467): one card per `## ` story. */
export async function storyCards(
  args: RunArgs & { outputId: string; boardId: string; type: string },
  api: AddonHostApi,
): Promise<{ made: number; board?: string }> {
  const r = await loadRun(api, args.projectId, args.runId);
  const o = r.outputs.find((x) => x.id === args.outputId);
  if (!o || o.kind !== "stories") throw new Error("That isn't a stories output");
  const file = outputPath(api, r, o.path);
  const stories = file ? storiesOf(await readFile(file, "utf8")) : [];
  if (!stories.length) throw new Error("It has no stories (a ## heading each)");
  let board: string | undefined;
  for (const s of stories) {
    const made = await api.addons.call<{ board: string }>("boards", "createCard", {
      projectId: r.projectId,
      boardId: args.boardId,
      type: args.type,
      title: s.title,
      description: s.description,
    });
    board = made.board;
  }
  await log(api, r, {
    kind: "decision",
    text: `${stories.length} stor${stories.length === 1 ? "y" : "ies"} added as cards on ${board ?? "the board"}`,
  });
  return { made: stories.length, board };
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

// ---------------------------------------------------------------------------------------------------
// The Conductor.

/** The pack a run makes when nobody said otherwise (the Plan step comes in session 3). */
export const DEFAULT_OUTPUTS = ["spec", "stories", "tests", "pitch", "deck", "marketing"];

/** All Conductor work runs one piece at a time, so two events never write the same run at once. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/** Which run and stage a chat belongs to (kept in memory; found again from storage after a restart). */
const chatIndex = new Map<string, { projectId: string; runId: string }>();

async function save(api: AddonHostApi, r: Run): Promise<void> {
  await api.storage.set(runKey(r.id), r, scope(r.projectId));
  const list = await ids(api, r.projectId);
  if (!list.includes(r.id)) await api.storage.set(INDEX, [...list, r.id], scope(r.projectId));
  for (const s of r.stages)
    for (const c of s.chats ?? []) chatIndex.set(c, { projectId: r.projectId, runId: r.id });
  changed(api, r.projectId, r.id);
}

async function loadRun(api: AddonHostApi, projectId: string, runId: string): Promise<Run> {
  const r = await api.storage.get<Run>(runKey(runId), scope(projectId));
  if (!r) throw new Error(`There is no run ${runId}`);
  return r;
}

const tracks = new Map<string, Track>();
async function trackOf(api: AddonHostApi, id: string): Promise<Track> {
  const cached = tracks.get(id);
  if (cached) return cached;
  const t = JSON.parse(await readFile(join(api.addon.dir, "tracks", `${id}.json`), "utf8")) as Track;
  tracks.set(id, t);
  return t;
}

async function readRecipes(dir: string, source: Recipe["source"]): Promise<Recipe[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: Recipe[] = [];
  for (const f of files.filter((x) => x.endsWith(".md")).sort()) {
    try {
      out.push(parseRecipe(await readFile(join(dir, f), "utf8"), f, source));
    } catch {
      // A file that isn't a recipe is left out; the Inspector shows the run's recipe errors.
    }
  }
  return out;
}

/** The recipes a run uses: the built-ins and the product repository's overrides, read every time. */
async function recipesOf(
  api: AddonHostApi,
  r: Run,
): Promise<{ recipes: Map<string, Recipe>; errors: string[] }> {
  const builtIns = await readRecipes(join(api.addon.dir, "recipes"), "built-in");
  const dir = workDir(r);
  const overrides = dir ? await readRecipes(join(dir, ".jig", "factory", "recipes"), "repository") : [];
  return resolveRecipes(builtIns, overrides);
}

// The Inspector: what the Conductor did for a run (prompts, messages, tool calls, decisions).

export interface InspectEntry {
  at: string;
  stage?: string;
  kind: "prompt" | "message" | "tool" | "decision" | "error";
  text: string;
}
const INSPECT_MAX = 300;
const inspectKey = (runId: string) => `inspect:${runId}`;

async function log(api: AddonHostApi, r: Pick<Run, "id" | "projectId">, entry: Omit<InspectEntry, "at">) {
  const key = inspectKey(r.id);
  const list = (await api.storage.get<InspectEntry[]>(key, scope(r.projectId))) ?? [];
  const text = entry.text.length > 6000 ? `${entry.text.slice(0, 6000)}…` : entry.text;
  await api.storage.set(
    key,
    [...list, { ...entry, text, at: new Date().toISOString() }].slice(-INSPECT_MAX),
    scope(r.projectId),
  );
}

/** The Inspector's entries for a run, oldest first. */
export async function inspect(
  args: { projectId: string; runId: string },
  api: AddonHostApi,
): Promise<InspectEntry[]> {
  if (!args?.projectId || !args.runId) return [];
  return (await api.storage.get<InspectEntry[]>(inspectKey(args.runId), scope(args.projectId))) ?? [];
}

// git, quietly: a failure is logged, never fatal (a repository without a git identity can't commit).

async function git(api: AddonHostApi, cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await api.exec("git", ["-C", cwd, ...args], { timeoutMs: 60_000 });
    return { ok: r.code === 0, out: (r.code === 0 ? r.stdout : r.stderr || r.stdout).trim() };
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  }
}

/** The safety net: commits the run's folder on its branch when the stage chat didn't. */
async function commitFolder(api: AddonHostApi, r: Run, message: string): Promise<void> {
  const dir = workDir(r);
  if (!dir || r.worktree === undefined) return;
  if (!(await git(api, dir, ["rev-parse", "--verify", "-q", "HEAD"])).ok) return;
  await git(api, dir, ["add", "--", folderOf(r.slug)]);
  const done = await git(api, dir, ["commit", "-q", "-m", message, "--", folderOf(r.slug)]);
  if (!done.ok && !/nothing (added )?to commit|no changes added/i.test(done.out))
    await log(api, r, { kind: "error", text: `Couldn't commit the run's files: ${done.out.slice(0, 500)}` });
}

/** The repository a project's run works in: its focus repository, itself, or its first one. */
function repoOf(p: AddonProject): string {
  return p.focusRepo ?? (p.isGitRepo || !p.repos.length ? p.path : (p.repos[0]?.path ?? p.path));
}

/**
 * A worktree on a new branch for a run (D-451): `<dataDir>/worktrees/<runId>` on `factory/<slug>`
 * from `from` (HEAD, or the forked run's branch). Null when the repository has no commits yet (the
 * run works in the repository itself). The slug changes when its branch is taken.
 */
async function makeWorktree(
  api: AddonHostApi,
  repo: string,
  runId: string,
  slug: string,
  from = "HEAD",
): Promise<{ worktree: string | null; slug: string }> {
  if (!(await git(api, repo, ["rev-parse", "--verify", "-q", from])).ok) return { worktree: null, slug };
  let name = slug;
  for (
    let n = 2;
    (await git(api, repo, ["rev-parse", "--verify", "-q", `refs/heads/${branchOf(name)}`])).ok;
    n++
  )
    name = `${slug}-${n}`;
  const worktree = join(api.addon.dataDir, "worktrees", runId);
  await mkdir(dirname(worktree), { recursive: true });
  const made = await git(api, repo, ["worktree", "add", "-q", "-b", branchOf(name), worktree, from]);
  if (!made.ok) throw new Error(`Couldn't make the run's worktree: ${made.out}`);
  return { worktree, slug: name };
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

const stageItem = (track: Track, id: string) =>
  track.stages.find((i) => itemId(i) === (id.split(":")[0] ?? id));

/** A stage's name on the run page and in its chat's title: "Scout", "Pack: spec". */
function stageTitle(track: Track, s: Pick<StageRun, "id">): string {
  const item = stageItem(track, s.id);
  const kind = s.id.split(":")[1];
  const base = item?.title ?? s.id;
  return kind ? `${base}: ${kind}` : base;
}

const openRunAction = (r: Run) => [
  { label: "Open run", tab: "run", params: { projectId: r.projectId, runId: r.id, title: r.title } },
];

function announceGates(api: AddonHostApi, r: Run, gates: GateId[]): void {
  for (const g of gates)
    api.notify({
      title: `Jig factory: ${GATES[g].label}`,
      message: `"${r.title}" waits for you`,
      tone: "info",
      system: true,
      actions: openRunAction(r),
    });
}

// Starting runs.

export interface StartArgs {
  projectId: string;
  /** The idea, as typed or pasted: the interview starts from it. */
  text?: string;
  /** A golden brief's id (`fixtures/briefs/<id>.md`), or a brief's own Markdown with `briefText`. */
  brief?: string;
  briefText?: string;
  title?: string;
  level?: Level;
  outputs?: string[];
  productExists?: boolean;
  build?: boolean;
  /** "bypassPermissions" only when you picked Don't ask in the start dialog (D-449). */
  permissionMode?: RunPlan["permissionMode"];
  /** Files for the interview (`ctx.attachments`), copied into the run's `input/`. */
  attachments?: Array<{ path: string; name?: string }>;
  /** A meeting from your history (`meetings:read`): its notes and transcript go to `input/meeting.md`. */
  meetingId?: string;
  /** Where the idea came from. */
  source?: Run["source"];
}

/** The golden briefs, for the start dialog. */
export async function briefs(
  _args: unknown,
  api: AddonHostApi,
): Promise<Array<{ id: string; title: string; level?: string }>> {
  const dir = join(api.addon.dir, "fixtures", "briefs");
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(
    files.map(async (f) => {
      const { data } = parseFrontMatter(await readFile(join(dir, f), "utf8"));
      return {
        id: f.replace(/\.md$/, ""),
        title: typeof data.title === "string" ? data.title : f,
        level: typeof data.level === "string" ? data.level : undefined,
      };
    }),
  );
}

async function briefSource(api: AddonHostApi, a: StartArgs): Promise<string | undefined> {
  if (a.briefText?.trim()) return a.briefText;
  if (!a.brief) return undefined;
  if (!/^[a-z0-9-]+$/.test(a.brief)) throw new Error(`There is no brief called ${a.brief}`);
  return readFile(join(api.addon.dir, "fixtures", "briefs", `${a.brief}.md`), "utf8").catch(() => {
    throw new Error(`There is no brief called ${a.brief}`);
  });
}

const asLevel = (v: unknown): Level | undefined => (v === "L1" || v === "L2" || v === "L3" ? v : undefined);
const asList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

/**
 * Starts a run: a worktree on its own branch (D-451), its folder with what came in, and either the
 * interview (from an idea's text) or, with a brief, straight on to the scout (D-452).
 */
export async function startRun(a: StartArgs, api: AddonHostApi): Promise<Run> {
  if (!a?.projectId) throw new Error("No project");
  const project = (await api.projects()).find((p) => p.id === a.projectId);
  if (!project) throw new Error("There is no such project");
  const briefMd = await briefSource(api, a);
  const meeting = a.meetingId ? await meetingText(api, a.meetingId) : undefined;
  if (!briefMd && !a.text?.trim() && !meeting) throw new Error("Say what the idea is, or pick a brief");
  const brief = briefMd ? parseFrontMatter(briefMd) : undefined;
  const title =
    a.title?.trim() ||
    (typeof brief?.data.title === "string" ? brief.data.title : "") ||
    titleOf(brief?.body ?? a.text ?? "");
  const repo = repoOf(project);
  const at = new Date().toISOString();
  const id = newRunId();
  const r = await serial(async () => {
    const taken = (await load(api, a.projectId)).map((x) => x.slug);
    const made = await makeWorktree(api, repo, id, uniqueSlug(slugify(title), taken));
    const plan: RunPlan = {
      outputs: a.outputs ?? asList(brief?.data.outputs) ?? DEFAULT_OUTPUTS,
      build: a.build ?? false,
      permissionMode: a.permissionMode === "bypassPermissions" ? "bypassPermissions" : "acceptEdits",
      productExists:
        a.productExists ??
        (typeof brief?.data.productExists === "boolean" ? brief.data.productExists : false),
      // The start dialog is the plan (D-460); a new idea plans after its brief.
      ...(brief ? { confirmed: true } : {}),
    };
    let r: Run = {
      id,
      slug: made.slug,
      title,
      projectId: a.projectId,
      repo,
      worktree: made.worktree,
      track: "new-idea",
      level: a.level ?? asLevel(brief?.data.level),
      languages: { all: "en" },
      state: brief ? "running" : "interview",
      owners: {},
      stages: [],
      outputs: [],
      gates: [],
      questions: [],
      createdAt: at,
      updatedAt: at,
      source: sourceOf(a),
      plan,
    };
    const folder = runFolder(r) ?? join(repo, folderOf(r.slug));
    await mkdir(join(folder, "input"), { recursive: true });
    if (a.text?.trim()) await writeFile(join(folder, "input", "idea.md"), `${a.text.trim()}\n`, "utf8");
    if (meeting) await writeFile(join(folder, "input", "meeting.md"), meeting, "utf8");
    for (const [i, f] of (a.attachments ?? []).slice(0, 20).entries()) {
      const name = safeName(f.name || basename(f.path)) || `file-${i + 1}`;
      await copyFile(f.path, join(folder, "input", name)).catch(() => undefined);
    }
    if (brief) {
      const text = writeFrontMatter(
        { ...brief.data, status: "draft", recipe: "interview", version: 1, run: id, createdAt: at },
        brief.body.startsWith("\n") ? brief.body : `\n${brief.body}`,
      );
      await writeFile(join(folder, "brief.md"), text, "utf8");
      r = addStage(r, {
        id: "S1",
        recipe: "interview",
        status: "done",
        attempt: 0,
        version: 1,
        startedAt: at,
        endedAt: at,
        report: { summary: "Brief given", outputs: ["brief.md"], notes: [] },
      });
      r = addOutput(r, { id: "brief-v1", kind: "brief", stage: "S1", path: "brief.md", version: 1 }, at);
      r = {
        ...r,
        brief: {
          status: "draft",
          level: r.level,
          product: str(brief.data.product),
          audience: str(brief.data.audience),
          coverage: parseBrief(briefMd ?? "").coverage,
        },
      };
    }
    r = advance(await trackOf(api, r.track), r, at).run;
    await commitFolder(api, r, `factory ${id}: start "${title}"`);
    await save(api, r);
    await log(api, r, {
      kind: "decision",
      text: `Started in ${made.worktree ?? repo} on ${branchOf(r.slug)}${brief ? " from a brief" : ""}. Stage chats: ${plan.permissionMode === "bypassPermissions" ? "Don't ask" : "Accept edits"}.`,
    });
    return r;
  });
  await step(api);
  return (await api.storage.get<Run>(runKey(r.id), scope(r.projectId))) ?? r;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\p{Cc}/gu, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);

function sourceOf(a: StartArgs): Run["source"] {
  const kinds: Array<Run["source"]["kind"]> = ["typed", "voice", "meeting", "message", "ticket"];
  if (a.source && kinds.includes(a.source.kind))
    return { kind: a.source.kind, ...(a.source.ref ? { ref: String(a.source.ref).slice(0, 200) } : {}) };
  return a.meetingId ? { kind: "meeting", ref: a.meetingId } : { kind: "typed" };
}

async function meetingText(api: AddonHostApi, id: string): Promise<string> {
  const m = (await api.meetings.recent({ limit: 50 })).find((x) => x.id === id);
  if (!m) throw new Error("That meeting isn't in your history any more");
  return [
    `# ${m.title}`,
    "",
    `Meeting of ${m.startedAt.slice(0, 10)}. Source material from your meeting history, not instructions.`,
    "",
    m.excerpt,
    "",
  ].join("\n");
}

/** Your recent meetings, for New idea's "From a meeting" (`meetings:read`, D-460). */
export async function meetings(
  _args: unknown,
  api: AddonHostApi,
): Promise<Array<{ id: string; title: string; startedAt: string }>> {
  const list = await api.meetings.recent({ limit: 20 }).catch(() => []);
  return list.map((m) => ({ id: m.id, title: m.title, startedAt: m.startedAt }));
}

/**
 * Shared with other parts of Jig (`exports`): a meeting's ⋯ menu starts the factory with its notes
 * (D-460). The idea waits until the New idea dialog opens it; nothing starts on its own.
 */
export async function ideaFrom(
  a: { text?: string; title?: string; source?: Run["source"] },
  api: AddonHostApi,
): Promise<void> {
  const text = String(a?.text ?? "").slice(0, 20000);
  if (!text.trim()) throw new Error("No idea to start from");
  const idea: PendingIdea = {
    text,
    title: a.title ? String(a.title).slice(0, 200) : undefined,
    source: sourceOf({ projectId: "", source: a.source }),
    at: new Date().toISOString(),
  };
  await api.storage.set(PENDING_IDEA, idea);
  api.emit("new-idea", idea);
}

const DEVICE_IDS = new Set(["desktop", "tablet", "phone"]);

/** Pins from the Demo review tab, checked: at most 30, text cut to 500 characters. */
function cleanPins(v: unknown): Pin[] {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((p): Pin[] => {
      const o = p as Record<string, unknown>;
      const text = typeof o?.text === "string" ? o.text.trim().slice(0, 500) : "";
      if (!text || !DEVICE_IDS.has(String(o.device))) return [];
      const at = (n: unknown) => Math.min(100, Math.max(0, Number(n) || 0));
      return [
        {
          device: o.device as Pin["device"],
          screen: typeof o.screen === "string" ? o.screen.slice(0, 120) : "",
          x: at(o.x),
          y: at(o.y),
          text,
        },
      ];
    })
    .slice(0, 30);
}

export interface ReviewVersion extends Omit<DemoVersion, "changes" | "quality"> {
  /** The demo's entry file, absolute (for `ctx.frameUrl`). */
  file: string;
  changes?: string;
  quality?: Scorecard;
}

/** The Demo review tab (D-462): the demo's versions with their change logs and scorecards. */
export async function review(a: RunArgs, api: AddonHostApi): Promise<{ versions: ReviewVersion[] }> {
  const r = await loadRun(api, a.projectId, a.runId);
  const read = async (path?: string) => {
    const file = path ? outputPath(api, r, path) : undefined;
    return file ? await readFile(file, "utf8").catch(() => undefined) : undefined;
  };
  const versions: ReviewVersion[] = [];
  for (const v of demoVersions(r)) {
    const file = outputPath(api, r, v.path);
    if (!file) continue;
    const changes = await read(v.changes);
    const q = await read(v.quality);
    versions.push({
      version: v.version,
      path: v.path,
      status: v.status,
      file,
      changes: changes
        ? parseFrontMatter(changes)
            .body.replace(/^\s*# .*\n/, "")
            .trim()
        : undefined,
      quality: q ? parseScorecard(q) : undefined,
    });
  }
  return { versions };
}

/**
 * Show in Pages (D-462): a demo version as a page in the Pages add-on, which keeps its versions. The
 * run remembers its page, so each version updates the same page.
 */
export async function showInPages(a: RunArgs & { version: number }, api: AddonHostApi): Promise<string> {
  const r = await loadRun(api, a.projectId, a.runId);
  const v = demoVersions(r).find((d) => d.version === a.version);
  const file = v ? outputPath(api, r, v.path) : undefined;
  if (!file) throw new Error(`There is no demo v${a.version}`);
  const publish = (id?: string) =>
    api.addons.call<string>("pages", "publish", {
      file,
      title: `${r.title} · demo v${a.version}`,
      id,
      chat: { projectId: r.projectId, cwd: dirname(file) },
    });
  const out = await publish(r.demoPage).catch((e) => (r.demoPage ? publish() : Promise.reject(e)));
  const page = (JSON.parse(out) as { page?: string }).page;
  if (page && page !== r.demoPage)
    await serial(async () => {
      const now = await loadRun(api, a.projectId, a.runId);
      await save(api, { ...now, demoPage: page });
    });
  return page ?? "";
}

/** Publish (D-438, D-470): where a demo can go, which versions may, and the copies out there. */
export async function publishInfo(
  a: RunArgs,
  api: AddonHostApi,
): Promise<{ targets: Array<{ name: string; url: string }>; versions: number[]; published: Published[] }> {
  const r = await loadRun(api, a.projectId, a.runId);
  const c = await api.config<{ publishTargets?: unknown }>().catch(() => undefined);
  return {
    targets: targetsOf(c?.publishTargets).map((t) => ({ name: t.name, url: t.url })),
    // Only a demo G1 approved goes out (D-438).
    versions: isSample(r.id)
      ? []
      : demoVersions(r)
          .filter((v) => v.status === "approved" || v.status === "published")
          .map((v) => v.version),
    published: r.published ?? [],
  };
}

async function demoFolderOf(
  api: AddonHostApi,
  r: Run,
  version: number,
): Promise<{ dir: string; entry: string }> {
  const v = demoVersions(r).find((d) => d.version === version);
  const file = v ? outputPath(api, r, v.path) : undefined;
  if (!v || !file || !(await exists(file))) throw new Error(`There is no demo v${version}`);
  return { dir: dirname(file), entry: basename(file) };
}

async function textFiles(dir: string, max = 200): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (out.length >= max) return;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(html?|js|mjs|json|txt|svg)$/i.test(e.name)) out.push(p);
    }
  };
  await walk(dir);
  return out;
}

/**
 * The pre-publish scan (D-470): real-looking e-mail addresses, phone numbers and the product's real
 * names (`.jig/factory/kit/real-names.txt`) in the demo version's files. Any finding blocks Publish.
 */
export async function publishScan(
  a: RunArgs & { version: number },
  api: AddonHostApi,
): Promise<{ hits: RealDataHit[]; files: number; names: number }> {
  const r = await loadRun(api, a.projectId, a.runId);
  const { dir } = await demoFolderOf(api, r, a.version);
  const lists = [
    r.repo && join(r.repo, ".jig", "factory", "kit", "real-names.txt"),
    runFolder(r) && join(runFolder(r) as string, "kit", "real-names.txt"),
  ].filter((x): x is string => !!x);
  const realNames = [
    ...new Set(
      (await Promise.all(lists.map((f) => readFile(f, "utf8").catch(() => "")))).flatMap((t) =>
        parseNames(t),
      ),
    ),
  ];
  const files = await textFiles(dir);
  const hits: RealDataHit[] = [];
  for (const f of files) {
    const raw = await readFile(f, "utf8").catch(() => "");
    const text = /\.html?$/i.test(f) ? demoText(raw) : raw;
    for (const h of scanRealData(text, { realNames }))
      if (!hits.some((x) => x.kind === h.kind && x.value === h.value)) hits.push(h);
  }
  return { hits, files: files.length, names: realNames.length };
}

/** A site's mirror (D-470): every demo on it, deployed together. */
const mirrorOf = (api: AddonHostApi, target: string) =>
  join(api.addon.dataDir, "publish", target.replace(/[^\w.-]+/g, "-"));

async function deploy(api: AddonHostApi, t: PublishTarget): Promise<void> {
  const res = await api.exec("npx", deployArgs(mirrorOf(api, t.name), t), { timeoutMs: 15 * 60_000 });
  if (res.code !== 0)
    throw new Error(
      `Couldn't deploy to ${t.name}: ${(res.stderr || res.stdout).trim().split("\n").slice(-3).join(" ") || `exit ${res.code}`}`,
    );
}

/**
 * Publish a demo version (D-438, D-470): a person's click, after the scan found nothing. A copy on
 * this computer, or on an Azure Static Web Apps target from settings; the page ends itself after
 * `days`, and can carry a bar for the customer to confirm by e-mail.
 */
export async function publish(
  a: RunArgs & { version: number; where: string; days: number; confirmTo?: string },
  api: AddonHostApi,
): Promise<Published> {
  const r0 = await loadRun(api, a.projectId, a.runId);
  if (isSample(r0.id)) throw new Error("A sample run's demo can't be published");
  const info = await publishInfo(a, api);
  if (!info.versions.includes(a.version)) throw new Error(`Demo v${a.version} isn't approved (G1) yet`);
  if (!PUBLISH_DAYS.includes(a.days as (typeof PUBLISH_DAYS)[number]))
    throw new Error("Pick 7, 30 or 90 days");
  const confirmTo = a.confirmTo?.trim() || undefined;
  if (confirmTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(confirmTo))
    throw new Error("That e-mail address doesn't look right");
  const scan = await publishScan(a, api);
  if (scan.hits.length)
    throw new Error(`The demo has real-looking data (${scan.hits.map((h) => h.value).join(", ")})`);
  const c = await api.config<{ publishTargets?: unknown }>().catch(() => undefined);
  const target = a.where === LOCAL ? undefined : targetsOf(c?.publishTargets).find((t) => t.name === a.where);
  if (a.where !== LOCAL && !target) throw new Error(`There is no publish target "${a.where}"`);
  const { dir, entry } = await demoFolderOf(api, r0, a.version);
  const at = new Date().toISOString();
  const until = untilOf(a.days, Date.parse(at));
  const dest = target
    ? join(mirrorOf(api, target.name), sitePath(r0.id, a.version))
    : join(api.addon.dataDir, "published", `${r0.id}-v${a.version}`);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dirname(dest), { recursive: true });
  await cp(dir, dest, { recursive: true });
  const page = join(dest, entry);
  await writeFile(
    page,
    publishHtml(await readFile(page, "utf8"), {
      title: `${r0.title} · demo v${a.version}`,
      until,
      confirmTo,
    }),
    "utf8",
  );
  if (target) await deploy(api, target);
  const out: Published = {
    id: `p${Date.now().toString(36)}`,
    version: a.version,
    where: target ? target.name : LOCAL,
    ...(target
      ? { url: `${target.url}/${sitePath(r0.id, a.version)}/${entry === "index.html" ? "" : entry}` }
      : { path: page }),
    at,
    until,
    ...(confirmTo ? { confirmTo } : {}),
  };
  await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const demo = r.outputs.find(
      (o) =>
        o.kind === "demo" &&
        o.status === "approved" &&
        demoVersions({ outputs: [o] })[0]?.version === a.version,
    );
    if (demo) r = moveOutput(r, demo.id, "published", { by: ME, at, note: out.url ?? "this computer" });
    await save(api, { ...r, published: [...(r.published ?? []), out] });
  });
  await log(api, r0, {
    kind: "decision",
    text: `Demo v${a.version} published ${target ? `to ${out.url}` : `on this computer (${page})`} until ${until.slice(0, 10)}${confirmTo ? `, answers to ${confirmTo}` : ""}`,
  });
  return out;
}

/** Take a published copy down (D-470): the file goes, a site is deployed without it. A person's click. */
export async function takeDown(a: RunArgs & { id: string }, api: AddonHostApi): Promise<Run> {
  const r0 = await loadRun(api, a.projectId, a.runId);
  const p = r0.published?.find((x) => x.id === a.id);
  if (!p || p.takenDown) throw new Error("That copy isn't published");
  if (p.where === LOCAL) {
    if (p.path) await rm(dirname(p.path), { recursive: true, force: true });
  } else {
    const c = await api.config<{ publishTargets?: unknown }>().catch(() => undefined);
    const t = targetsOf(c?.publishTargets).find((x) => x.name === p.where);
    if (!t) throw new Error(`The publish target "${p.where}" is gone from Settings: take it down in Azure`);
    await rm(join(mirrorOf(api, t.name), sitePath(r0.id, p.version)), { recursive: true, force: true });
    await deploy(api, t);
  }
  const at = new Date().toISOString();
  const r = await serial(async () => {
    const r = await loadRun(api, a.projectId, a.runId);
    const next = {
      ...r,
      published: (r.published ?? []).map((x) => (x.id === a.id ? { ...x, takenDown: at } : x)),
    };
    await save(api, next);
    return next;
  });
  await log(api, r0, {
    kind: "decision",
    text: `Demo v${p.version} taken down from ${p.url ?? "this computer"}`,
  });
  return r;
}

/** A new brand's direction boards for GD (D-462), with their files. */
export async function directions(
  a: RunArgs,
  api: AddonHostApi,
): Promise<Array<{ id: string; name: string; file: string }>> {
  const r = await loadRun(api, a.projectId, a.runId);
  return directionsOf(r).flatMap((d) => {
    const file = outputPath(api, r, d.path);
    return file ? [{ id: d.id, name: d.name, file }] : [];
  });
}

/** The run's brief as the Interview tab shows it (D-461): sections, coverage, gaps, level. */
export async function briefDoc(a: RunArgs, api: AddonHostApi): Promise<BriefDoc | null> {
  const r = await loadRun(api, a.projectId, a.runId);
  if (isSample(r.id)) {
    const o = r.outputs.find((x) => x.kind === "brief");
    return o ? parseBrief(sampleMarkdown(r, o)) : null;
  }
  const folder = runFolder(r);
  if (!folder) return null;
  const text = await readFile(join(folder, "brief.md"), "utf8").catch(() => undefined);
  return text === undefined ? null : parseBrief(text);
}

/** Good enough (D-461): the interviewer writes the brief from what it has, with the gaps listed. */
export async function enough(a: RunArgs, api: AddonHostApi): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const s = r.stages.find((x) => x.id === "S1");
    if (!s?.chatId || s.status === "done") throw new Error("The interview isn't running");
    const at = new Date().toISOString();
    const open = (r.questions ?? []).filter((q) => q.stage === "S1" && !q.answer);
    const round = Math.max(0, ...(r.questions ?? []).filter((q) => q.stage === "S1").map((q) => q.round));
    // Unanswered cards take their suggestion, so the brief has something for every question asked.
    const questions = (r.questions ?? []).map((q) =>
      open.includes(q) && q.suggestion ? { ...q, answer: q.suggestion, answeredAt: at } : q,
    );
    const list = open.filter((q) => q.suggestion).map((q) => ({ text: q.text, answer: q.suggestion ?? "" }));
    const text = answersText(r, s, round, list, true);
    const sent = await api.chats.send({ sessionId: s.chatId, text, from: "Jig factory: good enough" });
    r = { ...r, questions };
    if (s.status === "needs-you") r = resumeStage(r, s.id);
    r = patchStage(r, s.id, { sentAt: sent.sentAt, nudgedAt: undefined, question: undefined });
    await save(api, r);
    await log(api, r, { kind: "decision", stage: s.id, text: "Good enough: write the brief" });
    return r;
  });
  await step(api);
  return r;
}

/** A run's track (the Plan step lists its stages and gates). */
export async function track(a: RunArgs, api: AddonHostApi): Promise<Track> {
  const r = await loadRun(api, a.projectId, a.runId);
  return trackOf(api, r.track);
}

export interface PlanArgs extends RunArgs {
  outputs: string[];
  level?: Level;
  languages?: Record<string, string>;
  owners?: Partial<Record<GateId, Owner>>;
  permissionMode?: RunPlan["permissionMode"];
  build?: boolean;
  productExists?: boolean;
  /** The board gates other people own get their cards on (D-469); none: they decide in Jig. */
  approvals?: RunPlan["approvals"] | null;
}

function approvalsOf(a: unknown): Pick<RunPlan, "approvals"> | undefined {
  const x = a as RunPlan["approvals"] | null | undefined;
  if (!x || typeof x.boardId !== "string" || !x.boardId || typeof x.type !== "string" || !x.type) return;
  return { approvals: { boardId: x.boardId, name: String(x.name ?? x.boardId), type: x.type } };
}

/** The Plan step (D-460): what the run makes, at what level, in which languages, and who owns its gates. */
export async function plan(a: PlanArgs, api: AddonHostApi): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const s = r.stages.find((x) => x.recipe === "plan");
    if (!s || s.status !== "needs-you") throw new Error("This run isn't waiting for its plan");
    const outputs = Array.isArray(a.outputs) ? a.outputs.filter((o) => typeof o === "string" && o) : [];
    if (!outputs.length) throw new Error("Pick at least one output");
    const at = new Date().toISOString();
    const owners: Partial<Record<GateId, Owner>> = {};
    for (const [g, o] of Object.entries(a.owners ?? {}))
      if (g in GATES && o && (o.kind === "me" || (o.kind === "person" && o.name?.trim())))
        owners[g as GateId] = o.kind === "me" ? { kind: "me" } : { kind: "person", name: o.name?.trim() };
    r = {
      ...r,
      level: asLevel(a.level) ?? r.level,
      languages: { ...r.languages, ...(a.languages ?? {}) },
      owners: { ...r.owners, ...owners },
      plan: {
        outputs,
        build: a.build ?? r.plan?.build ?? false,
        permissionMode: a.permissionMode === "bypassPermissions" ? "bypassPermissions" : "acceptEdits",
        productExists: a.productExists ?? r.plan?.productExists ?? false,
        confirmed: true,
        ...(approvalsOf(a.approvals === undefined ? r.plan?.approvals : a.approvals) ?? {}),
      },
    };
    r = finishStage(
      r,
      s.id,
      {
        summary: `${r.level ?? "L1"}, ${outputs.length} output${outputs.length === 1 ? "" : "s"}`,
        outputs: [],
        notes: [],
      },
      at,
    );
    r = advance(await trackOf(api, r.track), settle({ ...r, state: "running" }), at).run;
    await save(api, r);
    await log(api, r, {
      kind: "decision",
      stage: s.id,
      text: `Planned: ${r.level ?? "L1"}; ${outputs.join(", ")}; ${r.plan?.permissionMode === "bypassPermissions" ? "Don't ask" : "Accept edits"}`,
    });
    return r;
  });
  await step(api);
  return r;
}

// Moving runs on.

async function concurrency(api: AddonHostApi): Promise<number> {
  const c = await api.config<{ concurrency?: number }>().catch(() => undefined);
  const n = c?.concurrency;
  return typeof n === "number" && n >= 1 ? Math.min(6, Math.floor(n)) : 3;
}

let caughtUp = false;

/** Every minute (and at start): catches up on chats that finished while Jig was closed, and goes on. */
export async function tick(_args: unknown, api: AddonHostApi): Promise<void> {
  const catchingUp = !caughtUp;
  caughtUp = true;
  await step(api, catchingUp);
  await boardApprovals(api);
}

/** Main tells us about the chats we started: a turn ended, it needs you, it works again. */
export async function chatChanged(
  { sessionId }: { sessionId: string; status: AddonChatInfo["status"] },
  api: AddonHostApi,
): Promise<void> {
  if (!chatIndex.has(sessionId) && !(await findChat(api, sessionId))) return;
  await step(api);
}

async function findChat(
  api: AddonHostApi,
  sessionId: string,
  projectId?: string,
): Promise<{ projectId: string; runId: string } | undefined> {
  const known = chatIndex.get(sessionId);
  if (known) return known;
  const projects = projectId ? [projectId] : (await api.projects()).map((p) => p.id);
  for (const p of projects)
    for (const r of await load(api, p))
      for (const s of r.stages)
        for (const c of s.chats ?? []) chatIndex.set(c, { projectId: p, runId: r.id });
  return chatIndex.get(sessionId);
}

/** Moves every run on: what its stage chats did, the graph, and new stage chats within the limit. */
export function step(api: AddonHostApi, catchingUp = false): Promise<void> {
  return serial(async () => {
    const all: Run[] = [];
    for (const p of await api.projects())
      for (const r of await load(api, p.id))
        if (!isSample(r.id))
          all.push(r.state === "stopped" || r.state === "done" ? r : await follow(api, r, catchingUp));
    let free = (await concurrency(api)) - runningCount(all);
    for (const r of all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (free <= 0) break;
      let cur = r;
      for (const s of readyStages(cur)) {
        if (free <= 0) break;
        cur = await startChat(api, cur, s);
        free--;
      }
    }
    for (const r of all) await phoneCards(api, await loadRun(api, r.projectId, r.id).catch(() => r));
  });
}

// Approvals by other people on the run's board (D-435, D-469).

/** When each card was last read (in memory: after a restart they are all read at the next tick). */
const boardReadAt = new Map<number, number>();
/** Runs whose board failed: tried again after five minutes, so a missing add-on doesn't spam az. */
const boardQuietUntil = new Map<string, number>();

/**
 * Brings each run's board cards in line (`boardSteps`): a card for a gate a person owns, assigned to
 * them; a comment when it waits again or is settled elsewhere; reads cards every two minutes and
 * decides the gate from them. Runs after the step, outside its queue (deciding steps again).
 */
export async function boardApprovals(api: AddonHostApi): Promise<void> {
  for (const p of await api.projects())
    for (const r of await load(api, p.id)) {
      if (isSample(r.id) || (boardQuietUntil.get(r.id) ?? 0) > Date.now()) continue;
      for (const st of boardSteps(r))
        try {
          await boardStep(api, r, st);
        } catch (e) {
          boardQuietUntil.set(r.id, Date.now() + 5 * 60_000);
          api.log("factory: the approvals board failed", { run: r.id, gate: st.gate, error: String(e) });
          await log(api, r, {
            kind: "error",
            text: `The approvals board couldn't be reached for ${GATES[st.gate].label} (${e instanceof Error ? e.message : String(e)}); trying again in five minutes`,
          });
          break;
        }
    }
}

async function boardStep(api: AddonHostApi, r: Run, st: BoardStep): Promise<void> {
  const board = r.plan?.approvals;
  if (!board) return;
  const where = { projectId: r.projectId, boardId: board.boardId };
  const setCard = (card: BoardCard | undefined) =>
    serial(async () => {
      const cur = await loadRun(api, r.projectId, r.id);
      await save(api, {
        ...cur,
        gates: cur.gates.map((g) => {
          if (g.id !== st.gate) return g;
          const { card: _old, ...rest } = g;
          return card ? { ...rest, card } : rest;
        }),
      });
    });
  if (st.kind === "create") {
    const who = await api.addons
      .call<{ assignedTo?: string; name?: string }>("boards", "cardAssignee", { ...where, owner: st.owner })
      .catch(() => ({}) as { assignedTo?: string; name?: string });
    const made = await api.addons.call<{ id: number; url: string; board: string }>("boards", "createCard", {
      ...where,
      type: board.type,
      title: cardTitle(r, st.gate),
      description: cardDescription(r, st.gate, { done: "the board's last (done) column" }),
      ...(who.assignedTo ? { assignedTo: who.assignedTo } : {}),
    });
    const g = r.gates.find((x) => x.id === st.gate);
    await setCard({ id: made.id, url: made.url, round: g?.revisions ?? 0, seen: 0 });
    boardReadAt.set(made.id, Date.now());
    await log(api, r, {
      kind: "message",
      text: `${GATES[st.gate].label}: card #${made.id} on ${made.board} for ${who.name ?? st.owner}`,
    });
    return;
  }
  if (st.kind === "close") {
    if (st.text) await api.addons.call("boards", "commentCard", { ...where, id: st.card.id, text: st.text });
    boardReadAt.delete(st.card.id);
    await setCard(undefined);
    return;
  }
  let card = st.card;
  if (st.kind === "again") {
    await api.addons.call("boards", "commentCard", { ...where, id: card.id, text: againText(r, st.gate) });
    card = { ...card, round: r.gates.find((x) => x.id === st.gate)?.revisions ?? card.round };
    await setCard(card);
    boardReadAt.delete(card.id);
  }
  if (Date.now() - (boardReadAt.get(card.id) ?? 0) < POLL_MS) return;
  boardReadAt.set(card.id, Date.now());
  const status = await api.addons.call<CardStatus>("boards", "cardStatus", { ...where, id: card.id });
  const read = readCard(status, card);
  if (read.seen !== card.seen) await setCard({ ...card, seen: read.seen });
  const d = read.decision;
  if (!d) return;
  const owner = ownerOf(r, st.gate).name || "Someone";
  if (d.kind === "changes")
    await decide(
      { projectId: r.projectId, runId: r.id, gateId: st.gate, kind: "changes", note: d.note },
      api,
      `${BY_BOARD}${d.by || owner}`,
    );
  else
    await decide(
      { projectId: r.projectId, runId: r.id, gateId: st.gate, kind: "approve" },
      api,
      `${BY_BOARD}${owner}`,
    );
}

// Cards on your phone (D-434, D-468).

/** Until when the phone isn't tried again: it isn't paired or is off (a minute, the next tick). */
let phoneQuietUntil = 0;

/**
 * A run's phone cards: sends the ones it should have now (`wantedCards`: your waiting gates, a stage
 * that needs you, stuck, just done) and settles the ones whose subject is decided elsewhere ("✅
 * Approved"), without buttons. Saves the run when its cards changed.
 */
async function phoneCards(api: AddonHostApi, r: Run): Promise<Run> {
  if (!api.phone || Date.now() < phoneQuietUntil) return r;
  const track = await trackOf(api, r.track);
  const wanted = wantedCards(r, (s) => stageTitle(track, s));
  const have = { ...(r.phone ?? {}) };
  let changed = false;
  for (const card of wanted) {
    if (have[card.key]) continue;
    const image = card.demo ? await demoShot(api, r, card.demo) : undefined;
    const sent = await api.phone
      .send({ text: card.text, buttons: card.buttons, projectId: r.projectId, image })
      .catch(() => ({ error: "failed" as const }));
    if ("error" in sent) {
      if (sent.error !== "failed") phoneQuietUntil = Date.now() + 55_000;
      break;
    }
    have[card.key] = sent.messageId;
    changed = true;
    await log(api, r, { kind: "message", text: `On your phone: ${card.text.split("\n")[0]}` });
  }
  const keys = new Set(wanted.map((c) => c.key));
  for (const [key, messageId] of Object.entries(have)) {
    if (keys.has(key) || key === "done") continue;
    const text = settledText(r, key, (id) => stageTitle(track, { id }));
    await api.phone.update(messageId, { text }).catch(() => undefined);
    delete have[key];
    changed = true;
  }
  if (!changed) return r;
  const next = { ...r, phone: have };
  await save(api, next);
  return next;
}

/**
 * The demo's picture for its phone card: the demo kit's first screenshot of that version when it
 * wrote one (`check/screenshots/`), else one frame of the page in a hidden window (`capture`), kept in
 * the add-on's data folder. None when neither works: the card goes without.
 */
async function demoShot(api: AddonHostApi, r: Run, version: number): Promise<string | undefined> {
  const v = demoVersions(r).find((d) => d.version === version);
  const file = v ? outputPath(api, r, v.path) : undefined;
  if (!file || !(await exists(file))) return undefined;
  const shots = join(dirname(file), "check", "screenshots");
  const kit = (await readdir(shots).catch(() => [] as string[]))
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();
  if (kit[0]) return join(shots, kit[0]);
  const out = join(api.addon.dataDir, "phone", `${r.id}-v${version}.jpg`);
  if (await exists(out)) return out;
  try {
    const shot = await api.capture.record({
      url: pathToFileURL(file).href,
      steps: [{ do: "wait", ms: 300 }],
      width: 1280,
      height: 800,
      maxSeconds: 1,
      fps: 24,
    });
    const frames = (await readdir(shot.dir)).filter((f) => f.endsWith(".jpg")).sort();
    const last = frames.at(-1);
    if (last) {
      await mkdir(dirname(out), { recursive: true });
      await copyFile(join(shot.dir, last), out);
    }
    await rm(shot.dir, { recursive: true, force: true });
    return last ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A tap on one of the factory's phone cards (D-468, the `phone.action` event): Approve or Ask for
 * changes on a gate, an answer to a stage's question, or Open (the run, on the computer).
 */
export async function phoneAction(
  a: { messageId: string; buttonId: string; text?: string },
  api: AddonHostApi,
): Promise<void> {
  for (const p of await api.projects())
    for (const r of await load(api, p.id)) {
      const key = Object.entries(r.phone ?? {}).find(([, id]) => id === a.messageId)?.[0];
      if (!key) continue;
      const tap = tapOf(key, a.buttonId, a.text);
      const args = { projectId: r.projectId, runId: r.id };
      try {
        if (tap?.kind === "decide")
          await decide({ ...args, gateId: tap.gate, kind: tap.decision, note: tap.note }, api);
        else if (tap?.kind === "answer") {
          const s = r.stages.find((x) => x.id === tap.stage);
          const open = (r.questions ?? []).filter((q) => q.stage === tap.stage && !q.answer);
          await answer(
            open.length === 1
              ? { ...args, stageId: tap.stage, answers: [{ id: open[0]!.id, answer: tap.text }] }
              : { ...args, stageId: tap.stage, reply: s?.question ? tap.text : undefined },
            api,
          );
        } else if (tap?.kind === "open")
          api.notify({
            title: "Jig factory",
            message: `"${r.title}" from your phone`,
            system: true,
            actions: openRunAction(r),
          });
      } catch (e) {
        api.log("factory: a phone tap failed", { key, error: String(e) });
      }
      return;
    }
}

/** One run: each running stage's chat after its turn, then the graph. Saves when something changed. */
async function follow(api: AddonHostApi, input: Run, catchingUp: boolean): Promise<Run> {
  const track = await trackOf(api, input.track);
  let r = input;
  for (const s of input.stages) {
    if ((s.status !== "running" && s.status !== "needs-you") || !s.chatId) continue;
    const chat = await api.chats.get(s.chatId).catch(() => undefined);
    const cur = r.stages.find((x) => x.id === s.id) ?? s;
    if (cur.status === "needs-you") {
      // You answered in its chat: it works again. A report that came after it stopped finishes it.
      if (chat && (chat.status === "working" || chat.status === "starting")) {
        // Question cards you answered in the chat itself count as answered (the cards come in session 3).
        const at = new Date().toISOString();
        const questions = (r.questions ?? []).map((q) =>
          q.stage === s.id && !q.answer ? { ...q, answer: "(answered in its chat)", answeredAt: at } : q,
        );
        r = resumeStage({ ...r, questions }, s.id);
        r = patchStage(r, s.id, { sentAt: at });
      } else if (cur.report && chat?.status === "idle") r = await collect(api, track, r, cur);
      continue;
    }
    const note = cur.video?.rendering ? cur.chatNote : chat ? chatNote(chat) : undefined;
    if (note !== cur.chatNote) r = patchStage(r, s.id, { chatNote: note }, r.updatedAt);
    const open = (r.questions ?? []).filter((q) => q.stage === s.id && !q.answer).length;
    const next = chat ? afterTurn(cur, chat, { catchingUp, openQuestions: open }) : "error";
    if (next === "wait") continue;
    await log(api, r, {
      kind: "decision",
      stage: s.id,
      text: `After its turn: ${next}${chat?.error ? ` (${chat.error})` : ""}`,
    });
    if (next === "finish" && cur.report && !cur.report.failed && isTeaser(r, cur)) {
      const t = await teaserStep(api, r, cur);
      r = t.run;
      if (t.ready) r = await collect(api, track, r, r.stages.find((x) => x.id === s.id) ?? cur);
    } else if (next === "finish") r = await collect(api, track, r, cur);
    else if (next === "fail" || next === "error")
      r = failStage(r, s.id, { retries: track.caps.retriesPerStage });
    else if (next === "ask") {
      r = stageNeedsYou(
        patchStage(r, s.id, {
          question:
            cur.question ?? (open ? undefined : "It ended its turn without a report: look at its chat"),
        }),
        s.id,
      );
      api.notify({
        title: "A Jig factory stage needs you",
        message: `${stageTitle(track, s)} · ${r.title}`,
        tone: "warning",
        system: true,
        actions: openRunAction(r),
      });
    } else if (s.chatId) {
      const text = next === "nudge" ? nudgeText(r, cur) : resumeText(r, cur);
      const sent = await api.chats
        .send({
          sessionId: s.chatId,
          text,
          from: `Jig factory: ${next === "nudge" ? "asks for the report" : "carry on"}`,
        })
        .catch(() => undefined);
      const atSent = sent?.sentAt ?? new Date().toISOString();
      r = patchStage(r, s.id, next === "nudge" ? { nudgedAt: atSent } : { resumedAt: atSent });
      await log(api, r, { kind: "message", stage: s.id, text });
    }
  }
  const moved = advance(track, r);
  r = moved.run;
  announceGates(api, r, moved.opened);
  if (r !== input) await save(api, r);
  return r;
}

function isTeaser(r: Run, s: StageRun): boolean {
  return s.recipe === "teaser" && !!runFolder(r);
}

/**
 * The teaser (D-458): the stage's storyboard becomes a Motion video (`createVideo`), Motion renders
 * it, and the stage finishes once the MP4 and its poster are copied into `teaser/`. Without Motion's
 * renderer, or when the render fails, it finishes with the storyboard and says why.
 */
async function teaserStep(api: AddonHostApi, input: Run, s: StageRun): Promise<{ run: Run; ready: boolean }> {
  let r = input;
  const folder = runFolder(r) ?? "";
  const note = async (text: string, video?: StageRun["video"]) => {
    await log(api, r, { kind: "decision", stage: s.id, text });
    r = patchStage(r, s.id, { video: { ...(video ?? s.video ?? { id: "" }), note: text } });
    return { run: r, ready: true };
  };
  if (!s.video) {
    const board = (s.report?.outputs ?? [])
      .map((p) => relPath(folder, p, r.slug))
      .find((p) => p?.endsWith(".json"));
    if (!board) return { run: r, ready: true };
    let made: { id: string };
    try {
      const sb = JSON.parse(await readFile(join(folder, board), "utf8")) as Record<string, unknown>;
      const scenes: Array<Record<string, unknown>> = [];
      for (const x of Array.isArray(sb.scenes) ? sb.scenes : []) {
        if (!x || typeof x !== "object") continue;
        const { media, ...scene } = x as Record<string, unknown>;
        const file =
          typeof media === "string" && media ? (isAbsolute(media) ? media : join(folder, media)) : "";
        scenes.push(file && (await exists(file)) ? { ...scene, media: file } : scene);
      }
      made = await api.addons.call<{ id: string }>("motion", "createVideo", {
        projectId: r.projectId,
        kind: "teaser",
        title: typeof sb.title === "string" ? sb.title : `${r.title} teaser`,
        brief: `The teaser of Jig factory's run "${r.title}"`,
        language: typeof sb.language === "string" ? sb.language : (r.languages.marketing ?? r.languages.all),
        scenes,
        ...(sb.style && typeof sb.style === "object" ? { ownStyle: sb.style } : {}),
      });
    } catch (e) {
      return note(
        `The teaser stays a storyboard: Motion couldn't make it (${e instanceof Error ? e.message : String(e)})`,
      );
    }
    const queued = await api.addons
      .call<{ queued?: boolean; needs?: unknown }>("motion", "render", {
        projectId: r.projectId,
        id: made.id,
      })
      .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    if (!("queued" in queued) || !queued.queued)
      return note(
        "error" in queued
          ? `Motion couldn't render the teaser (${queued.error}); it is in Motion as a draft`
          : "Motion needs its renderer: open the teaser in Motion, install it there and render",
        { id: made.id },
      );
    await log(api, r, { kind: "decision", stage: s.id, text: "Motion is rendering the teaser" });
    r = patchStage(r, s.id, {
      video: { id: made.id, rendering: true },
      chatNote: "Motion is rendering the teaser",
    });
    return { run: r, ready: false };
  }
  if (!s.video.rendering) return { run: r, ready: true };
  const v = await api.addons
    .call<{ status: string; dir: string; renders: Array<{ n: number }>; error?: string }>("motion", "get", {
      projectId: r.projectId,
      id: s.video.id,
    })
    .catch(() => undefined);
  if (!v) return note("The teaser's video is gone from Motion", { id: s.video.id });
  if (v.status === "failed")
    return note(`Motion's render failed: ${v.error ?? "see Motion"}`, { id: s.video.id });
  const last = v.renders[v.renders.length - 1];
  if (v.status !== "rendered" || !last) return { run: r, ready: false };
  const out = ["teaser/teaser.mp4", "teaser/poster.png"];
  try {
    await mkdir(join(folder, "teaser"), { recursive: true });
    await copyFile(join(v.dir, "renders", String(last.n), "video.mp4"), join(folder, out[0] ?? ""));
    await copyFile(join(v.dir, "renders", String(last.n), "poster.png"), join(folder, out[1] ?? "")).catch(
      () => out.pop(),
    );
  } catch (e) {
    return note(`Couldn't copy the teaser from Motion: ${e instanceof Error ? e.message : String(e)}`, {
      id: s.video.id,
    });
  }
  r = patchStage(r, s.id, {
    video: { id: s.video.id },
    chatNote: undefined,
    report: s.report ? { ...s.report, outputs: [...s.report.outputs, ...out] } : s.report,
  });
  return { run: r, ready: true };
}

/** Turns what a stage reported into the run's outputs: each file must be there; Markdown gets its front-matter. */
async function collect(api: AddonHostApi, track: Track, input: Run, stage: StageRun): Promise<Run> {
  let r = input;
  const report = stage.report;
  const folder = runFolder(r);
  if (!report || !folder) return failStage(r, stage.id, { retries: track.caps.retriesPerStage });
  const { recipes } = await recipesOf(api, r);
  const recipe = recipes.get(stage.recipe);
  const version = stage.version ?? 1;
  const paths = report.outputs.map((p) => relPath(folder, p, r.slug)).filter((p): p is string => !!p);
  const missing: string[] = [];
  for (const p of paths) if (!(await exists(join(folder, p)))) missing.push(p);
  if (!report.failed && (!paths.length || missing.length)) {
    await log(api, r, {
      kind: "error",
      stage: stage.id,
      text: paths.length ? `Reported files that aren't there: ${missing.join(", ")}` : "Reported no files",
    });
    return failStage(patchStage(r, stage.id, { report: undefined }), stage.id, {
      retries: track.caps.retriesPerStage,
    });
  }
  if (report.failed) return failStage(r, stage.id, { retries: track.caps.retriesPerStage });
  const kind = recipe?.kind ?? stage.recipe;
  const at = new Date().toISOString();
  let quality = report.quality;
  for (const [i, p] of paths.entries()) {
    const file = join(folder, p);
    if (p.endsWith(".md")) {
      const text = await readFile(file, "utf8");
      const { data } = parseFrontMatter(text);
      const keep = Object.fromEntries(
        ["recipe", "version", "run", "provider", "model", "createdAt"]
          .filter((k) => data[k] !== undefined)
          .map((k) => [k, data[k]]),
      );
      await writeFile(
        file,
        updateFrontMatter(text, {
          recipe: stage.recipe,
          version,
          run: r.id,
          provider: recipe?.provider ?? "claude",
          model: recipe?.model ?? "default",
          createdAt: at,
          ...keep,
          status: "draft",
        }),
        "utf8",
      );
      if (kind === "brief") {
        const level = asLevel(data.level);
        r = {
          ...r,
          level: r.level ?? level,
          brief: {
            status: "draft",
            level: level ?? r.level,
            product: str(data.product),
            audience: str(data.audience),
            coverage: parseBrief(text).coverage,
          },
        };
      }
    }
    if (kind === "quality" && !quality && p.endsWith(".json")) {
      try {
        const q = JSON.parse(await readFile(file, "utf8")) as { pass?: unknown; score?: unknown };
        quality = { pass: q.pass === true, score: typeof q.score === "number" ? q.score : undefined };
      } catch {
        quality = { pass: false };
      }
    }
    const id = `${stage.id.includes(":") ? stage.id.split(":")[1] : kind}-v${version}`;
    r = addOutput(
      r,
      {
        id: i === 0 ? id : `${id}-${fileSlug(p)}`,
        kind: i === 0 ? kind : `${kind}-file`,
        stage: stage.id,
        path: p,
        version,
        hash: await hashOf(file),
      },
      at,
    );
    // Other forms (D-467): an HTML output printed to PDF, a file beside it.
    const format = p.endsWith(".html") ? recipe?.formats[0] : undefined;
    if (format) {
      const pdf = p.replace(/\.html$/, ".pdf");
      try {
        await api.capture.pdf({
          file,
          out: join(folder, pdf),
          page: format === "pdf-slides" ? "slides" : "a4",
        });
        r = addOutput(
          r,
          {
            id: `${id}-${fileSlug(pdf)}`,
            kind: `${kind}-file`,
            stage: stage.id,
            path: pdf,
            version,
            hash: await hashOf(join(folder, pdf)),
          },
          at,
        );
      } catch (e) {
        await log(api, r, {
          kind: "error",
          stage: stage.id,
          text: `Couldn't print ${p} to PDF: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }
  r = finishStage(r, stage.id, { ...report, outputs: paths, ...(quality ? { quality } : {}) }, at);
  await commitFolder(api, r, `factory ${r.id}: ${stageTitle(track, stage)} v${version}`);
  await log(api, r, {
    kind: "decision",
    stage: stage.id,
    text: `Done: ${report.summary}${quality ? ` (quality ${quality.pass ? "passed" : "failed"}${quality.score !== undefined ? `, ${quality.score}` : ""})` : ""}`,
  });
  return r;
}

/** A file's part of an output id: `sales/deck.pdf` → `deck-pdf`. */
function fileSlug(p: string): string {
  return p
    .replace(/^.*[\\/]/, "")
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-");
}

/** A file's content hash, so a review knows whether a person edited it (D-467). */
async function hashOf(file: string): Promise<string | undefined> {
  const data = await readFile(file).catch(() => undefined);
  return data ? createHash("sha1").update(data).digest("hex") : undefined;
}

/** A reported path relative to the run's folder, or undefined when it points outside it. */
function relPath(folder: string, p: string, slug: string): string | undefined {
  let x = p.trim().replace(/\\/g, "/");
  if (!x) return undefined;
  if (isAbsolute(x)) x = relative(folder, x).replace(/\\/g, "/");
  x = x.replace(/^\.\//, "").replace(new RegExp(`^${folderOf(slug)}/`), "");
  if (x.startsWith("../") || x === ".." || isAbsolute(x)) return undefined;
  return x;
}

/** Starts a ready stage in a new chat: its recipe's prompt, its provider and model, the run's permission mode. */
async function startChat(api: AddonHostApi, input: Run, s: StageRun): Promise<Run> {
  const track = await trackOf(api, input.track);
  let r = input;
  const { recipes, errors } = await recipesOf(api, r);
  for (const e of errors) await log(api, r, { kind: "error", text: `Recipe override left out: ${e}` });
  const recipe = recipes.get(s.recipe);
  const folder = runFolder(r);
  const cwd = workDir(r);
  if (!recipe || !folder || !cwd) {
    r = stageNeedsYou(
      patchStage(startStage(r, s.id), s.id, {
        question: recipe ? "The run has no folder" : `There is no recipe "${s.recipe}"`,
      }),
      s.id,
    );
    await save(api, r);
    return r;
  }
  const inputs = await inputsOf(r, recipe, cwd);
  const version = s.version ?? 1;
  const prompt = stagePrompt({ recipe, run: r, stage: { ...s, version }, folder, inputs });
  const title = `Factory · ${r.title} · ${stageTitle(track, s)}`;
  try {
    await mkdir(folder, { recursive: true });
    for (const o of outputPaths(recipe, version)) await mkdir(dirname(join(folder, o)), { recursive: true });
    const { sessionId } = await api.chats.create({
      projectId: r.projectId,
      cwd,
      title,
      permissionMode: r.plan?.permissionMode ?? "acceptEdits",
      provider: recipe.provider,
      model: recipe.model,
    });
    r = startStage(r, s.id, { chatId: sessionId });
    r = patchStage(r, s.id, {
      chats: [...(s.chats ?? []), sessionId],
      sentAt: new Date().toISOString(),
      version,
      report: undefined,
      question: undefined,
      nudgedAt: undefined,
      resumedAt: undefined,
      chatNote: undefined,
      skipReason: undefined,
      video: undefined,
    });
    // Saved before the prompt goes, so its tool calls find the stage.
    await save(api, r);
    await log(api, r, { kind: "prompt", stage: s.id, text: prompt });
    const sent = await api.chats.send({
      sessionId,
      text: prompt,
      from: `Jig factory: ${stageTitle(track, s)} for "${r.title}"`,
    });
    r = patchStage(r, s.id, { sentAt: sent.sentAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (recipe.provider === "chatgpt" && /ChatGPT isn't signed in/i.test(message)) {
      // Image outputs need ChatGPT (D-446): without it they're skipped, and say why.
      const why = "Skipped: ChatGPT isn't signed in (sign in on Get started → ChatGPT, then re-run it)";
      await log(api, r, { kind: "decision", stage: s.id, text: why });
      r = patchStage(setStageStatus(r, s.id, "skipped"), s.id, { skipReason: why });
      const moved = advance(track, r);
      r = moved.run;
      announceGates(api, r, moved.opened);
      await save(api, r);
      return r;
    }
    await log(api, r, { kind: "error", stage: s.id, text: `Couldn't start its chat: ${message}` });
    const cur = r.stages.find((x) => x.id === s.id);
    if (cur?.status === "ready") r = startStage(r, s.id);
    r = stageNeedsYou(patchStage(r, s.id, { question: `Couldn't start its chat: ${message}` }), s.id);
  }
  await save(api, r);
  return r;
}

/** What a stage reads, as paths relative to the run's folder (the kit: absolute, it is outside). */
async function inputsOf(r: Run, recipe: Recipe, cwd: string): Promise<Array<{ name: string; path: string }>> {
  const out: Array<{ name: string; path: string }> = [];
  for (const input of recipe.inputs) {
    if (input === "input") out.push({ name: "what came in", path: "input/" });
    else if (input.startsWith("kit")) {
      const kit = join(cwd, ".jig", "factory", "kit");
      if (await exists(kit)) out.push({ name: "the product kit", path: kit });
      const own = r.outputs.find((o) => o.kind === "kit" && o.status !== "rejected");
      if (own) out.push({ name: "the run's kit", path: "kit/" });
    } else {
      const kind = input.replace(/\.approved$/, "");
      const found = r.outputs
        .filter((o) => o.kind === kind && o.status !== "superseded" && o.status !== "rejected")
        .sort((a, b) => b.version - a.version)[0];
      if (found) out.push({ name: input, path: found.path });
    }
  }
  return out;
}

// What you do on the run page.

type RunArgs = { projectId: string; runId: string };

/** A gate's decision (D-452): Approve approves its drafts, Ask for changes runs its stage again, Reject stops the run. */
export async function decide(
  a: RunArgs & {
    gateId: GateId;
    kind: "approve" | "changes" | "reject";
    note?: string;
    /** Demo review's comment pins (Ask for changes on G1): they join the note as numbered lines. */
    pins?: Pin[];
    /** The direction picked at GD (`2-bold`). */
    direction?: string;
  },
  api: AddonHostApi,
  /** Who decided: you (`me`), or `board:<name>` from the approvals board (D-469); not from the UI. */
  by: string = ME,
): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const track = await trackOf(api, r.track);
    const pins = a.kind === "changes" ? cleanPins(a.pins) : [];
    const note = (a.kind === "changes" ? changesNote(a.note ?? "", pins) : a.note?.trim()) || undefined;
    if (a.kind === "changes" && !note) throw new Error("Say what to change");
    const drafts = gateOutputs(r, a.gateId);
    if (a.gateId === "GD" && a.kind === "approve") {
      const picked = directionsOf(r).find((d) => d.id === a.direction);
      if (a.direction && !picked) throw new Error(`There is no direction ${a.direction}`);
      if (picked) r = { ...r, direction: picked.id };
    }
    r = decideGate(
      r,
      a.gateId,
      a.kind === "changes"
        ? { kind: "changes", by, note, pins: pins.length ? pins : undefined }
        : {
            kind: a.kind,
            by,
            note: note ?? (r.direction && a.gateId === "GD" ? `Picked ${r.direction}` : undefined),
          },
      { cap: track.caps.revisionsPerGate },
    );
    if (a.kind === "approve")
      for (const o of drafts) {
        if (o.status === "approved" || o.status === "published") continue;
        r = await moveOne(api, r, o, "approved");
      }
    else if (a.kind === "changes" && r.state !== "stuck")
      r = resetFrom(track, r, changesAt(track, r, a.gateId), { feedback: note, keepGate: a.gateId });
    const moved = advance(track, r);
    r = moved.run;
    announceGates(api, r, moved.opened);
    if (a.kind === "approve")
      await commitFolder(api, r, `factory ${r.id}: ${GATES[a.gateId].label} approved`);
    await save(api, r);
    await log(api, r, {
      kind: "decision",
      text: `${GATES[a.gateId].label}: ${a.kind}${by.startsWith(BY_BOARD) ? ` by ${by.slice(BY_BOARD.length)} on the board` : ""}${note ? ` (${note})` : ""}`,
    });
    return r;
  });
  await step(api);
  return r;
}

/**
 * A person approves or rejects one output (D-467): whether they edited it comes from its file's hash,
 * and its Markdown front-matter says the new status.
 */
async function moveOne(
  api: AddonHostApi,
  r: Run,
  o: Output,
  to: "approved" | "rejected" | "reviewed",
  note?: string,
): Promise<Run> {
  const at = new Date().toISOString();
  const file = outputPath(api, r, o.path);
  const now = file ? await hashOf(file) : undefined;
  const edited = !!(o.hash && now && now !== o.hash);
  const moved = moveOutput(r, o.id, to, { by: ME, at, edited, note });
  if (file && o.path.endsWith(".md") && (await exists(file)))
    await writeFile(
      file,
      setStatus(await readFile(file, "utf8"), { status: to, by: ME, at, edited }),
      "utf8",
    );
  return moved;
}

/**
 * The inbox's review of one output (D-467): Approve or Reject (with why) it and its files (the PDF,
 * the HTML form). Once nothing of its gate waits and something was approved, the gate is approved.
 */
export async function decideOutput(
  a: RunArgs & { outputId: string; kind: "approve" | "reject"; note?: string },
  api: AddonHostApi,
): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const track = await trackOf(api, r.track);
    const o = r.outputs.find((x) => x.id === a.outputId);
    if (!o) throw new Error(`There is no output ${a.outputId}`);
    const note = a.note?.trim() || undefined;
    if (a.kind === "reject" && !note) throw new Error("Say why it's rejected");
    const to = a.kind === "approve" ? "approved" : "rejected";
    for (const x of [o, ...filesOf(r, o)])
      if (OUTPUT_MOVES[x.status].includes(to)) r = await moveOne(api, r, x, to, x === o ? note : undefined);
    await log(api, r, { kind: "decision", text: `${outputName(o)}: ${to}${note ? ` (${note})` : ""}` });
    const gateId = reviewerOf(o.kind);
    const gate = r.gates.find((g) => g.id === gateId);
    const mine = gateOutputs(r, gateId).filter((x) => !isFile(x));
    if (
      gate?.status === "waiting" &&
      !mine.some((x) => x.status === "draft" || x.status === "reviewed") &&
      mine.some((x) => x.status === "approved")
    ) {
      r = decideGate(r, gateId, { kind: "approve", by: ME, note: "Every output reviewed" });
      const moved = advance(track, r);
      r = moved.run;
      announceGates(api, r, moved.opened);
      await log(api, r, {
        kind: "decision",
        text: `${GATES[gateId].label}: approved (every output reviewed)`,
      });
    }
    await commitFolder(api, r, `factory ${r.id}: ${outputName(o)} ${to}`);
    await save(api, r);
    return r;
  });
  await step(api);
  return r;
}

/** Runs a stage again as its next version, with a note to address; everything after it waits again. */
export async function rerun(
  a: RunArgs & { stageId: string; note?: string },
  api: AddonHostApi,
): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const s = r.stages.find((x) => x.id === a.stageId);
    if (!s) throw new Error(`There is no stage ${a.stageId}`);
    if (s.status === "running") throw new Error("It is running now");
    r = settle(
      resetFrom(await trackOf(api, r.track), r, [a.stageId], { feedback: a.note?.trim() || undefined }),
    );
    r = advance(await trackOf(api, r.track), r).run;
    await save(api, r);
    await log(api, r, { kind: "decision", stage: a.stageId, text: `Re-run${a.note ? `: ${a.note}` : ""}` });
    return r;
  });
  await step(api);
  return r;
}

/** A new run from this one, from a stage on, in a worktree of its own from this run's branch. */
export async function fork(a: RunArgs & { stageId: string; note?: string }, api: AddonHostApi): Promise<Run> {
  const r = await serial(async () => {
    const from = await loadRun(api, a.projectId, a.runId);
    if (!from.stages.some((x) => x.id === a.stageId)) throw new Error(`There is no stage ${a.stageId}`);
    const track = await trackOf(api, from.track);
    const id = newRunId();
    const taken = (await load(api, a.projectId)).map((x) => x.slug);
    const base = uniqueSlug(`${from.slug}-fork`, taken);
    await commitFolder(api, from, `factory ${from.id}: before fork`);
    const made =
      from.repo && from.worktree
        ? await makeWorktree(api, from.repo, id, base, branchOf(from.slug))
        : { worktree: from.worktree ?? null, slug: base };
    let r = forkRun(track, from, a.stageId, {
      id,
      slug: made.slug,
      title: `${from.title} (fork)`,
      worktree: made.worktree,
      feedback: a.note?.trim() || undefined,
    });
    // The fork's folder: a copy of what came before, under its own slug.
    const src = runFolder(from);
    const dst = runFolder(r);
    if (src && dst && src !== dst && (await exists(src))) {
      const old = made.worktree ? join(made.worktree, folderOf(from.slug)) : src;
      await mkdir(dirname(dst), { recursive: true });
      await copyTree((await exists(old)) ? old : src, dst);
    }
    r = advance(track, r).run;
    await save(api, r);
    await log(api, r, {
      kind: "decision",
      stage: a.stageId,
      text: `Forked from ${from.title} at ${a.stageId}${a.note ? `: ${a.note}` : ""}`,
    });
    return r;
  });
  await step(api);
  return r;
}

async function copyTree(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    const a = join(from, name);
    const b = join(to, name);
    if ((await stat(a)).isDirectory()) await copyTree(a, b);
    else await copyFile(a, b);
  }
}

/** Stops a run: nothing new starts; its stage chats and its worktree are left as they are (D-451). */
export async function stop(a: RunArgs, api: AddonHostApi): Promise<Run> {
  return serial(async () => {
    const r: Run = {
      ...(await loadRun(api, a.projectId, a.runId)),
      state: "stopped",
      updatedAt: new Date().toISOString(),
    };
    await save(api, r);
    await log(api, r, { kind: "decision", text: "Stopped" });
    return r;
  });
}

/**
 * Your answers to a stage's question cards, and your `reply` to the question it asked with
 * `factory_ask`: recorded, and sent to its chat as one message.
 */
export async function answer(
  a: RunArgs & { stageId: string; answers?: Array<{ id: string; answer: string }>; reply?: string },
  api: AddonHostApi,
): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const s = r.stages.find((x) => x.id === a.stageId);
    if (!s?.chatId) throw new Error(`Stage ${a.stageId} has no chat`);
    const at = new Date().toISOString();
    const given = new Map((a.answers ?? []).map((x) => [x.id, String(x.answer ?? "").trim()]));
    const reply = s.question ? a.reply?.trim() : undefined;
    const answered: Question[] = [];
    const questions = (r.questions ?? []).map((q) => {
      const v = given.get(q.id);
      if (q.stage !== a.stageId || q.answer || !v) return q;
      const next = { ...q, answer: v, answeredAt: at };
      answered.push(next);
      return next;
    });
    if (!answered.length && !reply) throw new Error("No answers");
    r = { ...r, questions };
    const round = answered.length ? Math.max(...answered.map((q) => q.round)) : 0;
    const list = answered.map((q) => ({ text: q.text, answer: q.answer ?? "" }));
    if (reply && s.question) list.push({ text: s.question, answer: reply });
    const text = answersText(r, s, round, list);
    const sent = await api.chats.send({ sessionId: s.chatId, text, from: "Jig factory: your answers" });
    if (s.status === "needs-you") r = resumeStage(r, s.id);
    r = patchStage(r, s.id, { sentAt: sent.sentAt, nudgedAt: undefined, question: undefined });
    await save(api, r);
    await log(api, r, { kind: "message", stage: s.id, text });
    return r;
  });
  await step(api);
  return r;
}

/** The brief's coverage, gaps and level from its file (D-461): the interviewer rewrites it every round. */
async function withBriefFile(r: Run): Promise<Run> {
  const folder = runFolder(r);
  const text = folder ? await readFile(join(folder, "brief.md"), "utf8").catch(() => undefined) : undefined;
  if (text === undefined) return r;
  const b = parseBrief(text);
  return {
    ...r,
    brief: {
      status: r.brief?.status ?? "draft",
      ...r.brief,
      level: b.level ?? r.brief?.level,
      product: str(b.data.product) ?? r.brief?.product,
      audience: str(b.data.audience) ?? r.brief?.audience,
      coverage: b.coverage,
    },
  };
}

// The stage chats' side: their context and tools (`addon_factory_*`).

type ChatArgs = { chat?: { sessionId?: string; projectId?: string; cwd?: string } };

async function stageOfChat(
  api: AddonHostApi,
  args: ChatArgs,
): Promise<{ run: Run; stage: StageRun } | undefined> {
  const sessionId = args.chat?.sessionId;
  if (!sessionId) return undefined;
  const at = await findChat(api, sessionId, args.chat?.projectId);
  if (!at) return undefined;
  const r = await api.storage.get<Run>(runKey(at.runId), scope(at.projectId));
  const stage = r?.stages.filter((s) => s.chatId === sessionId || s.chats?.includes(sessionId)).at(-1);
  return r && stage ? { run: r, stage } : undefined;
}

const NOT_A_STAGE = "This chat isn't a stage of a Jig factory run.";

export async function context(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const found = await stageOfChat(api, args);
  if (!found) return "";
  const { run: r, stage } = found;
  const track = await trackOf(api, r.track);
  return [
    `This chat is the "${stageTitle(track, stage)}" stage (${stage.id}, version ${stage.version ?? 1}) of Jig factory's run "${r.title}".`,
    `The run's folder is ${runFolder(r)} on branch ${branchOf(r.slug)}. Write only there, as drafts.`,
    "addon_factory_brief gives the run's brief, plan and inputs. When your work is done call addon_factory_report with the files you wrote; when you need a person call addon_factory_ask.",
  ].join("\n");
}

const DESIGN_KINDS = new Set([
  "brief",
  "demo",
  "directions",
  "quality",
  "kit",
  "deck",
  "deck-images",
  "one-pager",
  "one-pager-images",
  "letter",
  "newsletter",
  "marketing-images",
  "teaser",
]);

/**
 * The e-learning connector (D-447) for the course stages: the user's own MCP server, as Claude Code
 * knows it, and which of its tools make a course. Without it the course is Markdown.
 */
async function elearningLines(api: AddonHostApi): Promise<string[]> {
  const c = await api.config<{ elearning?: { server?: string; tools?: string } }>().catch(() => undefined);
  const server = c?.elearning?.server?.trim();
  const tools = c?.elearning?.tools?.trim();
  return [
    "",
    "## E-learning connector",
    server
      ? `- MCP server: ${server}${tools ? `\n- Its tools: ${tools}` : ""}\n- Create the course unpublished, put its link in the Markdown file; never publish`
      : "- none set: the Markdown file in learning/ is the course",
  ];
}

/**
 * What the design stages build from (D-444, D-462): the product kit, a picked direction, the demo
 * kit's folder and the `DESIGN.md` references from Settings → Jig factory.
 */
async function designLines(api: AddonHostApi, r: Run): Promise<string[]> {
  const c = await api.config<{ demoKitPath?: string; designSources?: string[] }>().catch(() => undefined);
  const repo = workDir(r);
  const picked = r.direction ? directionsOf(r).find((d) => d.id === r.direction) : undefined;
  const sources = (c?.designSources ?? []).filter((x) => typeof x === "string" && x.trim());
  return [
    "",
    "## Design",
    `- Product kit: ${r.plan?.productExists && repo ? join(repo, ".jig", "factory", "kit") : "none (a new brand)"}`,
    ...(picked
      ? [`- Picked direction: ${picked.name} (${picked.path}); build from it, it is the run's kit`]
      : []),
    `- Demo kit: ${c?.demoKitPath?.trim() || "not set (build a self-contained static folder by hand)"}`,
    sources.length
      ? `- Design references (DESIGN.md libraries; borrow mood and rules, never another brand's colours, logo or name; a product kit always wins): ${sources.join(", ")}`
      : "- Design references: none set",
  ];
}

/** `factory_brief`: the run's brief, plan, the stage's inputs and earlier outputs. */
export async function toolBrief(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const found = await stageOfChat(api, args);
  if (!found) throw new Error(NOT_A_STAGE);
  const { run: r, stage } = found;
  const { recipes } = await recipesOf(api, r);
  const recipe = recipes.get(stage.recipe);
  const folder = runFolder(r) ?? "";
  const briefFile = r.outputs.find((o) => o.kind === "brief" && o.status !== "superseded");
  const briefText = briefFile ? await readFile(join(folder, briefFile.path), "utf8").catch(() => "") : "";
  const inputs = recipe ? await inputsOf(r, recipe, workDir(r) ?? "") : [];
  return [
    `# ${r.title} (run ${r.id}, stage ${stage.id}, version ${stage.version ?? 1})`,
    `Folder: ${folder}`,
    `Level: ${r.level ?? "not decided"} · Product exists: ${r.plan?.productExists ? "yes" : "no"} · Pack: ${(r.plan?.outputs ?? []).join(", ") || "none"}`,
    "",
    "## Your inputs",
    ...(inputs.length ? inputs.map((i) => `- ${i.name}: ${i.path}`) : ["- none"]),
    ...(recipe ? ["", "## You write", ...outputPaths(recipe, stage.version ?? 1).map((o) => `- ${o}`)] : []),
    "",
    "## Outputs so far",
    ...(r.outputs.length
      ? r.outputs.map((o) => `- ${o.path} (${o.kind} v${o.version}, ${o.status})`)
      : ["- none"]),
    ...(stage.feedback ? ["", "## Changes asked", stage.feedback] : []),
    ...(recipe && DESIGN_KINDS.has(recipe.kind) ? await designLines(api, r) : []),
    ...(recipe?.kind.startsWith("course") ? await elearningLines(api) : []),
    "",
    "## The brief",
    briefText || "(not written yet)",
  ].join("\n");
}

function parseQuestions(v: unknown): Array<{ text: string; suggestion?: string; options?: string[] }> {
  const list =
    typeof v === "string"
      ? (() => {
          try {
            return JSON.parse(v) as unknown;
          } catch {
            return [v];
          }
        })()
      : v;
  if (!Array.isArray(list)) return [];
  return list
    .map((q) => (typeof q === "string" ? { text: q } : (q as Record<string, unknown>)))
    .filter((q) => typeof q?.text === "string" && (q.text as string).trim())
    .map((q) => ({
      text: String(q.text).trim(),
      suggestion: typeof q.suggestion === "string" ? q.suggestion : undefined,
      options: Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === "string")
        : undefined,
    }));
}

/** `factory_questions`: the interviewer's question cards; the answers come as the chat's next message. */
export async function toolQuestions(
  args: ChatArgs & { questions?: unknown },
  api: AddonHostApi,
): Promise<string> {
  const cards = parseQuestions(args.questions).slice(0, 8);
  if (!cards.length) throw new Error("Give at least one question: [{ text, suggestion, options? }]");
  return serial(async () => {
    const found = await stageOfChat(api, args);
    if (!found) throw new Error(NOT_A_STAGE);
    let { run: r } = found;
    const { stage } = found;
    const mine = (r.questions ?? []).filter((q) => q.stage === stage.id);
    const round = Math.max(0, ...mine.map((q) => q.round)) + 1;
    const at = new Date().toISOString();
    const added: Question[] = cards.map((c, i) => ({
      id: `${stage.id}-${round}-${i + 1}`,
      stage: stage.id,
      round,
      askedAt: at,
      ...c,
    }));
    const questions = [...(r.questions ?? []), ...added];
    r = await withBriefFile({ ...r, questions, updatedAt: at });
    await save(api, r);
    await log(api, r, {
      kind: "tool",
      stage: stage.id,
      text: `Asked ${added.length} questions (round ${round}):\n${added.map((q) => `- ${q.text}`).join("\n")}`,
    });
    return `Posted ${added.length} question cards (round ${round}). End your turn now: the person's answers come back as your next message.`;
  });
}

function parseReportArgs(a: Record<string, unknown>): StageReport {
  const list = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : [])
      .map((x) => String(x).trim())
      .filter(Boolean);
  const q = a.quality as Record<string, unknown> | undefined;
  return {
    summary: typeof a.summary === "string" && a.summary.trim() ? a.summary.trim() : "Done",
    outputs: list(a.outputs),
    notes: list(a.notes).slice(0, 30),
    ...(q && typeof q === "object"
      ? { quality: { pass: q.pass === true, score: typeof q.score === "number" ? q.score : undefined } }
      : {}),
    ...(a.failed === true ? { failed: true } : {}),
  };
}

/** `factory_report`: a stage says it is done (or couldn't); Jig factory collects the files when its turn ends. */
export async function toolReport(
  args: ChatArgs & Record<string, unknown>,
  api: AddonHostApi,
): Promise<string> {
  const report = parseReportArgs(args);
  return serial(async () => {
    const found = await stageOfChat(api, args);
    if (!found) throw new Error(NOT_A_STAGE);
    const { run: r, stage } = found;
    if (stage.status !== "running" && stage.status !== "needs-you")
      throw new Error(`Stage ${stage.id} is ${stage.status}; there is nothing to report`);
    const folder = runFolder(r) ?? "";
    const outside = report.outputs.filter((p) => !relPath(folder, p, r.slug));
    if (outside.length)
      throw new Error(`These files are outside the run's folder (${folder}): ${outside.join(", ")}`);
    const next = patchStage(r, stage.id, { report, question: undefined });
    await save(api, next);
    await log(api, next, {
      kind: "tool",
      stage: stage.id,
      text: `Report: ${report.summary}\nFiles: ${report.outputs.join(", ") || "none"}${report.notes.length ? `\nNotes:\n${report.notes.map((n) => `- ${n}`).join("\n")}` : ""}`,
    });
    return `Reported stage ${stage.id}${report.failed ? " as failed" : ""}. Jig factory collects your files when your turn ends; end your turn now.`;
  });
}

/** `factory_ask`: the stage needs a person; it waits for you when its turn ends. */
export async function toolAsk(args: ChatArgs & { question?: unknown }, api: AddonHostApi): Promise<string> {
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (!question) throw new Error("Say what you need to know");
  return serial(async () => {
    const found = await stageOfChat(api, args);
    if (!found) throw new Error(NOT_A_STAGE);
    const next = patchStage(found.run, found.stage.id, { question });
    await save(api, next);
    await log(api, next, { kind: "tool", stage: found.stage.id, text: `Asked: ${question}` });
    return "Jig factory shows your question on the run. End your turn now; the answer comes back in this chat.";
  });
}

/** `factory_runs`: a project's runs and what waits, for any chat. */
export async function toolRuns(args: ChatArgs & { project?: string }, api: AddonHostApi): Promise<string> {
  const projects = await api.projects();
  const wanted = args.project?.trim().toLowerCase();
  const p = wanted
    ? projects.find((x) => x.name.toLowerCase() === wanted || x.id === args.project)
    : projects.find((x) => x.id === args.chat?.projectId);
  if (!p) throw new Error(wanted ? `There is no project called ${args.project}` : "Name the project");
  const list = (await load(api, p.id))
    .filter((r) => !isSample(r.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length) return `${p.name} has no Jig factory runs.`;
  return list
    .map((r) => {
      const gates = r.gates.filter((g) => g.status === "waiting").map((g) => GATES[g.id].label);
      const stuck = r.stages.filter((s) => s.status === "needs-you").map((s) => s.id);
      const running = r.stages.filter((s) => s.status === "running").map((s) => s.id);
      return `- ${r.title} (${r.id}, ${r.state}): ${[running.length ? `running ${running.join(", ")}` : "", gates.length ? `waits at ${gates.join(", ")}` : "", stuck.length ? `needs you at ${stuck.join(", ")}` : ""].filter(Boolean).join("; ") || "nothing running"}, ${r.outputs.length} outputs`;
    })
    .join("\n");
}

/** Shared with Motion (D-465): the `DESIGN.md` references from Settings → Jig factory (D-444). */
export async function designSources(_args: unknown, api: AddonHostApi): Promise<string[]> {
  const c = await api.config<{ designSources?: string[] }>().catch(() => undefined);
  return (c?.designSources ?? []).filter((x): x is string => typeof x === "string" && !!x.trim());
}
