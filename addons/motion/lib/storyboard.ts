/**
 * Motion's storyboard (D-453, D-463): a video is scenes plus the video's settings. Pure: types,
 * validation and timing, so the composition, the preview and the render agree on every second.
 */

export const KINDS = ["teaser", "whats-new", "walkthrough"] as const;
export type VideoKind = (typeof KINDS)[number];

export const SCENE_TYPES = ["title", "statement", "feature", "bullets", "capture", "outro"] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const ASPECTS = ["16:9", "1:1", "9:16", "4:5"] as const;
export type Aspect = (typeof ASPECTS)[number];
export const RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const MOTIONS = ["calm", "normal", "energetic"] as const;
export type MotionPace = (typeof MOTIONS)[number];

export interface SceneMedia {
  /** Relative to the video's folder, e.g. `media/screen-1.png`. */
  path: string;
  kind: "image" | "video";
}

/**
 * An overlay on a capture or screenshot (M2): a zoom into a region, a highlight around it, or an
 * arrow at a point. Positions are shares (0–1) of the media; `at` and `hold` are seconds into the
 * scene.
 */
export interface Mark {
  kind: "zoom" | "highlight" | "arrow";
  at: number;
  hold?: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label?: string;
}

export const MARK_KINDS = ["zoom", "highlight", "arrow"] as const;

export interface Scene {
  id: string;
  type: SceneType;
  title: string;
  text?: string;
  bullets?: string[];
  media?: SceneMedia;
  /** What the voice says over this scene (M2); also the captions. */
  voice?: string;
  /** The voice's measured length in seconds, once spoken (M2). */
  voiceSeconds?: number;
  /** The spoken voice, `media/voice-<scene>-<key>.wav`; stale once the text, voice or speed changes. */
  voiceFile?: string;
  /** Zooms, highlights and arrows over the media (M2), at most 8. */
  marks?: Mark[];
  /** A fixed length in seconds; otherwise it follows the reading time and the voice. */
  duration?: number;
}

export interface Storyboard {
  version: 1;
  kind: VideoKind;
  title: string;
  /** BCP 47, e.g. `en`, `es`. */
  language: string;
  scenes: Scene[];
}

export interface VideoSettings {
  aspect: Aspect;
  resolution: Resolution;
  fps: 30 | 60;
  /** A style's id (`styles/<id>.json`); product kits and DESIGN.md styles come in M3. */
  style: string;
  motion: MotionPace;
  /** `wordSeconds`: seconds on screen per word, at least (readable without sound). */
  type: { headline: "medium" | "large" | "huge"; wordSeconds: number };
  captions: {
    on: boolean;
    position: "bottom" | "top";
    size: "small" | "medium" | "large";
    background: boolean;
  };
  /** A natural voice's id (M2); "" = no voice. */
  voice: string;
  /** The voice's speed, 0.7–1.3. */
  voiceSpeed: number;
  /**
   * `track`: a copy in the video's `media/` (`media/music-….mp3`), "" = none; `volume` 0–1; `source`:
   * where it came from (a library page), kept with the track for its licence (D-456).
   */
  music: { track: string; volume: number; source: string };
  brand: { logo: "always" | "end" | "never"; endText: string; link: string };
}

export const DEFAULT_SETTINGS: VideoSettings = {
  aspect: "16:9",
  resolution: "1080p",
  fps: 30,
  style: "neutral",
  motion: "normal",
  type: { headline: "large", wordSeconds: 0.3 },
  captions: { on: true, position: "bottom", size: "medium", background: true },
  voice: "",
  voiceSpeed: 1,
  music: { track: "", volume: 0.6, source: "" },
  brand: { logo: "end", endText: "", link: "" },
};

export const LIMITS = {
  scenes: 40,
  title: 120,
  text: 600,
  voice: 1000,
  bullets: 6,
  marks: 8,
  sceneSeconds: 60,
  videoSeconds: 600,
};

/** The voice starts this long after its scene, and the scene holds this long after it ends. */
export const VOICE_LEAD = 0.3;
export const VOICE_TAIL = 0.6;

/** About how long the natural voice takes for a text (2.6 words a second), before it is spoken. */
export function estimateVoiceSeconds(text: string, speed = 1): number {
  const n = text.split(/\s+/).filter(Boolean).length;
  return n ? Math.max(0.8, Math.round(((n * 0.38) / speed) * 100) / 100) : 0;
}

/** A scene's voice length: measured once spoken, else estimated from its script. */
export function voiceLength(scene: Scene): number {
  if (!scene.voice?.trim()) return 0;
  return scene.voiceSeconds && scene.voiceSeconds > 0
    ? scene.voiceSeconds
    : estimateVoiceSeconds(scene.voice);
}

/** 8 hex characters (FNV-1a), stable across processes: names a spoken voice file. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Where a scene's voice goes for this voice and speed; a `voiceFile` that differs is stale. */
export function voicePath(
  scene: Pick<Scene, "id" | "voice">,
  s: Pick<VideoSettings, "voice" | "voiceSpeed">,
): string {
  return `media/voice-${scene.id}-${shortHash(`${s.voice}|${s.voiceSpeed}|${scene.voice ?? ""}`)}.wav`;
}

