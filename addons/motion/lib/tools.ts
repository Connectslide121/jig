/**
 * What Motion's chat tools take (M3, D-465): scenes as a chat writes them, turned into a storyboard's
 * scenes. Pure. A chat gives each scene's words and, for a capture or screenshot, a file; it never
 * writes ids, voice files or lengths (Motion keeps those), so `update` merges by scene id and keeps
 * what the chat didn't touch.
 */
import {
  KINDS,
  LIMITS,
  type Mark,
  SCENE_TYPES,
  type Scene,
  type SceneType,
  type VideoKind,
} from "./storyboard";

/** A scene as the tools take it; `media` is a file path (the chat's folder, or absolute). */
export interface ToolScene {
  id?: string;
  type?: string;
  title?: string;
  text?: string;
  bullets?: string[];
  voice?: string;
  duration?: number;
  media?: string;
  marks?: Mark[];
}

const clip = (v: unknown, n: number): string | undefined =>
  typeof v === "string" ? v.trim().slice(0, n) : undefined;

export function toolKind(v: unknown): VideoKind | undefined {
  return KINDS.includes(v as VideoKind) ? (v as VideoKind) : undefined;
}

/** The fields a chat may set on a scene, cleaned; `undefined` fields are left as they were. */
function fields(input: ToolScene): Partial<Scene> {
  const out: Partial<Scene> = {};
  if (SCENE_TYPES.includes(input.type as SceneType)) out.type = input.type as SceneType;
  const title = clip(input.title, LIMITS.title);
  if (title !== undefined) out.title = title;
  const text = clip(input.text, LIMITS.text);
  if (text !== undefined) out.text = text;
  if (Array.isArray(input.bullets))
    out.bullets = input.bullets
      .filter((b): b is string => typeof b === "string" && !!b.trim())
      .slice(0, LIMITS.bullets)
      .map((b) => b.trim().slice(0, 160));
  const voice = clip(input.voice, LIMITS.voice);
  if (voice !== undefined) out.voice = voice;
  if (typeof input.duration === "number" && input.duration > 0)
    out.duration = Math.min(LIMITS.sceneSeconds, Math.round(input.duration * 10) / 10);
  if (Array.isArray(input.marks)) out.marks = input.marks.slice(0, LIMITS.marks);
  return out;
}

function freshId(taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const id = `s${i}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/**
 * The scenes a chat wrote, in its order. A scene with the id of an existing one starts from it (its
 * media, marks and spoken voice stay unless the chat changed them); others are new. Empty voice text
 * removes the voice; a changed text drops the spoken file (Motion speaks it again).
 */
export function scenesFromTool(input: unknown, existing: Scene[] = []): Scene[] {
  if (!Array.isArray(input)) throw new Error("`scenes` must be a list of scenes");
  if (!input.length) throw new Error("The video needs at least one scene");
  if (input.length > LIMITS.scenes) throw new Error(`At most ${LIMITS.scenes} scenes`);
  const taken = new Set<string>();
  const byId = new Map(existing.map((s) => [s.id, s]));
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`Scene ${i + 1} isn't an object`);
    const t = raw as ToolScene;
    const before = typeof t.id === "string" && !taken.has(t.id) ? byId.get(t.id) : undefined;
    const id = before ? before.id : freshId(new Set([...taken, ...byId.keys()]));
    taken.add(id);
    const f = fields(t);
    const scene: Scene = {
      ...(before ?? { id, type: "statement", title: "" }),
      ...f,
      id,
    } as Scene;
    if (before && f.voice !== undefined && f.voice !== before.voice) {
      delete scene.voiceFile;
      delete scene.voiceSeconds;
    }
    if (scene.voice === "") delete scene.voice;
    if (!scene.bullets?.length) delete scene.bullets;
    if (!scene.text) delete scene.text;
    if (scene.type !== "bullets" && f.type && before?.type === "bullets" && !t.bullets) delete scene.bullets;
    return scene;
  });
}

/** What a tool says about a video in one line (for `list`). */
export function videoLine(v: {
  id: string;
  title: string;
  kind: string;
  seconds: number;
  status: string;
  aspect: string;
  renders: Array<{ n: number }>;
  updatedAt: string;
}): string {
  const render = v.renders.at(-1);
  return `- ${v.id}: "${v.title}", ${v.kind}, ${Math.round(v.seconds)} s, ${v.aspect}, ${v.status}${
    render ? ` (render ${render.n})` : ""
  }, updated ${v.updatedAt.slice(0, 16).replace("T", " ")}`;
}
