import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { AddonHostApi } from "@jig/sdk";
import { compose, FONT_FILE, type MotionStyle } from "./lib/compose";
import { TINY_MP4, TINY_PNG } from "./lib/fake";
import {
  candidates,
  exe,
  FFMPEG_LICENCE,
  type FfmpegAsset,
  ffmpegAssets,
  nodeMajor,
  parseProgress,
  RENDERER,
} from "./lib/install";
import {
  dimensions,
  KINDS,
  normalizeSettings,
  type Storyboard,
  timeline,
  type VideoKind,
  type VideoSettings,
  validate,
} from "./lib/storyboard";
import { checkTemplate, fromTemplate, type Template } from "./lib/templates";

/**
 * Motion (D-453, D-454, D-463): videos made from HTML. Each video is a folder in Motion's own data,
 * `<dataDir>/projects/<projectId>/videos/<id>/` (storyboard.json, settings.json, media/, renders/<n>/),
 * so a page loads its media by relative paths and the preview is the composition itself. Renders run
 * one at a time through a pinned HyperFrames, installed into `<dataDir>/renderer` after the install
 * modal; FFmpeg is looked for first. With `JIG_ENGINE=fake` a fake renderer writes a tiny MP4.
 */

export type VideoStatus = "draft" | "queued" | "rendering" | "rendered" | "failed";

export interface RenderInfo {
  n: number;
  at: string;
  seconds: number;
  bytes: number;
  width: number;
  height: number;
}

export interface VideoMeta {
  id: string;
  title: string;
  kind: VideoKind;
  template?: string;
  createdAt: string;
  updatedAt: string;
  renders: RenderInfo[];
  /** Set while queued or rendering; a job left here by a closed Jig is reported as interrupted. */
  job?: { state: "queued" | "rendering"; at: string; progress: number };
  error?: string;
}

export interface VideoSummary extends VideoMeta {
  projectId: string;
  status: VideoStatus;
  seconds: number;
  aspect: string;
  poster?: string;
  dir: string;
}

export interface VideoDetail extends VideoSummary {
  storyboard: Storyboard;
  settings: VideoSettings;
}

export interface MotionStatus {
  fake: boolean;
  ffmpeg?: string;
  renderer: boolean;
  node?: number;
  /** What the install modal offers: missing pieces this computer can get. */
  missing: Array<"renderer" | "ffmpeg">;
  /** Something the user has to do themselves (no FFmpeg build for this system, old Node.js). */
  blocked?: string;
  install: { renderer: typeof RENDERER; ffmpeg?: { licence: string; mb: number; assets: FfmpegAsset[] } };
  dataDir: string;
  busy?: "installing";
}

interface Config {
  ffmpegPath?: string;
}

const ID = /^v_[a-f0-9]{8}$/;
const PROJECT = /^[\w.-]{1,80}$/;
const STYLE = /^[a-z0-9-]{1,40}$/;
const MEDIA_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".webm", ".mov"]);
const fake = () => process.env.JIG_ENGINE === "fake";

const videoId = (id: unknown): string => {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`"${String(id)}" isn't a video id`);
  return id;
};
const projectId = (id: unknown): string => {
  if (typeof id !== "string" || !PROJECT.test(id)) throw new Error("Open a project first");
  return id;
};
const videosDir = (api: AddonHostApi, project: string) =>
  join(api.addon.dataDir, "projects", projectId(project), "videos");
const videoDir = (api: AddonHostApi, project: string, id: string) =>
  join(videosDir(api, project), videoId(id));

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Atomic: a crash never leaves half a file. */
async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

// One change at a time per add-on: list/get/update and the queue all touch meta.json.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
};

// ── styles and templates ─────────────────────────────────────────────────────

export async function styles(
  _args: unknown,
  api: AddonHostApi,
): Promise<Array<MotionStyle & { id: string }>> {
  const dir = join(api.addon.dir, "styles");
  const out: Array<MotionStyle & { id: string }> = [];
  for (const file of (await readdir(dir).catch(() => [])).sort()) {
    if (!file.endsWith(".json")) continue;
    const style = await readJson<MotionStyle>(join(dir, file));
    if (style) out.push({ ...style, id: basename(file, ".json") });
  }
  return out;
}

