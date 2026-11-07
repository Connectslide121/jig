import { baseCss, captionCss, captionsHtml, type MotionStyle, page, soundHtml } from "./compose";
import {
  dimensions,
  isSafeMediaPath,
  LIMITS,
  type Slot,
  type Storyboard,
  timeline,
  type VideoSettings,
} from "./storyboard";

/**
 * Free compositions (D-474): a chat writes a video's own picture, CSS and HTML clips with any layout
 * and any motion, instead of Motion's scene layouts. The storyboard's scenes stay the narration
 * beats: a clip with `data-scene="<id>"` places that scene's voice and captions, so the voice, the
 * captions, the music, the preview and the render work as for any video. The chat's markup is
 * checked here before it is kept: no scripts, no frames, no handlers, nothing from the network, media
 * only from the video's folder. Pure.
 */

export interface Composition {
  /** The stylesheet: keyframes, layout. Uses the style's variables (--bg, --fg, --accent, --font-headline…). */
  css: string;
  /** What goes inside the frame: the clips, each with `data-start`, `data-duration`, `data-track-index`. */
  html: string;
  /** The video's length; default where the last clip ends. */
  seconds?: number;
}

export interface CompositionTiming {
  total: number;
  clips: number;
  /** Each linked scene's span: from its first clip's start to its last clip's end. */
  scenes: Record<string, { start: number; duration: number }>;
}

/** HTML and CSS together, in characters: media belongs in files, not in `data:` URLs this large. */
export const COMPOSITION_CHARS = 400_000;

const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "link",
  "base",
  "meta",
  "style",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "audio",
  "html",
  "head",
  "body",
  "title",
  "template",
  "portal",
  "noscript",
];
const URL_ATTRS = new Set(["src", "href", "xlink:href", "poster"]);
const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
const SCENE_ID = /^[\w-]{1,40}$/;

interface Tag {
  name: string;
  attrs: Map<string, string>;
  quoted: Set<string>;
}

