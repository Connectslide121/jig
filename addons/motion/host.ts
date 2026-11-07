import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { AddonCaptureStep, AddonHostApi } from "@jig/sdk";
import { mixArgs, musicFile } from "./lib/audio";
import { cues, srt, vtt } from "./lib/captions";
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
import { type Finding, parseNames, scan } from "./lib/realdata";
import {
  dimensions,
  freshVoice,
  KINDS,
  normalizeSettings,
  type Storyboard,
  timeline,
  type VideoKind,
  type VideoSettings,
  VOICE_LEAD,
  validate,
  voicePath,
} from "./lib/storyboard";
import {
  finishStyle,
  fontStack,
  styleFromDesignMd,
  styleFromTheme,
  styleFromTokens,
} from "./lib/styleSources";
import { checkTemplate, fromTemplate, type Template } from "./lib/templates";
import { scenesFromTool, type ToolScene, toolKind, videoLine } from "./lib/tools";

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
  /** What the video is for, in the user's or the chat's words (M3): Write with Jig starts from it. */
  brief?: string;
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
  musicFolder?: string;
}

const MUSIC_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"]);

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

export type StyleSource = "motion" | "own" | "kit" | "design" | "theme";
export type StyleEntry = MotionStyle & { id: string; source: StyleSource };

const THEMES_DIR = ["skills", "theme-factory", "skills", "theme-factory", "themes"];

/** The active project's product kit tokens (`<repo>/.jig/factory/kit/tokens.json`), if it has one. */
async function kitStyle(api: AddonHostApi, project: string | undefined): Promise<StyleEntry | undefined> {
  if (!project) return undefined;
  const p = (
    await Promise.resolve()
      .then(() => api.projects())
      .catch(() => [])
  ).find((x) => x.id === project);
  const repo = p?.focusRepo ?? p?.path;
  if (!repo) return undefined;
  const tokens = await readJson<unknown>(join(repo, ".jig", "factory", "kit", "tokens.json"));
  return tokens
    ? { ...styleFromTokens(tokens, "kit", `${p?.name ?? "Product"} kit`), source: "kit" }
    : undefined;
}

/**
 * `DESIGN.md` references (D-444) from Settings → Jig factory, through the factory's `designSources`
 * export: local files and folders only (a folder's DESIGN.md files, two levels down); repository
 * addresses are for chats to read (D-465).
 */