async function style(api: AddonHostApi, id: string): Promise<MotionStyle> {
  const list = await styles(undefined, api);
  const found = list.find((s) => s.id === id) ?? list.find((s) => s.id === "neutral") ?? list[0];
  if (!found) throw new Error("Motion's styles are missing");
  return found;
}

export async function templates(_args: unknown, api: AddonHostApi): Promise<Template[]> {
  const dir = join(api.addon.dir, "templates");
  const out: Template[] = [];
  for (const id of (await readdir(dir).catch(() => [])).sort()) {
    const t = await readJson<Template>(join(dir, id, "template.json"));
    if (t && !checkTemplate(t).length) out.push(t);
    else api.log(`Template ${id} is not valid`, t ? checkTemplate(t) : "unreadable");
  }
  return out;
}

// ── videos ───────────────────────────────────────────────────────────────────

const running = new Map<string, { kill: () => void }>();
const cancelled = new Set<string>();
const queue: Array<{ project: string; id: string }> = [];
const key = (project: string, id: string) => `${project}/${id}`;

function statusOf(meta: VideoMeta): VideoStatus {
  if (meta.job) return meta.job.state;
  if (meta.error) return "failed";
  return meta.renders.length ? "rendered" : "draft";
}

async function readVideo(api: AddonHostApi, project: string, id: string): Promise<VideoDetail> {
  const dir = videoDir(api, project, id);
  const meta = await readJson<VideoMeta>(join(dir, "meta.json"));
  const storyboard = await readJson<Storyboard>(join(dir, "storyboard.json"));
  if (!meta || !storyboard) throw new Error("This video no longer exists");
  // A job no running render owns: Jig (or Motion) stopped during it.
  if (
    meta.job &&
    !running.has(key(project, id)) &&
    !queue.some((q) => q.project === project && q.id === id)
  ) {
    delete meta.job;
    meta.error = "The render was interrupted (Jig closed). Render again.";
    await writeJson(join(dir, "meta.json"), meta);
  }
  const settings = normalizeSettings(await readJson(join(dir, "settings.json")));
  const latest = meta.renders.at(-1);
  const poster = latest ? join(dir, "renders", String(latest.n), "poster.png") : undefined;
  return {
    ...meta,
    projectId: project,
    status: statusOf(meta),
    seconds: timeline(storyboard, settings).total,
    aspect: settings.aspect,
    ...(poster && (await exists(poster)) ? { poster } : {}),
    dir,
    storyboard,
    settings,
  };
}

