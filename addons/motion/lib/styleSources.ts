/**
 * Where a video's look can come from besides Motion's own styles (M3, D-465): a product kit's DTCG
 * tokens (`.jig/factory/kit/tokens.json`), a `DESIGN.md` reference (D-444) or a `theme-factory`
 * theme. Pure: each source is read into named colours, and `finishStyle` turns those into a full
 * `MotionStyle` that always reads well (text against its background, a visible accent).
 */
import type { MotionStyle } from "./compose";

export interface Swatch {
  /** Where it came from: a token's path, a palette line's label and description. */
  label: string;
  hex: string;
}

type Role = keyof MotionStyle["colors"];

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i;
const INTER = '"Inter Variable", sans-serif';

/** `#abc` → `#aabbcc`, lower case; undefined for anything else. */
export function normalizeHex(value: string): string | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m?.[1]) return undefined;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, 0–1. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

function saturation(hex: string): number {
  const c = rgb(hex).map((v) => v / 255);
  const max = Math.max(...c);
  const min = Math.min(...c);
  return max === 0 ? 0 : (max - min) / max;
}

/** `a` moved `t` of the way to `b`. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x
    .map((v, i) => Math.round(v + ((y[i] as number) - v) * t))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

const ROLE_WORDS: Array<[Role, RegExp]> = [
  ["bg", /\b(background|canvas|bg|page)\b/i],
  ["surface", /\b(surface|card|panel|elevated|container)\b/i],
  ["muted", /\b(muted|subtle|secondary text|tertiary|caption|placeholder)\b/i],
  ["fg", /\b(text|foreground|fg|ink|heading|body)\b/i],
  ["accent", /\b(accent|primary|brand|highlight|cta|action|link)\b/i],
];

function roleOf(label: string): Role | undefined {
  return ROLE_WORDS.find(([, re]) => re.test(label))?.[0];
}

/**
 * A full style from named colours: the background is the first one named like one (else the first),
 * the text the one that stands out most against it, the accent one named like one (else the most
 * saturated). Missing roles are mixed from those; text that doesn't read falls back to black or white.
 */
export function finishStyle(
  id: string,
  name: string,
  swatches: Swatch[],
  extra: Partial<Pick<MotionStyle, "fonts" | "radius" | "headlineWeight">> = {},
): MotionStyle {
  const all = swatches
    .map((s) => ({ ...s, hex: normalizeHex(s.hex) as string, role: roleOf(s.label) }))
    .filter((s) => s.hex);
  const named = (role: Role) => all.find((s) => s.role === role)?.hex;
  const bg = named("bg") ?? all[0]?.hex ?? "#0e1015"; // jig-tokens-ignore-line: a video's colours, not Jig's UI
  const others = all.filter((s) => s.hex !== bg);
  let fg = named("fg");
  if (!fg || contrast(fg, bg) < 4.5)
    fg = [...others].sort((a, b) => contrast(b.hex, bg) - contrast(a.hex, bg))[0]?.hex;
  if (!fg || contrast(fg, bg) < 4.5) fg = luminance(bg) > 0.4 ? "#111111" : "#ffffff"; // jig-tokens-ignore-line: a video's colours, not Jig's UI
  const candidates = others.filter((s) => s.hex !== fg && contrast(s.hex, bg) >= 1.4);
  const accent =
    candidates.find((s) => s.role === "accent")?.hex ??
    [...candidates].sort((a, b) => saturation(b.hex) - saturation(a.hex))[0]?.hex ??
    mix(fg, bg, 0.25);
  const surface = named("surface") ?? mix(bg, fg, 0.07);
  const muted = (() => {
    const m = named("muted");
    return m && contrast(m, bg) >= 3 ? m : mix(fg, bg, 0.35);
  })();
  const onAccent = contrast("#ffffff", accent) >= contrast("#111111", accent) ? "#ffffff" : "#111111"; // jig-tokens-ignore-line: a video's colours, not Jig's UI
  return {
    id,
    name: name.trim().slice(0, 60) || id,
    colors: { bg, surface, fg, muted, accent, onAccent },
    fonts: extra.fonts ?? { headline: INTER, body: INTER },
    radius: extra.radius ?? 18,
    headlineWeight: extra.headlineWeight ?? 700,
    eyebrowCase: "upper",
  };
}