function tags(html: string): Tag[] {
  const out: Tag[] = [];
  for (const m of html.matchAll(TAG)) {
    const attrs = new Map<string, string>();
    const quoted = new Set<string>();
    for (const a of (m[2] ?? "").matchAll(ATTR)) {
      const name = (a[1] ?? "").toLowerCase();
      if (!name) continue;
      attrs.set(name, decode(a[2] ?? a[3] ?? a[4] ?? ""));
      if (a[2] !== undefined || a[3] !== undefined) quoted.add(name);
    }
    out.push({ name: (m[1] ?? "").toLowerCase(), attrs, quoted });
  }
  return out;
}

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&(colon|tab|newline);/gi, (_, n: string) =>
      n.toLowerCase() === "colon" ? ":" : n.toLowerCase() === "tab" ? "\t" : "\n",
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** A reference the page may load: a `data:` image, video or font, an `#anchor`, or a relative path in the video's folder. */
export function refProblem(raw: string): string | undefined {
  // Browsers drop whitespace and control characters inside a URL's scheme ("java\tscript:").
  const value = [...raw].filter((ch) => ch.charCodeAt(0) > 32).join("");
  if (!value || value.startsWith("#")) return undefined;
  if (/^data:/i.test(value))
    return /^data:(image\/(png|jpe?g|webp|gif|svg\+xml)|video\/(mp4|webm)|font\/(woff2?|ttf|otf))[;,]/i.test(
      value,
    )
      ? undefined
      : `"${raw.slice(0, 40)}": only data: images, videos and fonts`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//"))
    return `"${raw.slice(0, 60)}": nothing from the network or other places; put the file in the video (media/…)`;
  const path = value.split(/[?#]/)[0] ?? "";
  return isSafeMediaPath(path)
    ? undefined
    : `"${raw.slice(0, 60)}": a path inside the video's folder, like media/shot.png`;
}

function cssRefs(css: string): string[] {
  return [...css.matchAll(CSS_URL)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

/** Problems with a chat's composition, as sentences the chat can act on; empty when it can be kept. */
export function checkComposition(
  c: Composition,
  settings: Pick<VideoSettings, "aspect" | "resolution">,
): string[] {
  const errors: string[] = [];
  if (typeof c.css !== "string" || typeof c.html !== "string") return ["css and html must be text"];
  if (!c.html.trim()) return ["html is empty: it holds the clips"];
  if (c.css.length + c.html.length > COMPOSITION_CHARS)
    errors.push(
      `The composition is ${c.css.length + c.html.length} characters; at most ${COMPOSITION_CHARS}: put images in files (media/…) instead of data: URLs`,
    );
  const bad = new RegExp(`<\\s*\\/?\\s*(${FORBIDDEN_TAGS.join("|")})\\b`, "i").exec(c.html);
  if (bad)
    errors.push(
      `<${bad[1]?.toLowerCase()}> isn't allowed: no scripts, frames, forms, <style> (use css), <audio> (voice and music come from the video's settings) or document tags (Motion writes the page)`,
    );
  // CSS
  if (/<\//.test(c.css) || /<!--/.test(c.css)) errors.push("css can't contain </ or <!--");
  if (/@import\b/i.test(c.css)) errors.push("css can't @import: write everything in it");
  if (/expression\s*\(|-moz-binding|behavior\s*:|javascript:/i.test(c.css))
    errors.push("css can't use expression(), -moz-binding, behavior or javascript:");
  if (/\b(?:https?|ftp|file):\/\//i.test(c.css)) errors.push("css can't load from the network");
  for (const ref of cssRefs(c.css)) {
    const p = refProblem(ref);
    if (p) errors.push(`css url(${p})`);
  }
  // HTML
  for (const tag of tags(c.html)) {
    for (const [name, value] of tag.attrs) {
      if (/^on/.test(name)) errors.push(`<${tag.name} ${name}>: no event handlers, motion is CSS only`);
      else if (name === "id" && value === "root") errors.push(`id="root" is Motion's frame; use another id`);
      else if (name === "srcset") errors.push(`<${tag.name} srcset>: use src`);
      else if (URL_ATTRS.has(name)) {
        if (!tag.quoted.has(name)) errors.push(`<${tag.name} ${name}=…>: quote the value`);
        const p = refProblem(value);
        if (p) errors.push(`<${tag.name} ${name}=${p}>`);
      } else if (name === "style") {
        for (const ref of cssRefs(value)) {
          const p = refProblem(ref);
          if (p) errors.push(`<${tag.name} style> url(${p})`);
        }
        if (/expression\s*\(|javascript:|@import/i.test(value))
          errors.push(`<${tag.name} style>: no expression(), javascript: or @import`);
      } else if (!/^xmlns/.test(name) && /(?:javascript|vbscript):/i.test(value))
        errors.push(`<${tag.name} ${name}>: no javascript:`);
    }
  }
  const timing = readTiming(c);
  errors.push(...timing.errors);
  if (!timing.clips)
    errors.push(
      'No clips: each part of the picture is an element with class="clip" data-start data-duration data-track-index',
    );
  if (timing.total > LIMITS.videoSeconds)
    errors.push(`The video is ${timing.total} s; at most ${LIMITS.videoSeconds} s`);
  if (c.seconds !== undefined && !(Number.isFinite(c.seconds) && c.seconds > 0))
    errors.push("seconds must be a number above 0");
  void dimensions(settings);
  return [...new Set(errors)].slice(0, 20);
}

const ms = (n: number) => Math.round(n * 1000) / 1000;

function readTiming(c: Composition): CompositionTiming & { errors: string[] } {
  const errors: string[] = [];
  const scenes: CompositionTiming["scenes"] = {};
  let clips = 0;
  let end = 0;
  for (const tag of tags(c.html)) {
    if (!tag.attrs.has("data-start")) {
      if (tag.attrs.has("data-scene"))
        errors.push(`<${tag.name} data-scene> needs data-start and data-duration`);
      continue;
    }
    const start = Number(tag.attrs.get("data-start"));
    const duration = Number(tag.attrs.get("data-duration"));
    const label = `<${tag.name} data-start="${tag.attrs.get("data-start")}">`;
    if (!Number.isFinite(start) || start < 0) {
      errors.push(`${label}: data-start is seconds from the video's start, 0 or more`);
      continue;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`${label}: needs data-duration, its seconds on screen`);
      continue;
    }
    if (tag.name === "video") {
      if (!tag.attrs.has("muted"))
        errors.push(`${label}: a <video> is muted (sound comes from the voice and music)`);
    } else {
      clips++;
      if (!(tag.attrs.get("class") ?? "").split(/\s+/).includes("clip"))
        errors.push(`${label}: a timed element has class="clip"`);
      if (!/^\d+$/.test(tag.attrs.get("data-track-index") ?? ""))
        errors.push(`${label}: needs data-track-index (0, 1, 2…; clips on one track don't overlap)`);
    }
    end = Math.max(end, start + duration);
    const scene = tag.attrs.get("data-scene");
    if (scene !== undefined) {
      if (!SCENE_ID.test(scene)) errors.push(`${label}: data-scene is a scene id like s1`);
      else {
        const was = scenes[scene];
        const from = was ? Math.min(was.start, start) : start;
        const to = was ? Math.max(was.start + was.duration, start + duration) : start + duration;
        scenes[scene] = { start: ms(from), duration: ms(to - from) };
      }
    }
  }
  const total = ms(c.seconds && c.seconds > 0 ? c.seconds : end);
  return { total, clips, scenes, errors };
}

/** When each clip and linked scene plays, and the video's length. */
export function compositionTiming(c: Composition): CompositionTiming {
  const { errors: _e, ...timing } = readTiming(c);
  return timing;
}

/**
 * The scenes' places in the video: a free composition's linked clips, else the scene layouts back
 * to back. A scene no clip links to has no place (its voice and captions aren't used).
 */
export function videoTimeline(
  board: Pick<Storyboard, "scenes">,
  settings: Pick<VideoSettings, "motion" | "type">,
  composition?: Composition,
): { slots: Slot[]; total: number } {
  if (!composition) return timeline(board, settings);
  const timing = compositionTiming(composition);
  const slots: Slot[] = [];
  board.scenes.forEach((scene, index) => {
    const span = timing.scenes[scene.id];
    if (span) slots.push({ scene, index, start: span.start, duration: span.duration });
  });
  return { slots, total: timing.total };
}

/** Scenes that say something but no clip links to: their voice and captions would be lost. */
export function unlinkedScenes(board: Pick<Storyboard, "scenes">, c: Composition): string[] {
  const linked = compositionTiming(c).scenes;
  return board.scenes.filter((s) => s.voice?.trim() && !linked[s.id]).map((s) => s.id);
}

/** Every relative file the composition loads (media to copy into the video, or already there). */
export function compositionRefs(c: Composition): string[] {
  const out = new Set<string>();
  const add = (ref: string) => {
    const v = ref.trim();
    if (v && !v.startsWith("#") && !/^data:/i.test(v) && !refProblem(v)) out.add(v.split(/[?#]/)[0] ?? v);
  };
  for (const ref of cssRefs(c.css)) add(ref);
  for (const tag of tags(c.html))
    for (const [name, value] of tag.attrs) {
      if (URL_ATTRS.has(name)) add(value);
      else if (name === "style") for (const ref of cssRefs(value)) add(ref);
    }
  return [...out];
}

/** The composition with its relative files renamed (`map`: as written → in the video). */
export function renameRefs(c: Composition, map: Record<string, string>): Composition {
  const swap = (v: string) => {
    const path = v.trim().split(/[?#]/)[0] ?? "";
    return map[path] ? v.trim().replace(path, map[path]) : v;
  };
  const inCss = (css: string) =>
    css.replace(CSS_URL, (whole, a?: string, b?: string, d?: string) => {
      const v = a ?? b ?? d ?? "";
      const to = swap(v);
      return to === v ? whole : `url("${to}")`;
    });
  const html = c.html
    .replace(
      /(\s(?:src|href|xlink:href|poster)\s*=\s*)("([^"]*)"|'([^']*)')/gi,
      (whole, lead: string, _q, a?: string, b?: string) => {
        const v = a ?? b ?? "";
        const to = swap(v);
        return to === v ? whole : `${lead}"${to}"`;
      },
    )
    .replace(/(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/gi, (whole, lead: string, _q, a?: string, b?: string) => {
      const v = a ?? b ?? "";
      const to = inCss(v.replace(/&quot;/g, "'"));
      return to === v ? whole : `${lead}"${to.replace(/"/g, "'")}"`;
    });
  return { ...c, css: inCss(c.css), html };
}

/** A free composition's page: the style's variables and Inter, the chat's CSS and clips, then captions (and the preview's sound and runtime). */
export function composeCustom(input: {
  board: Storyboard;
  settings: VideoSettings;
  style: MotionStyle;
  composition: Composition;
  preview?: boolean;
  font?: string;
}): string {
  const { board, settings, composition } = input;
  const { width, height } = dimensions(settings);
  const { slots, total } = videoTimeline(board, settings, composition);
  return page({
    language: board.language,
    title: board.title,
    settings,
    total,
    css: `${baseCss(input, width, height)}
.clip{position:absolute;inset:0}
${captionCss(settings, width, height)}
/* the composition */
${composition.css}`,
    body: [composition.html, captionsHtml(board, settings, slots)].join("\n"),
    ...(input.preview ? { sound: soundHtml(settings, slots), preview: true } : {}),
  });
}