export async function list(args: { projectId: string }, api: AddonHostApi): Promise<VideoSummary[]> {
  return serial(async () => {
    const dir = videosDir(api, args.projectId);
    const out: VideoSummary[] = [];
    for (const id of await readdir(dir).catch(() => [] as string[])) {
      if (!ID.test(id)) continue;
      try {
        const { storyboard: _s, settings: _t, ...summary } = await readVideo(api, args.projectId, id);
        out.push(summary);
      } catch {
        // A half-written folder: skipped.
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function get(args: { projectId: string; id: string }, api: AddonHostApi): Promise<VideoDetail> {
  return serial(() => readVideo(api, args.projectId, args.id));
}

export interface CreateArgs {
  projectId: string;
  kind?: VideoKind;
  /** A template id; its `sample` fills it when `inputs` is missing. */
  template?: string;
  inputs?: Record<string, unknown>;
  storyboard?: Storyboard;
  settings?: Partial<VideoSettings>;
  title?: string;
}

export async function create(args: CreateArgs, api: AddonHostApi): Promise<VideoDetail> {
  const all = await templates(undefined, api);
  let board: Storyboard;
  let template: string | undefined;
  if (args.storyboard) board = args.storyboard;
  else {
    const t =
      all.find((x) => x.id === args.template) ??
      all.find((x) => x.kind === (args.kind ?? "teaser")) ??
      all[0];
    if (!t) throw new Error("Motion's templates are missing");
    template = t.id;
    board = fromTemplate(t, args.inputs ?? t.sample ?? {});
  }
  if (args.title?.trim()) board = { ...board, title: args.title.trim().slice(0, 120) };
  if (args.kind && KINDS.includes(args.kind)) board = { ...board, kind: args.kind };
  const errors = validate(board);
  if (errors.length) throw new Error(errors.join("; "));
  const settings = normalizeSettings({ ...(await defaults(api)), ...args.settings });
  const id = `v_${randomBytes(4).toString("hex")}`;
  const dir = videoDir(api, args.projectId, id);
  await mkdir(join(dir, "media"), { recursive: true });
  const now = new Date().toISOString();
  const meta: VideoMeta = {
    id,
    title: board.title,
    kind: board.kind,
    ...(template ? { template } : {}),
    createdAt: now,
    updatedAt: now,
    renders: [],
  };
  await writeJson(join(dir, "storyboard.json"), board);
  await writeJson(join(dir, "settings.json"), settings);
  await writeJson(join(dir, "meta.json"), meta);
  api.emit("changed", { projectId: args.projectId, id });
  return get({ projectId: args.projectId, id }, api);
}

async function defaults(api: AddonHostApi): Promise<Partial<VideoSettings>> {
  const config =
    (await api.config<{ defaultAspect?: string; defaultVoice?: string }>().catch(() => undefined)) ?? {};
  return {
    ...(config.defaultAspect ? { aspect: config.defaultAspect as VideoSettings["aspect"] } : {}),
    ...(config.defaultVoice ? { voice: config.defaultVoice } : {}),
  };
}

export async function update(
  args: { projectId: string; id: string; storyboard?: Storyboard; settings?: Partial<VideoSettings> },
  api: AddonHostApi,
): Promise<VideoDetail> {
  return serial(async () => {
    const current = await readVideo(api, args.projectId, args.id);
    if (current.job?.state === "rendering") throw new Error("Wait for the render to finish, or cancel it");
    const dir = current.dir;
    if (args.storyboard) {
      const errors = validate(args.storyboard);
      if (errors.length) throw new Error(errors.join("; "));
      await writeJson(join(dir, "storyboard.json"), args.storyboard);
    }
    if (args.settings) {
      const settings = normalizeSettings({ ...current.settings, ...args.settings });
      if (!STYLE.test(settings.style)) settings.style = "neutral";
      await writeJson(join(dir, "settings.json"), settings);
    }
    const meta = (await readJson<VideoMeta>(join(dir, "meta.json"))) as VideoMeta;
    meta.updatedAt = new Date().toISOString();
    if (args.storyboard) meta.title = args.storyboard.title;
    await writeJson(join(dir, "meta.json"), meta);
    api.emit("changed", { projectId: args.projectId, id: args.id });
    return readVideo(api, args.projectId, args.id);
  });
}

export async function remove(args: { projectId: string; id: string }, api: AddonHostApi): Promise<void> {
  await cancel(args, api);
  await serial(() => rm(videoDir(api, args.projectId, args.id), { recursive: true, force: true }));
  api.emit("changed", { projectId: args.projectId, id: args.id });
}

/** Deletes one render (a version). */
export async function removeRender(
  args: { projectId: string; id: string; n: number },
  api: AddonHostApi,
): Promise<void> {
  await serial(async () => {
    const dir = videoDir(api, args.projectId, args.id);
    const meta = await readJson<VideoMeta>(join(dir, "meta.json"));
    if (!meta || !Number.isInteger(args.n)) return;
    meta.renders = meta.renders.filter((r) => r.n !== args.n);
    await rm(join(dir, "renders", String(args.n)), { recursive: true, force: true });
    await writeJson(join(dir, "meta.json"), meta);
  });
  api.emit("changed", { projectId: args.projectId, id: args.id });
}

/** Copies a picked image or clip into the video's `media/` and returns its relative path. */
export async function addMedia(
  args: { projectId: string; id: string; path: string; name?: string },
  api: AddonHostApi,
): Promise<string> {
  const dir = videoDir(api, args.projectId, args.id);
  const original = basename(args.name || args.path);
  const ext = extname(original).toLowerCase();
  if (!MEDIA_EXT.has(ext))
    throw new Error("Motion takes images (PNG, JPEG, WebP, GIF, SVG) and clips (MP4, WebM)");
  const stem =
    original
      .slice(0, original.length - ext.length)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "media";
  await mkdir(join(dir, "media"), { recursive: true });
  let name = `${stem}${ext}`;
  for (let i = 2; await exists(join(dir, "media", name)); i++) name = `${stem}-${i}${ext}`;
  await copyFile(args.path, join(dir, "media", name));
  return `media/${name}`;
}

/** Writes the live preview page (the composition plus the scrubber's runtime) and returns its path. */
let fontUrl: Promise<string> | undefined;
/** The bundled Inter as a `data:` URL (read once). */
function font(api: AddonHostApi): Promise<string> {
  fontUrl ??= readFile(join(api.addon.dir, FONT_FILE)).then(
    (b) => `data:font/woff2;base64,${b.toString("base64")}`,
  );
  return fontUrl;
}

export async function preview(args: { projectId: string; id: string }, api: AddonHostApi): Promise<string> {
  const video = await get(args, api);
  const html = compose({
    board: video.storyboard,
    settings: video.settings,
    style: await style(api, video.settings.style),
    preview: true,
    font: await font(api),
  });
  const path = join(video.dir, "preview.html");
  await writeFile(path, html, "utf8");
  return path;
}

// ── installs ─────────────────────────────────────────────────────────────────

let installing = false;

const rendererDir = (api: AddonHostApi) => join(api.addon.dataDir, "renderer");
const rendererBin = (api: AddonHostApi) =>
  join(rendererDir(api), "node_modules", "hyperframes", "bin", "hyperframes.mjs");
const ffmpegDir = (api: AddonHostApi) => join(api.addon.dataDir, "ffmpeg");

async function findFfmpeg(api: AddonHostApi): Promise<{ ffmpeg?: string; ffprobe?: string }> {
  const config = (await api.config<Config>().catch(() => undefined)) ?? {};
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const own = ffmpegDir(api);
  const find = async (tool: "ffmpeg" | "ffprobe") => {
    for (const c of [
      join(own, exe(tool, process.platform)),
      ...candidates(tool, config.ffmpegPath ?? "", pathEnv, process.platform),
    ])
      if (await exists(c)) return c;
    return undefined;
  };
  return { ffmpeg: await find("ffmpeg"), ffprobe: await find("ffprobe") };
}

async function rendererInstalled(api: AddonHostApi): Promise<boolean> {
  if (fake()) return exists(join(rendererDir(api), ".fake-installed"));
  const pkg = await readJson<{ version?: string }>(
    join(rendererDir(api), "node_modules", "hyperframes", "package.json"),
  );
  return pkg?.version === RENDERER.version && (await exists(join(rendererDir(api), ".jig-ready")));
}

export async function status(_args: unknown, api: AddonHostApi): Promise<MotionStatus> {
  const assets = ffmpegAssets(process.platform, process.arch);
  const ffmpegInfo = assets
    ? { licence: FFMPEG_LICENCE, mb: Math.round(assets.reduce((n, a) => n + a.bytes, 0) / 1_000_000), assets }
    : undefined;
  const base = {
    install: { renderer: RENDERER, ...(ffmpegInfo ? { ffmpeg: ffmpegInfo } : {}) },
    dataDir: api.addon.dataDir,
  };
  const renderer = await rendererInstalled(api);
  if (fake())
    return {
      fake: true,
      renderer,
      ffmpeg: "fake",
      node: RENDERER.node,
      missing: renderer ? [] : ["renderer"],
      ...base,
      ...(installing ? { busy: "installing" as const } : {}),
    };
  const { ffmpeg, ffprobe } = await findFfmpeg(api);
  const node = nodeMajor(
    (await api.exec("node", ["--version"], { timeoutMs: 10_000 }).catch(() => ({ stdout: "" }))).stdout,
  );
  const missing: MotionStatus["missing"] = [];
  if (!renderer) missing.push("renderer");
  if (!ffmpeg || !ffprobe) missing.push("ffmpeg");
  let blocked: string | undefined;
  if (node === undefined)
    blocked = `The renderer runs with Node.js ${RENDERER.node} or newer, and Node.js wasn't found. Install it from nodejs.org.`;
  else if (node < RENDERER.node)
    blocked = `The renderer needs Node.js ${RENDERER.node} or newer (this computer has ${node}).`;
  else if (missing.includes("ffmpeg") && !assets)
    blocked =
      "There's no FFmpeg download for this system: install FFmpeg and set its folder in Settings → Motion.";
  return {
    fake: false,
    ffmpeg,
    renderer,
    node,
    missing,
    ...(blocked ? { blocked } : {}),
    ...base,
    ...(installing ? { busy: "installing" as const } : {}),
  };
}

function say(api: AddonHostApi, text: string, progress?: number) {
  api.emit("install", { text, ...(progress !== undefined ? { progress } : {}) });
}

/** Installs what's missing (after the install modal). One at a time. */
export async function install(_args: unknown, api: AddonHostApi): Promise<MotionStatus> {
  if (installing) throw new Error("Motion is already installing");
  installing = true;
  try {
    const before = await status(undefined, api);
    if (before.blocked) throw new Error(before.blocked);
    if (fake()) {
      say(api, "Installing the renderer…", 0.5);
      await mkdir(rendererDir(api), { recursive: true });
      await writeFile(join(rendererDir(api), ".fake-installed"), "fake\n");
    } else {
      if (before.missing.includes("ffmpeg")) await installFfmpeg(api);
      if (before.missing.includes("renderer")) await installRenderer(api);
    }
    say(api, "Ready", 1);
  } finally {
    installing = false;
  }
  return status(undefined, api);
}

async function installFfmpeg(api: AddonHostApi): Promise<void> {
  const assets = ffmpegAssets(process.platform, process.arch);
  if (!assets) throw new Error("There's no FFmpeg download for this system");
  await mkdir(ffmpegDir(api), { recursive: true });
  for (const [i, asset] of assets.entries()) {
    say(
      api,
      `Downloading ${asset.tool} (${Math.round(asset.bytes / 1_000_000)} MB)…`,
      i / (assets.length + 2),
    );
    const response = await api.fetch(asset.url);
    if (!response.ok) throw new Error(`Downloading ${asset.tool} failed (${response.status})`);
    const gz = Buffer.from(await response.arrayBuffer());
    const sum = createHash("sha256").update(gz).digest("hex");
    if (sum !== asset.sha256)
      throw new Error(`${asset.tool}'s download doesn't match its pinned checksum; nothing was installed`);
    const target = join(ffmpegDir(api), exe(asset.tool, process.platform));
    await writeFile(`${target}.tmp`, gunzipSync(gz));
    await chmod(`${target}.tmp`, 0o755);
    await rename(`${target}.tmp`, target);
  }
}

const quietEnv = {
  HYPERFRAMES_NO_TELEMETRY: "1",
  DO_NOT_TRACK: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1",
  HYPERFRAMES_SKIP_SKILLS: "1",
};

async function installRenderer(api: AddonHostApi): Promise<void> {
  const dir = rendererDir(api);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "package.json"), {
    name: "jig-motion-renderer",
    private: true,
    dependencies: { [RENDERER.package]: RENDERER.version },
  });
  say(api, `Installing ${RENDERER.name} ${RENDERER.version}…`, 0.5);
  const npm = await api.exec("npm", ["install", "--no-audit", "--no-fund", "--omit=dev"], {
    cwd: dir,
    timeoutMs: 15 * 60_000,
    env: quietEnv,
  });
  if (npm.code !== 0)
    throw new Error(`npm couldn't install ${RENDERER.name}: ${npm.stderr.trim().slice(-400)}`);
  const lock = await readJson<{ packages?: Record<string, { version?: string; integrity?: string }> }>(
    join(dir, "package-lock.json"),
  );
  const got = lock?.packages?.[`node_modules/${RENDERER.package}`];
  if (got?.version !== RENDERER.version || got.integrity !== RENDERER.integrity) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`${RENDERER.name} didn't match its pinned version and checksum; it was removed`);
  }
  say(api, "Getting the headless browser it renders with…", 0.75);
  const browser = await api.exec("node", [rendererBin(api), "browser", "ensure"], {
    cwd: dir,
    timeoutMs: 15 * 60_000,
    env: quietEnv,
  });
  if (browser.code !== 0)
    throw new Error(
      `The renderer couldn't get its browser: ${(browser.stderr || browser.stdout).trim().slice(-400)}`,
    );
  await writeFile(join(dir, ".jig-ready"), `${RENDERER.version}\n`);
}

// ── renders ──────────────────────────────────────────────────────────────────

export interface RenderJob {
  dir: string;
  out: string;
  poster: string;
  html: string;
  settings: VideoSettings;
  seconds: number;
  onProgress: (p: number) => void;
}

/** Runs one render; resolves when the MP4 and the poster exist. `kill` stops it. */
export type Renderer = (job: RenderJob, api: AddonHostApi) => { done: Promise<void>; kill: () => void };

const fakeRenderer: Renderer = (job) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  const done = new Promise<void>((resolve, reject) => {
    stop = () => reject(new Error("Cancelled"));
    let step = 0;
    const tick = async () => {
      step++;
      job.onProgress(step / 5);
      if (step < 5) {
        // "[hold]" in the video keeps it rendering, so tests can see the progress and cancel.
        timer = setTimeout(tick, job.html.includes("[hold]") ? 600_000 : 250);
        return;
      }
      await writeFile(job.out, Buffer.from(TINY_MP4, "base64"));
      await writeFile(job.poster, Buffer.from(TINY_PNG, "base64"));
      resolve();
    };
    timer = setTimeout(tick, 100);
  });
  return {
    done,
    kill: () => {
      if (timer) clearTimeout(timer);
      stop?.();
    },
  };
};