/** A font family as CSS, falling back to Inter (the one font every render has). */
export function fontStack(family: string | undefined): string {
  const f = family
    ?.replace(/\b(bold|regular|medium|semibold|light|italic)\b/gi, "")
    .replace(/["'`]/g, "")
    .split(",")[0]
    ?.trim();
  return f && /^[\w .-]{2,40}$/.test(f) && !/^inter( variable)?$/i.test(f) ? `"${f}", ${INTER}` : INTER;
}

/** A `theme-factory` theme (`# Name`, `- **Name**: \`#hex\` - what it's for`, Headers / Body Text). */
export function styleFromTheme(md: string, id: string): MotionStyle {
  const name = /^#\s+(.+)$/m.exec(md)?.[1] ?? id;
  const swatches: Swatch[] = [];
  for (const line of md.split("\n")) {
    const m = /^\s*[-*]\s+\*\*(.+?)\*\*:\s*`?(#[0-9a-f]{3,6})`?\s*[-–—]?\s*(.*)$/i.exec(line);
    if (m) swatches.push({ label: `${m[3]} ${m[1]}`, hex: m[2] as string });
  }
  const font = (re: RegExp) => re.exec(md)?.[1];
  const headline = font(/\*\*Headers?\*\*:\s*(.+)$/im);
  return finishStyle(id, name, swatches, {
    fonts: { headline: fontStack(headline), body: fontStack(font(/\*\*Body(?: Text)?\*\*:\s*(.+)$/im)) },
    headlineWeight: /bold/i.test(headline ?? "") ? 700 : 600,
  });
}

/**
 * A `DESIGN.md` (Google Stitch's format, as in the awesome-design-md libraries): every line with a
 * hex colour is a swatch labelled by its words; the first font family named is the headline's.
 * Only its mood and colours are borrowed, never a logo or a name (D-444).
 */
export function styleFromDesignMd(md: string, id: string, fallbackName: string): MotionStyle {
  const title = /^#\s+(.+)$/m
    .exec(md)?.[1]
    ?.replace(/design(\.md| system)?/gi, "")
    .replace(/[—–:-]+\s*$/, "");
  const swatches: Swatch[] = [];
  for (const line of md.split("\n")) {
    const hex = HEX.exec(line)?.[0];
    if (hex) swatches.push({ label: line.replace(/[`*_#|]/g, " "), hex });
    if (swatches.length >= 40) break;
  }
  const families = [
    ...md.matchAll(/[Ff]ont(?:[- ]family)?[^:\n]{0,30}:\s*\**["'`]?([A-Z][\w .-]{1,38}?)["'`,*\n(]/g),
  ].map((m) => m[1]?.trim());
  const radius = /radius[^:\n]{0,20}:\s*`?(\d{1,2})px/i.exec(md)?.[1];
  return finishStyle(id, title?.trim() || fallbackName, swatches, {
    fonts: { headline: fontStack(families[0]), body: fontStack(families[1] ?? families[0]) },
    ...(radius ? { radius: Math.min(48, Number(radius) * 1.5) } : {}),
  });
}

interface Token {
  path: string;
  type?: string;
  value: unknown;
}

function flatten(node: unknown, path: string[], type: string | undefined, out: Token[]): void {
  if (!node || typeof node !== "object" || out.length > 2000) return;
  const o = node as Record<string, unknown>;
  const t = typeof o.$type === "string" ? o.$type : type;
  if ("$value" in o) {
    out.push({ path: path.join("."), type: t, value: o.$value });
    return;
  }
  for (const [k, v] of Object.entries(o)) if (!k.startsWith("$")) flatten(v, [...path, k], t, out);
}

/** A DTCG colour value: `#hex`, or 2025.10's `{ colorSpace: "srgb", components, hex? }`. */
function colorHex(value: unknown): string | undefined {
  if (typeof value === "string") return normalizeHex(value);
  if (!value || typeof value !== "object") return undefined;
  const v = value as { hex?: unknown; colorSpace?: unknown; components?: unknown };
  if (typeof v.hex === "string") return normalizeHex(v.hex);
  if (v.colorSpace === "srgb" && Array.isArray(v.components) && v.components.length >= 3)
    return `#${v.components
      .slice(0, 3)
      .map((c) => Math.round(Math.max(0, Math.min(1, Number(c))) * 255))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")}`;
  return undefined;
}

function px(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(value.trim());
    return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : undefined;
  }
  if (value && typeof value === "object") {
    const v = value as { value?: unknown; unit?: unknown };
    if (typeof v.value === "number") return v.value * (v.unit === "rem" ? 16 : 1);
  }
  return undefined;
}

/** A product kit's DTCG 2025.10 `tokens.json`: colours by their paths, font families, a radius. */
export function styleFromTokens(tokens: unknown, id: string, name: string): MotionStyle {
  const all: Token[] = [];
  flatten(tokens, [], undefined, all);
  const swatches: Swatch[] = [];
  for (const t of all) {
    const hex = t.type === "color" || t.type === undefined ? colorHex(t.value) : undefined;
    if (hex) swatches.push({ label: t.path.replace(/[._-]+/g, " "), hex });
  }
  const families = all.filter((t) => t.type === "fontFamily");
  const family = (re: RegExp) => {
    const v = (families.find((t) => re.test(t.path)) ?? families[0])?.value;
    return Array.isArray(v) ? String(v[0]) : typeof v === "string" ? v : undefined;
  };
  const radii = all
    .filter((t) => /radius/i.test(t.path))
    .map((t) => px(t.value))
    .filter((n): n is number => n !== undefined && n > 0 && n < 100);
  const radius = radii.length ? radii.sort((a, b) => a - b)[Math.floor(radii.length / 2)] : undefined;
  return finishStyle(id, name, swatches, {
    fonts: {
      headline: fontStack(family(/head|display|title/i)),
      body: fontStack(family(/body|text|base|sans/i)),
    },
    ...(radius !== undefined ? { radius: Math.min(48, Math.round(radius * 1.5)) } : {}),
  });
}