async function designStyles(api: AddonHostApi): Promise<StyleEntry[]> {
  const sources = await Promise.resolve()
    .then(() => api.addons.call<string[]>("factory", "designSources"))
    .catch(() => [] as string[]);
  const files: string[] = [];
  const walk = async (dir: string, depth: number) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (files.length >= 60) return;
      if (e.isFile() && /^design\.md$/i.test(e.name)) files.push(join(dir, e.name));
      else if (e.isDirectory() && depth > 0 && !e.name.startsWith(".") && e.name !== "node_modules")
        await walk(join(dir, e.name), depth - 1);
    }
  };
  for (const src of Array.isArray(sources) ? sources : []) {
    if (typeof src !== "string" || !src.trim() || /^[a-z]+:\/\//i.test(src) || /^github\.com\//i.test(src))
      continue;
    const st = await stat(src).catch(() => undefined);
    if (st?.isFile()) files.push(src);
    else if (st?.isDirectory()) await walk(src, 2);
  }
  const out: StyleEntry[] = [];
  for (const file of files) {
    const md = await readFile(file, "utf8").catch(() => "");
    const folder = basename(join(file, ".."));
    const id = `design-${slug(folder)}`;
    if (md && !out.some((x) => x.id === id))
      out.push({ ...styleFromDesignMd(md, id, folder), source: "design" });
  }
  return out;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "x";

/**
 * Every look a video can take (M3, D-465): Motion's own, styles saved from a chat (`own-…`), the
 * project's product kit (`kit`), DESIGN.md references (`design-…`) and theme-factory themes
 * (`theme-…`, from Jig's bundled skills).
 */
export async function styles(
  args: { projectId?: string } | undefined,
  api: AddonHostApi,
): Promise<StyleEntry[]> {
  const out: StyleEntry[] = [];
  const readDir = async (dir: string, source: StyleSource) => {
    for (const file of (await readdir(dir).catch(() => [])).sort()) {
      if (!file.endsWith(".json")) continue;
      const s = await readJson<MotionStyle>(join(dir, file));
      if (s?.colors) out.push({ ...s, id: basename(file, ".json"), source });
    }
  };
  await readDir(join(api.addon.dir, "styles"), "motion");
  const kit = await kitStyle(api, args?.projectId);
  if (kit) out.push(kit);
  await readDir(join(api.addon.dataDir, "styles"), "own");
  out.push(...(await designStyles(api)));
  const themes = join(api.addon.dir, "..", "..", ...THEMES_DIR);
  for (const file of (await readdir(themes).catch(() => [])).sort()) {
    if (!file.endsWith(".md")) continue;
    const md = await readFile(join(themes, file), "utf8").catch(() => "");
    if (md) out.push({ ...styleFromTheme(md, `theme-${basename(file, ".md")}`), source: "theme" });
  }
  return out;
}

async function style(api: AddonHostApi, id: string, project?: string): Promise<MotionStyle> {
  const list = await styles({ projectId: project }, api);
  const found = list.find((s) => s.id === id) ?? list.find((s) => s.id === "neutral") ?? list[0];
  if (!found) throw new Error("Motion's styles are missing");
  return found;
}

/** Keeps a look a chat described (`create`/`update`'s `style` object) as `own-<hash>`. */
async function saveOwnStyle(api: AddonHostApi, input: Record<string, unknown>): Promise<string> {
  const colors = (input.colors ?? {}) as Record<string, unknown>;
  const swatches = Object.entries(colors)
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .map(([label, hex]) => ({ label, hex }));
  const fonts = (input.fonts ?? {}) as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name : "Own style";
  const radius = Number(input.radius);
  const made = finishStyle("own", name, swatches, {
    fonts: {
      headline: fontStack(typeof fonts.headline === "string" ? fonts.headline : undefined),
      body: fontStack(typeof fonts.body === "string" ? fonts.body : undefined),
    },
    ...(Number.isFinite(radius) ? { radius: Math.max(0, Math.min(60, radius)) } : {}),
  });
  const hash = createHash("sha256").update(JSON.stringify(made)).digest("hex").slice(0, 8);
  const id = `own-${hash}`;
  const dir = join(api.addon.dataDir, "styles");
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, `${id}.json`), { ...made, id });
  return id;
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
  brief?: string;
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
    ...(args.brief?.trim() ? { brief: args.brief.trim().slice(0, 4000) } : {}),
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
  args: {
    projectId: string;
    id: string;
    storyboard?: Storyboard;
    settings?: Partial<VideoSettings>;
    brief?: string;
  },
  api: AddonHostApi,
): Promise<VideoDetail> {
  return serial(async () => {
    const current = await readVideo(api, args.projectId, args.id);
    if (current.job?.state === "rendering") throw new Error("Wait for the render to finish, or cancel it");
    const dir = current.dir;
    let settings = current.settings;
    if (args.settings) {
      settings = normalizeSettings({ ...current.settings, ...args.settings });
      if (!STYLE.test(settings.style)) settings.style = "neutral";
    }
    const board = args.storyboard ?? current.storyboard;
    if (args.storyboard) {
      const errors = validate(args.storyboard);
      if (errors.length) throw new Error(errors.join("; "));
    }
    // A voice whose text, voice or speed changed is stale: its length no longer times the scene.
    let stale = false;
    const scenes = board.scenes.map((scene) => {
      if (!scene.voiceFile && scene.voiceSeconds === undefined) return scene;
      if (settings.voice && scene.voiceFile === voicePath(scene, settings)) return scene;
      stale = true;
      const { voiceFile: _f, voiceSeconds: _s, ...rest } = scene;
      return rest;
    });
    if (args.storyboard || stale) await writeJson(join(dir, "storyboard.json"), { ...board, scenes });
    if (args.settings) await writeJson(join(dir, "settings.json"), settings);
    const meta = (await readJson<VideoMeta>(join(dir, "meta.json"))) as VideoMeta;
    meta.updatedAt = new Date().toISOString();
    if (args.storyboard) meta.title = args.storyboard.title;
    if (typeof args.brief === "string") {
      if (args.brief.trim()) meta.brief = args.brief.trim().slice(0, 4000);
      else delete meta.brief;
    }
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
    style: await style(api, video.settings.style, video.projectId),
    preview: true,
    font: await font(api),
  });
  const path = join(video.dir, "preview.html");
  await writeFile(path, html, "utf8");
  return path;
}