const pathKey = () => Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";

const hyperframesRenderer: Renderer = (job, api) => {
  let child: ReturnType<AddonHostApi["spawn"]> | undefined;
  let killed = false;
  const done = (async () => {
    const { ffmpeg } = await findFfmpeg(api);
    if (!ffmpeg) throw new Error("FFmpeg wasn't found");
    const sep = process.platform === "win32" ? ";" : ":";
    const folder = ffmpeg.slice(0, ffmpeg.length - basename(ffmpeg).length).replace(/[\\/]$/, "");
    const env = { ...quietEnv, [pathKey()]: `${folder}${sep}${process.env[pathKey()] ?? ""}` };
    let tail = "";
    child = api.spawn(
      "node",
      [
        rendererBin(api),
        "render",
        "--output",
        job.out,
        "--fps",
        String(job.settings.fps),
        "--quality",
        "high",
      ],
      {
        cwd: job.dir,
        env,
        onOutput: (text) => {
          tail = (tail + text).slice(-2000);
          for (const line of text.split(/[\r\n]+/)) {
            const p = parseProgress(line);
            if (p !== undefined) job.onProgress(p);
          }
        },
      },
    );
    if (killed) child.kill();
    const { code } = await child.done;
    if (killed) throw new Error("Cancelled");
    if (code !== 0 || !(await exists(job.out)))
      throw new Error(`The renderer stopped: ${tail.trim().slice(-400)}`);
    const at = Math.min(1.5, job.seconds / 2).toFixed(2);
    const poster = await api.exec(
      ffmpeg,
      ["-v", "error", "-y", "-ss", at, "-i", job.out, "-frames:v", "1", job.poster],
      { timeoutMs: 60_000 },
    );
    if (poster.code !== 0) api.log("Poster failed", poster.stderr);
  })();
  return {
    done,
    kill: () => {
      killed = true;
      child?.kill();
    },
  };
};