/** The scene's voice file when it is spoken and current for these settings, else undefined. */
export function freshVoice(scene: Scene, s: Pick<VideoSettings, "voice" | "voiceSpeed">): string | undefined {
  return s.voice && scene.voice?.trim() && scene.voiceFile === voicePath(scene, s)
    ? scene.voiceFile
    : undefined;
}

/** Pixel size of the frame: 1080p is 1080 on the short side. */
export function dimensions(s: Pick<VideoSettings, "aspect" | "resolution">): {
  width: number;
  height: number;
} {
  const short = s.resolution === "720p" ? 720 : s.resolution === "4k" ? 2160 : 1080;
  const [w, h] = s.aspect.split(":").map(Number) as [number, number];
  const even = (n: number) => Math.round(n / 2) * 2;
  return w >= h
    ? { width: even((short * w) / h), height: short }
    : { width: short, height: even((short * h) / w) };
}

/** How long a scene's entrance takes at each pace, in seconds. */
export const ENTRANCE: Record<MotionPace, number> = { calm: 1, normal: 0.7, energetic: 0.45 };

function words(scene: Scene): number {
  const text = [scene.title, scene.text ?? "", ...(scene.bullets ?? [])].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** Long enough to read without sound: the entrance, some time per word, a beat to hold. */
export function readingSeconds(scene: Scene, s: Pick<VideoSettings, "motion" | "type">): number {
  const base = ENTRANCE[s.motion] + words(scene) * s.type.wordSeconds + 1;
  const media = scene.media ? (scene.type === "capture" ? 4 : 1.5) : 0;
  return Math.max(2.5, base + media);
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/** A scene's length: fixed if set, else the longer of reading time and the voice plus a pause. */
export function sceneSeconds(scene: Scene, s: Pick<VideoSettings, "motion" | "type">): number {
  if (scene.duration && scene.duration > 0) return tenth(scene.duration);
  const length = voiceLength(scene);
  const voice = length ? VOICE_LEAD + length + VOICE_TAIL : 0;
  return tenth(Math.max(readingSeconds(scene, s), voice));
}

export interface Slot {
  scene: Scene;
  index: number;
  start: number;
  duration: number;
}

/** Every scene's start and length, back to back. */
export function timeline(
  board: Pick<Storyboard, "scenes">,
  s: Pick<VideoSettings, "motion" | "type">,
): { slots: Slot[]; total: number } {
  let at = 0;
  const slots = board.scenes.map((scene, index) => {
    const duration = sceneSeconds(scene, s);
    const slot = { scene, index, start: tenth(at), duration };
    at += duration;
    return slot;
  });
  return { slots, total: tenth(at) };
}

/** `0:48`, `1:05`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A relative path inside the video's folder: no absolute paths, no `..`, no backslashes. */
export function isSafeMediaPath(path: string): boolean {
  if (!path || path.length > 200) return false;
  if (/^[a-zA-Z]:|^[/\\]|\\/.test(path)) return false;
  return path.split("/").every((p) => p !== ".." && p !== "." && p !== "");
}

/** Problems with a storyboard, as sentences; empty when it is fine. */
export function validate(
  board: unknown,
  s: Pick<VideoSettings, "motion" | "type"> = DEFAULT_SETTINGS,
): string[] {
  const errors: string[] = [];
  if (!board || typeof board !== "object") return ["The storyboard isn't an object"];
  const b = board as Partial<Storyboard>;
  if (!KINDS.includes(b.kind as VideoKind)) errors.push(`Kind must be one of ${KINDS.join(", ")}`);
  if (typeof b.title !== "string" || !b.title.trim()) errors.push("The video needs a title");
  else if (b.title.length > LIMITS.title) errors.push(`The title is longer than ${LIMITS.title} characters`);
  if (!Array.isArray(b.scenes) || !b.scenes.length) return [...errors, "The video needs at least one scene"];
  if (b.scenes.length > LIMITS.scenes) errors.push(`At most ${LIMITS.scenes} scenes`);
  const ids = new Set<string>();
  b.scenes.forEach((scene, i) => {
    const n = `Scene ${i + 1}`;
    if (!scene || typeof scene !== "object") {
      errors.push(`${n} isn't an object`);
      return;
    }
    if (typeof scene.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(scene.id))
      errors.push(`${n} needs an id (a-z, 0-9, -)`);
    else if (ids.has(scene.id)) errors.push(`${n}'s id "${scene.id}" is used twice`);
    else ids.add(scene.id);
    if (!SCENE_TYPES.includes(scene.type))
      errors.push(`${n}'s type must be one of ${SCENE_TYPES.join(", ")}`);
    if (typeof scene.title !== "string") errors.push(`${n} needs a title (it may be empty)`);
    else if (scene.title.length > LIMITS.title)
      errors.push(`${n}'s title is longer than ${LIMITS.title} characters`);
    if (scene.text !== undefined && (typeof scene.text !== "string" || scene.text.length > LIMITS.text))
      errors.push(`${n}'s text must be at most ${LIMITS.text} characters`);
    if (
      scene.bullets !== undefined &&
      (!Array.isArray(scene.bullets) ||
        scene.bullets.length > LIMITS.bullets ||
        scene.bullets.some((x) => typeof x !== "string"))
    )
      errors.push(`${n}'s bullets must be at most ${LIMITS.bullets} lines`);
    if (scene.media !== undefined) {
      if (!scene.media || !isSafeMediaPath(scene.media.path))
        errors.push(`${n}'s media must be a file in the video's folder (e.g. media/screen.png)`);
      else if (scene.media.kind !== "image" && scene.media.kind !== "video")
        errors.push(`${n}'s media kind must be image or video`);
    }
    if (scene.voice !== undefined && (typeof scene.voice !== "string" || scene.voice.length > LIMITS.voice))
      errors.push(`${n}'s voice script must be at most ${LIMITS.voice} characters`);
    if (scene.voiceFile !== undefined && !isSafeMediaPath(scene.voiceFile))
      errors.push(`${n}'s voice file must be in the video's folder`);
    if (scene.marks !== undefined) {
      const share = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
      if (!Array.isArray(scene.marks) || scene.marks.length > LIMITS.marks)
        errors.push(`${n} has at most ${LIMITS.marks} zooms, highlights and arrows`);
      else
        scene.marks.forEach((m, j) => {
          if (
            !m ||
            !MARK_KINDS.includes(m.kind) ||
            typeof m.at !== "number" ||
            m.at < 0 ||
            m.at > LIMITS.sceneSeconds ||
            !share(m.x) ||
            !share(m.y) ||
            (m.w !== undefined && !share(m.w)) ||
            (m.h !== undefined && !share(m.h)) ||
            (m.hold !== undefined && (typeof m.hold !== "number" || m.hold < 0.3 || m.hold > 20)) ||
            (m.label !== undefined && (typeof m.label !== "string" || m.label.length > 80))
          )
            errors.push(`${n}'s mark ${j + 1} needs a kind, a time and a place (shares 0–1)`);
        });
    }
    if (
      scene.duration !== undefined &&
      (typeof scene.duration !== "number" || scene.duration < 1 || scene.duration > LIMITS.sceneSeconds)
    )
      errors.push(`${n}'s duration must be 1–${LIMITS.sceneSeconds} seconds`);
  });
  if (!errors.length && timeline(b as Storyboard, s).total > LIMITS.videoSeconds)
    errors.push(`The video is longer than ${LIMITS.videoSeconds / 60} minutes`);
  return errors;
}

/** A scene id not used yet, from its title. */
export function sceneId(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "scene";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Settings from anything stored: missing or wrong fields fall back to the defaults. */
export function normalizeSettings(input: unknown): VideoSettings {
  const v = (input && typeof input === "object" ? input : {}) as Partial<VideoSettings>;
  const d = DEFAULT_SETTINGS;
  const pick = <T>(value: unknown, list: readonly T[], fallback: T): T =>
    list.includes(value as T) ? (value as T) : fallback;
  const num = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && value >= min && value <= max ? value : fallback;
  return {
    aspect: pick(v.aspect, ASPECTS, d.aspect),
    resolution: pick(v.resolution, RESOLUTIONS, d.resolution),
    fps: v.fps === 60 ? 60 : 30,
    style: typeof v.style === "string" && /^[a-z0-9-]{1,40}$/.test(v.style) ? v.style : d.style,
    motion: pick(v.motion, MOTIONS, d.motion),
    type: {
      headline: pick(v.type?.headline, ["medium", "large", "huge"] as const, d.type.headline),
      wordSeconds: num(v.type?.wordSeconds, 0.1, 1, d.type.wordSeconds),
    },
    captions: {
      on: typeof v.captions?.on === "boolean" ? v.captions.on : d.captions.on,
      position: v.captions?.position === "top" ? "top" : "bottom",
      size: pick(v.captions?.size, ["small", "medium", "large"] as const, d.captions.size),
      background: typeof v.captions?.background === "boolean" ? v.captions.background : d.captions.background,
    },
    voice: typeof v.voice === "string" && /^[a-z0-9_]{0,40}$/.test(v.voice) ? v.voice : d.voice,
    voiceSpeed: Math.round(num(v.voiceSpeed, 0.7, 1.3, d.voiceSpeed) * 100) / 100,
    music: {
      track:
        typeof v.music?.track === "string" && (v.music.track === "" || isSafeMediaPath(v.music.track))
          ? v.music.track
          : "",
      volume: num(v.music?.volume, 0, 1, d.music.volume),
      source: typeof v.music?.source === "string" ? v.music.source.slice(0, 300) : "",
    },
    brand: {
      logo: pick(v.brand?.logo, ["always", "end", "never"] as const, d.brand.logo),
      endText: typeof v.brand?.endText === "string" ? v.brand.endText.slice(0, 120) : "",
      link: typeof v.brand?.link === "string" ? v.brand.link.slice(0, 200) : "",
    },
  };
}