// ── voice, music, captures ───────────────────────────────────────────────────

const speaking = new Map<string, Promise<VideoDetail>>();

/**
 * Speaks every scene's voice script that isn't spoken yet for the video's voice and speed (D-464:
 * `api.speech.say`), into `media/voice-<scene>-<key>.wav`, and keeps each length, which times the
 * scene. Old voice files nobody uses are removed. Runs before every render too.
 */
export function speak(args: { projectId: string; id: string }, api: AddonHostApi): Promise<VideoDetail> {
  const k = key(projectId(args.projectId), videoId(args.id));
  const busy = speaking.get(k);
  if (busy) return busy;
  const work = speakNow(args, api).finally(() => speaking.delete(k));
  speaking.set(k, work);
  return work;
}

async function speakNow(args: { projectId: string; id: string }, api: AddonHostApi): Promise<VideoDetail> {
  const video = await get(args, api);
  const s = video.settings;
  if (!s.voice) return video;
  const todo = video.storyboard.scenes.filter((sc) => sc.voice?.trim() && !freshVoice(sc, s));
  const spoken = new Map<string, { file: string; seconds: number }>();
  for (const [i, scene] of todo.entries()) {
    api.emit("speaking", { projectId: args.projectId, id: args.id, done: i, total: todo.length });
    const file = voicePath(scene, s);
    const out = await api.speech.say({ text: scene.voice ?? "", voice: s.voice, speed: s.voiceSpeed });
    await mkdir(join(video.dir, "media"), { recursive: true });
    await copyFile(out.path, join(video.dir, file));
    spoken.set(scene.id, { file, seconds: Math.round(out.seconds * 100) / 100 });
  }
  api.emit("speaking", { projectId: args.projectId, id: args.id, done: todo.length, total: todo.length });
  return serial(async () => {
    const now = await readVideo(api, args.projectId, args.id);
    const scenes = now.storyboard.scenes.map((scene) => {
      const got = spoken.get(scene.id);
      return got && voicePath(scene, now.settings) === got.file
        ? { ...scene, voiceFile: got.file, voiceSeconds: got.seconds }
        : scene;
    });
    await writeJson(join(now.dir, "storyboard.json"), { ...now.storyboard, scenes });
    const used = new Set(scenes.map((x) => x.voiceFile).filter(Boolean));
    for (const name of await readdir(join(now.dir, "media")).catch(() => [] as string[]))
      if (/^voice-.+\.wav$/.test(name) && !used.has(`media/${name}`))
        await rm(join(now.dir, "media", name), { force: true });
    if (spoken.size) api.emit("changed", { projectId: args.projectId, id: args.id });
    return readVideo(api, args.projectId, args.id);
  });
}

export interface Track {
  name: string;
  path: string;
  bytes: number;
}

/** The audio files in `motion.musicFolder` (D-456), by name; `folder` is "" when it isn't set. */
export async function tracks(
  _args: unknown,
  api: AddonHostApi,
): Promise<{ folder: string; tracks: Track[] }> {
  const folder = (await api.config<Config>().catch(() => undefined))?.musicFolder ?? "";
  if (!folder) return { folder, tracks: [] };
  const out: Track[] = [];
  for (const name of await readdir(folder).catch(() => [] as string[])) {
    if (!MUSIC_EXT.has(extname(name).toLowerCase())) continue;
    const info = await stat(join(folder, name)).catch(() => undefined);
    if (info?.isFile()) out.push({ name, path: join(folder, name), bytes: info.size });
  }
  return { folder, tracks: out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500) };
}