let renderer: Renderer | undefined;
/** Tests swap the renderer. */
export function setRenderer(r: Renderer | undefined): void {
  renderer = r;
}

async function setJob(api: AddonHostApi, project: string, id: string, change: (m: VideoMeta) => void) {
  await serial(async () => {
    const file = join(videoDir(api, project, id), "meta.json");
    const meta = await readJson<VideoMeta>(file);
    if (!meta) return;
    change(meta);
    await writeJson(file, meta);
  });
}

/** Queues a render. With something missing it returns what to install instead (the install modal). */
export async function render(
  args: { projectId: string; id: string },
  api: AddonHostApi,
): Promise<{ queued: true } | { needs: MotionStatus }> {
  const video = await get(args, api);
  if (video.job) return { queued: true };
  if (!renderer) {
    const s = await status(undefined, api);
    if (s.missing.length || s.blocked) return { needs: s };
  }
  await setJob(api, args.projectId, args.id, (m) => {
    m.job = { state: "queued", at: new Date().toISOString(), progress: 0 };
    delete m.error;
  });
  queue.push({ project: args.projectId, id: args.id });
  api.emit("changed", { projectId: args.projectId, id: args.id });
  void pump(api);
  return { queued: true };
}

let pumping = false;
async function pump(api: AddonHostApi): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (let next = queue[0]; next; next = queue[0]) {
      await renderOne(api, next.project, next.id).catch((error) => api.log("Render failed", String(error)));
      queue.shift();
    }
  } finally {
    pumping = false;
  }
}

