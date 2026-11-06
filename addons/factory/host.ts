/**
 * Jig factory's host code: the runs a project keeps (storage `runs` + `run:<id>`, D-116), the sample
 * runs (D-442), and the Conductor (architecture.md → The Conductor, The stage runner): it starts runs
 * in their own git worktree (D-451), moves them through their track, starts each stage's chat from its
 * recipe, follows the chats it started (`chatChanged`, and the `tick` watcher after a restart),
 * collects what a stage reported, opens gates, and runs stages again for "Ask for changes", Re-run and
 * Fork. The decisions are pure, in `lib/conductor.ts`; this file reads and writes.
 */
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { AddonChatInfo, AddonHostApi, AddonProject } from "@jig/sdk";
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
import { GATES } from "./lib/gates";
import { itemId, type Track } from "./lib/graph";
import { outputPaths, parseRecipe, type Recipe, resolveRecipes, stagePrompt } from "./lib/recipes";
import {
  addOutput,
  addStage,
  decideGate,
  failStage,
  finishStage,
  type GateId,
  type Level,
  ME,
  moveOutput,
  patchStage,
  type Question,
  type Run,
  type RunPlan,
  resumeStage,
  type StageReport,
  type StageRun,
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
  await git(api, dir, ["commit", "-q", "-m", message, "--", folderOf(r.slug)]);
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
  if (!briefMd && !a.text?.trim()) throw new Error("Say what the idea is, or pick a brief");
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
      source: { kind: "typed" },
      plan,
    };
    const folder = runFolder(r) ?? join(repo, folderOf(r.slug));
    await mkdir(join(folder, "input"), { recursive: true });
    if (a.text?.trim()) await writeFile(join(folder, "input", "idea.md"), `${a.text.trim()}\n`, "utf8");
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
          coverage: { covered: 1, total: 1 },
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
  });
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
        r = resumeStage({ ...r, questions, brief: coverageOf(r, questions) }, s.id);
        r = patchStage(r, s.id, { sentAt: at });
      } else if (cur.report && chat?.status === "idle") r = await collect(api, track, r, cur);
      continue;
    }
    const note = chat ? chatNote(chat) : undefined;
    if (note !== cur.chatNote) r = patchStage(r, s.id, { chatNote: note }, r.updatedAt);
    const open = (r.questions ?? []).filter((q) => q.stage === s.id && !q.answer).length;
    const next = chat ? afterTurn(cur, chat, { catchingUp, openQuestions: open }) : "error";
    if (next === "wait") continue;
    await log(api, r, {
      kind: "decision",
      stage: s.id,
      text: `After its turn: ${next}${chat?.error ? ` (${chat.error})` : ""}`,
    });
    if (next === "finish") r = await collect(api, track, r, cur);
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
            coverage: r.brief?.coverage ?? { covered: 1, total: 1 },
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
    const extra =
      i === 0
        ? ""
        : `-${p
            .replace(/^.*[\\/]/, "")
            .replace(/\.[^.]+$/, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`;
    r = addOutput(
      r,
      {
        id: `${stage.id.includes(":") ? stage.id.split(":")[1] : kind}-v${version}${extra}`,
        kind: i === 0 ? kind : `${kind}-file`,
        stage: stage.id,
        path: p,
        version,
      },
      at,
    );
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
  a: RunArgs & { gateId: GateId; kind: "approve" | "changes" | "reject"; note?: string },
  api: AddonHostApi,
): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const track = await trackOf(api, r.track);
    const note = a.note?.trim() || undefined;
    if (a.kind === "changes" && !note) throw new Error("Say what to change");
    const drafts = gateOutputs(r, a.gateId);
    r = decideGate(r, a.gateId, { kind: a.kind, by: ME, note }, { cap: track.caps.revisionsPerGate });
    if (a.kind === "approve")
      for (const o of drafts) {
        if (o.status === "approved" || o.status === "published") continue;
        const at = new Date().toISOString();
        r = moveOutput(r, o.id, "approved", { by: ME, at });
        const file = outputPath(api, r, o.path);
        if (file && o.path.endsWith(".md") && (await exists(file)))
          await writeFile(
            file,
            setStatus(await readFile(file, "utf8"), { status: "approved", by: ME, at, edited: false }),
            "utf8",
          );
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
      text: `${GATES[a.gateId].label}: ${a.kind}${note ? ` (${note})` : ""}`,
    });
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

/** Your answers to a stage's question cards: recorded, and sent to its chat as one message. */
export async function answer(
  a: RunArgs & { stageId: string; answers: Array<{ id: string; answer: string }> },
  api: AddonHostApi,
): Promise<Run> {
  const r = await serial(async () => {
    let r = await loadRun(api, a.projectId, a.runId);
    const s = r.stages.find((x) => x.id === a.stageId);
    if (!s?.chatId) throw new Error(`Stage ${a.stageId} has no chat`);
    const at = new Date().toISOString();
    const given = new Map(a.answers.map((x) => [x.id, x.answer.trim()]));
    const answered: Question[] = [];
    const questions = (r.questions ?? []).map((q) => {
      const v = given.get(q.id);
      if (q.stage !== a.stageId || q.answer || !v) return q;
      const next = { ...q, answer: v, answeredAt: at };
      answered.push(next);
      return next;
    });
    if (!answered.length) throw new Error("No answers");
    r = { ...r, questions, brief: coverageOf(r, questions) };
    const round = Math.max(...answered.map((q) => q.round));
    const text = answersText(
      r,
      s,
      round,
      answered.map((q) => ({ text: q.text, answer: q.answer ?? "" })),
    );
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

function coverageOf(r: Run, questions: Question[]): Run["brief"] {
  const total = questions.length;
  const covered = questions.filter((q) => q.answer).length;
  return { status: r.brief?.status ?? "draft", ...r.brief, coverage: { covered, total } };
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
    r = { ...r, questions, brief: coverageOf(r, questions), updatedAt: at };
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