/** Copies a track into the video's `media/` and makes it the music; `path` "" takes it out. */
export async function setMusic(
  args: { projectId: string; id: string; path: string; source?: string },
  api: AddonHostApi,
): Promise<VideoDetail> {
  const video = await get(args, api);
  if (!args.path)
    return update(
      {
        projectId: args.projectId,
        id: args.id,
        settings: { music: { ...video.settings.music, track: "", source: "" } },
      },
      api,
    );
  const ext = extname(args.path).toLowerCase();
  if (!MUSIC_EXT.has(ext)) throw new Error("Music is an MP3, M4A, AAC, WAV, OGG or FLAC file");
  const name = musicFile(args.path).slice("media/".length);
  await mkdir(join(video.dir, "media"), { recursive: true });
  await copyFile(args.path, join(video.dir, "media", name));
  const old = video.settings.music.track;
  if (old && old !== `media/${name}` && /^media\/music-/.test(old))
    await rm(join(video.dir, old), { force: true });
  return update(
    {
      projectId: args.projectId,
      id: args.id,
      settings: {
        music: {
          ...video.settings.music,
          track: `media/${name}`,
          source: typeof args.source === "string" ? args.source.slice(0, 300) : video.settings.music.source,
        },
      },
    },
    api,
  );
}

export interface Take {
  /** `media/capture-N.mp4`, kept until you keep or discard it. */
  path: string;
  seconds: number;
  cut: boolean;
  events: Array<{
    step: number;
    do: string;
    at: number;
    box?: { x: number; y: number; w: number; h: number };
  }>;
  findings: Finding[];
}

/** The size a capture records at: the video's shape, at most 1080 on the short side. */
function captureSize(s: VideoSettings): { width: number; height: number } {
  const { width, height } = dimensions({
    aspect: s.aspect,
    resolution: s.resolution === "720p" ? "720p" : "1080p",
  });
  return { width, height };
}

/** The names in the project's `.jig/factory/kit/real-names.txt`, if it has one. */
async function realNames(api: AddonHostApi, project: string): Promise<string[]> {
  const p = (
    await Promise.resolve()
      .then(() => api.projects())
      .catch(() => [])
  ).find((x) => x.id === project);
  if (!p) return [];
  const text = await readFile(join(p.path, ".jig", "factory", "kit", "real-names.txt"), "utf8").catch(
    () => "",
  );
  return parseNames(text);
}

/**
 * Records a capture (D-457, D-464: `api.capture.record`) at the video's shape, encodes its frames
 * into `media/capture-N.mp4` with FFmpeg and scans its text for real data. The take is a file in
 * the video's media until you keep it (a scene) or discard it. Without FFmpeg it returns what to
 * install. With `JIG_ENGINE=fake` the recording is real, the encoding writes a tiny MP4.
 */
export async function record(
  args: { projectId: string; id: string; url: string; steps: AddonCaptureStep[]; maxSeconds?: number },
  api: AddonHostApi,
): Promise<Take | { needs: MotionStatus }> {
  const video = await get(args, api);
  const { ffmpeg } = await findFfmpeg(api);
  if (!fake() && !ffmpeg) {
    const s = await status(undefined, api);
    return { needs: s };
  }
  const size = captureSize(video.settings);
  const shot = await api.capture.record({
    url: args.url,
    steps: args.steps,
    ...size,
    maxSeconds: Math.min(120, Math.max(3, args.maxSeconds ?? 60)),
    fps: video.settings.fps === 60 ? 60 : 30,
  });
  try {
    await mkdir(join(video.dir, "media"), { recursive: true });
    let n = 1;
    while (await exists(join(video.dir, "media", `capture-${n}.mp4`))) n++;
    const path = `media/capture-${n}.mp4`;
    if (fake() || !ffmpeg) await writeFile(join(video.dir, path), Buffer.from(TINY_MP4, "base64"));
    else {
      const out = await api.exec(
        ffmpeg,
        [
          "-nostdin",
          "-v",
          "error",
          "-y",
          "-framerate",
          String(shot.fps),
          "-i",
          join(shot.dir, "%06d.jpg"),
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-crf",
          "18",
          "-movflags",
          "+faststart",
          join(video.dir, path),
        ],
        { timeoutMs: 300_000 },
      );
      if (out.code !== 0)
        throw new Error(`FFmpeg couldn't encode the capture: ${out.stderr.trim().slice(-300)}`);
    }
    return {
      path,
      seconds: Math.round(shot.seconds * 10) / 10,
      cut: shot.cut,
      events: shot.events,
      findings: scan(shot.texts, await realNames(api, args.projectId)),
    };
  } finally {
    await rm(shot.dir, { recursive: true, force: true });
  }
}