async function renderOne(api: AddonHostApi, project: string, id: string): Promise<void> {
  const video = await readVideo(api, project, id).catch(() => undefined);
  if (!video) return;
  const n = (video.renders.at(-1)?.n ?? 0) + 1;
  const out = join(video.dir, "renders", String(n));
  await mkdir(out, { recursive: true });
  const html = compose({
    board: video.storyboard,
    settings: video.settings,
    style: await style(api, video.settings.style),
    font: await font(api),
  });
  await writeFile(join(video.dir, "index.html"), html, "utf8");
  const run = (renderer ?? (fake() ? fakeRenderer : hyperframesRenderer))(
    {
      dir: video.dir,
      out: join(out, "video.mp4"),
      poster: join(out, "poster.png"),
      html,
      settings: video.settings,
      seconds: video.seconds,
      onProgress: (p) => {
        api.emit("progress", { projectId: project, id, progress: Math.max(0, Math.min(1, p)) });
      },
    },
    api,
  );
  running.set(key(project, id), run);
  if (cancelled.delete(key(project, id))) run.kill();
  await setJob(api, project, id, (m) => {
    m.job = { state: "rendering", at: new Date().toISOString(), progress: 0 };
  });
  api.emit("changed", { projectId: project, id });
  try {
    await run.done;
    const { size } = await stat(join(out, "video.mp4"));
    await setJob(api, project, id, (m) => {
      delete m.job;
      delete m.error;
      m.renders.push({
        n,
        at: new Date().toISOString(),
        seconds: video.seconds,
        bytes: size,
        ...dimensions(video.settings),
      });
    });
    api.notify({
      title: `${video.title} is rendered`,
      tone: "success",
      actions: [{ label: "Videos", view: "videos" }],
    });
  } catch (error) {
    await rm(out, { recursive: true, force: true });
    const stopped = error instanceof Error && error.message === "Cancelled";
    await setJob(api, project, id, (m) => {
      delete m.job;
      if (stopped) delete m.error;
      else m.error = error instanceof Error ? error.message : String(error);
    });
  } finally {
    running.delete(key(project, id));
    api.emit("changed", { projectId: project, id });
  }
}

export async function cancel(args: { projectId: string; id: string }, api: AddonHostApi): Promise<void> {
  const k = key(args.projectId, videoId(args.id));
  const i = queue.findIndex((q, index) => index > 0 && key(q.project, q.id) === k);
  if (i > 0) {
    queue.splice(i, 1);
    await setJob(api, args.projectId, args.id, (m) => {
      delete m.job;
    });
    api.emit("changed", { projectId: args.projectId, id: args.id });
    return;
  }
  const run = running.get(k);
  if (run) run.kill();
  else if (queue[0] && key(queue[0].project, queue[0].id) === k) cancelled.add(k);
}

/** The render's MP4, for Preview and Export. */
export async function renderPath(
  args: { projectId: string; id: string; n?: number },
  api: AddonHostApi,
): Promise<string | undefined> {
  const video = await get(args, api);
  const r = args.n ? video.renders.find((x) => x.n === args.n) : video.renders.at(-1);
  return r ? join(video.dir, "renders", String(r.n), "video.mp4") : undefined;
}
