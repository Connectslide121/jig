import {
  isSafeMediaPath,
  KINDS,
  type Scene,
  type SceneType,
  type Storyboard,
  sceneId,
  type VideoKind,
} from "./storyboard";

/**
 * Templates are data (`templates/<id>/template.json`): scene patterns with `{{placeholders}}` filled
 * from the template's inputs, and `repeat` for a list (one scene per item). Pure.
 */

export interface TemplateScene {
  type: SceneType;
  title?: string;
  text?: string;
  /** A placeholder for a list of strings, e.g. `{{fixes}}`. */
  bullets?: string;
  /** A placeholder for a file in the video's folder, e.g. `{{item.image}}`. */
  media?: string;
  /** One scene per item of this list input. */
  repeat?: string;
}

export interface TemplateInput {
  label: string;
  type: "string" | "list";
  required?: boolean;
  item?: unknown;
}

export interface Template {
  id: string;
  name: string;
  kind: VideoKind;
  description: string;
  licence: string;
  sceneTypes: SceneType[];
  durations: { min: number; max: number };
  inputs: Record<string, TemplateInput>;
  scenes: TemplateScene[];
  sample?: Record<string, unknown>;
}

type Values = Record<string, unknown>;

function lookup(values: Values, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Values)[k] : undefined), values);
}

/** `{{a}}` and `{{item.b}}` replaced by their values (missing = empty), spaces tidied. */
export function fill(pattern: string | undefined, values: Values): string {
  if (!pattern) return "";
  return pattern
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const v = lookup(values, key);
      return typeof v === "string" || typeof v === "number" ? String(v) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

const VIDEO = /\.(mp4|webm|mov)$/i;

/** A storyboard from a template and its inputs. Scenes left with no words are dropped. */
export function fromTemplate(template: Template, inputs: Values, language = "en"): Storyboard {
  const scenes: Scene[] = [];
  const ids: string[] = [];
  const add = (pattern: TemplateScene, values: Values) => {
    const title = fill(pattern.title, values);
    const text = fill(pattern.text, values);
    const bulletsKey = pattern.bullets?.match(/^\{\{\s*([\w.]+)\s*\}\}$/)?.[1];
    const list = bulletsKey ? lookup(values, bulletsKey) : undefined;
    const bullets = Array.isArray(list)
      ? list.filter((b): b is string => typeof b === "string" && !!b.trim()).slice(0, 6)
      : [];
    const path = fill(pattern.media, values);
    if (!title && !text && !bullets.length && !path) return;
    if (pattern.type === "bullets" && !bullets.length) return;
    const id = sceneId(title || pattern.type, ids);
    ids.push(id);
    scenes.push({
      id,
      type: pattern.type,
      title,
      ...(text && text !== title ? { text } : {}),
      ...(bullets.length ? { bullets } : {}),
      ...(path && isSafeMediaPath(path)
        ? { media: { path, kind: VIDEO.test(path) ? "video" : "image" } }
        : {}),
    });
  };
  for (const pattern of template.scenes) {
    if (pattern.repeat) {
      const items = lookup(inputs, pattern.repeat);
      if (Array.isArray(items)) for (const item of items) add(pattern, { ...inputs, item });
    } else add(pattern, inputs);
  }
  const product = typeof inputs.product === "string" ? inputs.product : "";
  const version = typeof inputs.version === "string" ? inputs.version : "";
  return {
    version: 1,
    kind: template.kind,
    title: [product, version].filter(Boolean).join(" ") || template.name,
    language,
    scenes,
  };
}

/** A template file's content checked enough to use: problems as sentences. */
export function checkTemplate(t: unknown): string[] {
  const errors: string[] = [];
  const x = t as Partial<Template>;
  if (!x || typeof x !== "object") return ["Not an object"];
  if (typeof x.id !== "string" || !/^[a-z0-9-]+$/.test(x.id)) errors.push("id");
  if (!KINDS.includes(x.kind as VideoKind)) errors.push("kind");
  if (typeof x.licence !== "string" || !x.licence) errors.push("licence");
  if (!Array.isArray(x.scenes) || !x.scenes.length) errors.push("scenes");
  else
    for (const s of x.scenes)
      if (!x.sceneTypes?.includes(s.type)) errors.push(`scene type ${s.type} not in sceneTypes`);
  return errors;
}