/** Throws away a take (or any media file) the storyboard doesn't use. */
export async function discardMedia(
  args: { projectId: string; id: string; path: string },
  api: AddonHostApi,
): Promise<void> {
  const video = await get(args, api);
  if (!/^media\/[\w.-]+$/.test(args.path)) throw new Error("Not a media file");
  if (video.storyboard.scenes.some((s) => s.media?.path === args.path)) return;
  await rm(join(video.dir, args.path), { force: true });
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
  let video = await readVideo(api, project, id).catch(() => undefined);
  if (!video) return;
  if (video.settings.voice) {
    try {
      video = await speak({ projectId: project, id }, api);
    } catch (error) {
      await setJob(api, project, id, (m) => {
        delete m.job;
        m.error = `The voice couldn't be spoken: ${error instanceof Error ? error.message : String(error)}`;
      });
      api.emit("changed", { projectId: project, id });
      return;
    }
  }
  const n = (video.renders.at(-1)?.n ?? 0) + 1;
  const out = join(video.dir, "renders", String(n));
  await mkdir(out, { recursive: true });
  const html = compose({
    board: video.storyboard,
    settings: video.settings,
    style: await style(api, video.settings.style, video.projectId),
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
    const list = cues(video.storyboard, video.settings);
    if (list.length) {
      await writeFile(join(out, "captions.srt"), srt(list), "utf8");
      await writeFile(join(out, "captions.vtt"), vtt(list), "utf8");
    }
    if (!renderer && !fake()) await mixSound(api, video, join(out, "video.mp4"));
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

/** Lays the voices and the music under the rendered picture (lib/audio.ts), in place. */
async function mixSound(api: AddonHostApi, video: VideoDetail, file: string): Promise<void> {
  const s = video.settings;
  const voices = timeline(video.storyboard, s).slots.flatMap(({ scene, start }) => {
    const f = freshVoice(scene, s);
    return f ? [{ path: join(video.dir, f), at: start + VOICE_LEAD }] : [];
  });
  const music =
    s.music.track && (await exists(join(video.dir, s.music.track)))
      ? { path: join(video.dir, s.music.track), volume: s.music.volume }
      : undefined;
  const tmp = `${file.slice(0, -4)}.mixed.mp4`;
  const args = mixArgs({ video: file, out: tmp, seconds: video.seconds, voices, music });
  if (!args) return;
  const { ffmpeg } = await findFfmpeg(api);
  if (!ffmpeg) throw new Error("FFmpeg wasn't found");
  const res = await api.exec(ffmpeg, args, { timeoutMs: 600_000 });
  if (res.code !== 0 || !(await exists(tmp))) {
    await rm(tmp, { force: true });
    throw new Error(`The sound couldn't be mixed: ${res.stderr.trim().slice(-300)}`);
  }
  await rename(tmp, file);
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

// ── chat tools (M3, D-465) ───────────────────────────────────────────────────

interface ToolChat {
  chat?: { projectId?: string; cwd?: string };
}

interface ToolVideoArgs extends ToolChat {
  kind?: string;
  title?: string;
  brief?: string;
  language?: string;
  scenes?: ToolScene[];
  template?: string;
  style?: string;
  ownStyle?: Record<string, unknown>;
  settings?: Partial<VideoSettings>;
}

const SCENE_HELP =
  "Each scene: { id? (keep it to change that scene), type: title | statement | feature | bullets | capture | outro, title, text?, bullets? (≤ 6), voice? (what the voice says, also the captions), duration? (seconds), media? (an image or clip file for feature and capture scenes) }";

function toolProject(args: ToolChat): string {
  const id = args.chat?.projectId;
  if (!id)
    throw new Error("This chat has no project: Motion keeps videos per project. Open the chat in a project.");
  return projectId(id);
}

/** The style a tool named or described: an id from `addon_motion_list`'s styles, or `{ name, colors, fonts, radius }`. */
async function toolStyle(
  api: AddonHostApi,
  project: string,
  input: string | Record<string, unknown> | undefined,
): Promise<string | undefined> {
  if (input === undefined || input === "") return undefined;
  if (typeof input === "object" && input) return saveOwnStyle(api, input);
  const all = await styles({ projectId: project }, api);
  if (!all.some((s) => s.id === input))
    throw new Error(`No style "${String(input)}". Styles: ${all.map((s) => s.id).join(", ")}`);
  return input;
}

/** Copies each scene's `media` file into the video and points the scene at it. */
async function toolMedia(
  api: AddonHostApi,
  project: string,
  id: string,
  input: ToolScene[],
  scenes: Storyboard["scenes"],
  cwd: string | undefined,
): Promise<Storyboard["scenes"]> {
  const out = [...scenes];
  for (let i = 0; i < input.length; i++) {
    const file = input[i]?.media;
    const scene = out[i];
    if (!file || !scene) continue;
    const path = isAbsolute(file) ? file : resolve(cwd ?? "", file);
    if (!(await stat(path).catch(() => undefined))?.isFile())
      throw new Error(`Scene ${i + 1}: no file ${file}`);
    const rel = await addMedia({ projectId: project, id, path }, api);
    const ext = extname(rel).toLowerCase();
    out[i] = {
      ...scene,
      media: { path: rel, kind: [".mp4", ".webm", ".mov"].includes(ext) ? "video" : "image" },
    };
  }
  return out;
}

function toolResult(v: VideoDetail, message: string): string {
  return JSON.stringify({
    video: v.id,
    projectId: v.projectId,
    title: v.title,
    kind: v.kind,
    seconds: Math.round(v.seconds),
    scenes: v.storyboard.scenes.map((s) => s.id),
    status: v.status,
    message,
  });
}

/** `addon_motion_create`: a new video from a chat's scenes, or from a kind's template. */
export async function toolCreate(args: ToolVideoArgs, api: AddonHostApi): Promise<string> {
  const project = toolProject(args);
  const kind = toolKind(args.kind) ?? "teaser";
  const style = await toolStyle(api, project, args.ownStyle ?? args.style);
  const scenes = args.scenes ? scenesFromTool(args.scenes) : undefined;
  const board: Storyboard | undefined = scenes
    ? {
        version: 1,
        kind,
        title: args.title?.trim().slice(0, 120) || "Untitled video",
        language: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(args.language ?? "")
          ? (args.language as string)
          : "en",
        scenes: scenes.map(({ media: _m, ...s }) => s),
      }
    : undefined;
  let video = await create(
    {
      projectId: project,
      kind,
      ...(args.template ? { template: args.template } : {}),
      ...(board ? { storyboard: board } : {}),
      ...(args.title ? { title: args.title } : {}),
      ...(args.brief ? { brief: args.brief } : {}),
      settings: { ...(args.settings ?? {}), ...(style ? { style } : {}) },
    },
    api,
  );
  if (board && args.scenes?.some((s) => s.media)) {
    try {
      const withMedia = await toolMedia(
        api,
        project,
        video.id,
        args.scenes,
        video.storyboard.scenes,
        args.chat?.cwd,
      );
      video = await update(
        { projectId: project, id: video.id, storyboard: { ...video.storyboard, scenes: withMedia } },
        api,
      );
    } catch (e) {
      await remove({ projectId: project, id: video.id }, api);
      throw e;
    }
  }
  return toolResult(
    video,
    `Made the video "${video.title}" (${Math.round(video.seconds)} s, draft) in Motion. The user sees it in the card in this chat and opens it to preview; render it with addon_motion_render when they want the MP4.`,
  );
}

/** `addon_motion_update`: new scenes (merged by id), title, brief, settings or style. */
export async function toolUpdate(args: ToolVideoArgs & { id: string }, api: AddonHostApi): Promise<string> {
  const project = toolProject(args);
  const current = await get({ projectId: project, id: args.id }, api);
  const style = await toolStyle(api, project, args.ownStyle ?? args.style);
  let storyboard: Storyboard | undefined;
  if (args.scenes || args.title || args.language || args.kind) {
    let scenes = args.scenes
      ? scenesFromTool(args.scenes, current.storyboard.scenes)
      : current.storyboard.scenes;
    if (args.scenes) scenes = await toolMedia(api, project, current.id, args.scenes, scenes, args.chat?.cwd);
    storyboard = {
      ...current.storyboard,
      ...(args.title?.trim() ? { title: args.title.trim().slice(0, 120) } : {}),
      ...(toolKind(args.kind) ? { kind: toolKind(args.kind) as VideoKind } : {}),
      ...(args.language && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(args.language)
        ? { language: args.language }
        : {}),
      scenes,
    };
  }
  const settings =
    args.settings || style ? { ...(args.settings ?? {}), ...(style ? { style } : {}) } : undefined;
  const video = await update(
    {
      projectId: project,
      id: current.id,
      ...(storyboard ? { storyboard } : {}),
      ...(settings ? { settings } : {}),
      ...(typeof args.brief === "string" ? { brief: args.brief } : {}),
    },
    api,
  );
  return toolResult(video, `Updated "${video.title}" (${Math.round(video.seconds)} s).`);
}

/** `addon_motion_render`: queues the MP4 (Motion's own renderer on this computer, no AI). */
export async function toolRender(args: ToolChat & { id: string }, api: AddonHostApi): Promise<string> {
  const project = toolProject(args);
  const result = await render({ projectId: project, id: args.id }, api);
  const video = await get({ projectId: project, id: args.id }, api);
  if ("needs" in result)
    return toolResult(
      video,
      "Motion's renderer isn't installed yet: ask the user to open the video from the card and press Render, which offers the install. Nothing was rendered.",
    );
  return toolResult(
    video,
    `Rendering "${video.title}" on this computer (no AI, no cost); the card in this chat shows its progress and the MP4 when it's done.`,
  );
}

/** `addon_motion_list`: the project's videos and styles; with `id`, one video's storyboard and settings. */
export async function toolList(args: ToolChat & { id?: string }, api: AddonHostApi): Promise<string> {
  const project = toolProject(args);
  if (args.id) {
    const v = await get({ projectId: project, id: args.id }, api);
    const { music: _m, ...settings } = v.settings;
    return [
      videoLine(v),
      v.brief ? `Brief: ${v.brief}` : "Brief: (none)",
      `Settings: ${JSON.stringify(settings)}`,
      `Storyboard (${SCENE_HELP}):`,
      JSON.stringify(
        {
          title: v.storyboard.title,
          kind: v.storyboard.kind,
          language: v.storyboard.language,
          scenes: v.storyboard.scenes.map(({ voiceFile: _f, voiceSeconds: _s, ...s }) => s),
        },
        null,
        1,
      ),
    ].join("\n");
  }
  const videos = await list({ projectId: project }, api);
  const all = await styles({ projectId: project }, api);
  return [
    videos.length
      ? "Videos, newest first:"
      : "No videos in this project yet. Make one with addon_motion_create.",
    ...videos.map(videoLine),
    "",
    `Styles (id: name, source): ${all.map((s) => `${s.id}: ${s.name}, ${s.source}`).join("; ")}`,
  ].join("\n");
}

/**
 * Shared with other add-ons (D-215, D-458): Jig factory's teaser makes its video here. Takes the
 * tool's shape with `projectId` (media as absolute paths) and returns the video; `render` and `get`
 * are shared as they are.
 */
export async function createVideo(
  args: Omit<ToolVideoArgs, "chat"> & { projectId: string },
  api: AddonHostApi,
): Promise<VideoDetail> {
  const { projectId: project, ...rest } = args;
  const made = JSON.parse(await toolCreate({ ...rest, chat: { projectId: project } }, api)) as {
    video: string;
  };
  return get({ projectId: project, id: made.video }, api);
}
