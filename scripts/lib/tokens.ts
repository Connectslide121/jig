// DTCG 2025.10 tokens → CSS variables (:root light, .dark) and a Tailwind v4 `@theme inline` block,
// through Style Dictionary v5. Colour values are DTCG colour objects; dimensions and durations are
// { value, unit } objects; cubic Béziers are four numbers.
import StyleDictionary from "style-dictionary";
import type { TransformedToken } from "style-dictionary/types";

type Color = { colorSpace: string; components: (number | "none")[]; alpha?: number; hex?: string };
type Dim = { value: number; unit: string };

const n = (v: number | "none") => (v === "none" ? "none" : String(+v.toFixed(4)));

export function cssColor(c: Color | string): string {
  if (typeof c === "string") return c;
  const alpha = c.alpha !== undefined && c.alpha < 1 ? ` / ${n(c.alpha)}` : "";
  const [a = 0, b = 0, d = 0] = c.components;
  switch (c.colorSpace) {
    case "oklch":
      return `oklch(${n(a)} ${n(b)} ${n(d)}${alpha})`;
    case "oklab":
      return `oklab(${n(a)} ${n(b)} ${n(d)}${alpha})`;
    case "hsl":
      return `hsl(${n(a)} ${n(b)}% ${n(d)}%${alpha})`;
    case "srgb":
      return `color(srgb ${n(a)} ${n(b)} ${n(d)}${alpha})`;
    default:
      if (c.hex) return c.hex;
      return `color(${c.colorSpace} ${c.components.map(n).join(" ")}${alpha})`;
  }
}

export const cssDim = (d: Dim | number | string) =>
  typeof d === "object" ? `${n(d.value)}${d.unit}` : typeof d === "number" ? `${d}px` : d;

const GENERIC_FONTS = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|math|emoji|ui-[a-z-]+)$/;

function cssValue(token: TransformedToken): string {
  const v = token.$value ?? token.value;
  switch (token.$type ?? token.type) {
    case "color":
      return cssColor(v);
    case "dimension":
    case "duration":
      return cssDim(v);
    case "cubicBezier":
      return `cubic-bezier(${(v as number[]).join(", ")})`;
    case "fontFamily":
      return (Array.isArray(v) ? v : [v])
        .map((f: string) => (GENERIC_FONTS.test(f) ? f : `"${f}"`))
        .join(", ");
    case "shadow":
      return (Array.isArray(v) ? v : [v])
        .map(
          (s: { color: Color; offsetX: Dim; offsetY: Dim; blur: Dim; spread: Dim; inset?: boolean }) =>
            `${s.inset ? "inset " : ""}${cssDim(s.offsetX)} ${cssDim(s.offsetY)} ${cssDim(s.blur)} ${cssDim(s.spread)} ${cssColor(s.color)}`,
        )
        .join(", ");
    default:
      return String(v);
  }
}

/** The CSS variable a token becomes: color.light.primary → --primary, radius.base → --radius-base.
 * Groups the kit knows: color.light / color.dark, typeface, radius, duration, easing, elevation. */
export function varName(path: string[]): string {
  const p = path[0] === "color" && (path[1] === "light" || path[1] === "dark") ? path.slice(2) : path;
  return `--${p.join("-")}`;
}

/** Tailwind theme variable for a token (null: no utility). */
function themeVar(token: TransformedToken): string | null {
  const [group, ...rest] = token.path;
  if (group === "color") return token.path[1] === "light" ? `--color-${rest.slice(1).join("-")}` : null;
  if (group === "typeface") return `--font-${rest.join("-")}`;
  if (group === "elevation") return `--shadow-${rest.join("-")}`;
  if (group === "easing") return `--ease-${rest.join("-")}`;
  return null;
}

export interface BuiltTokens {
  /** :root and .dark variables. */
  variables: string;
  /** Tailwind v4 `@theme inline { … }` mapping utilities to the variables. */
  theme: string;
  /** Font families the tokens name (for loading local font files). */
  families: string[];
}

export async function buildTokens(tokens: object): Promise<BuiltTokens> {
  const sd = new StyleDictionary({
    tokens: structuredClone(tokens) as Record<string, never>,
    log: { verbosity: "silent", warnings: "disabled" },
    platforms: { css: { transforms: ["kit/name", "kit/value"], files: [{ destination: "tokens.css", format: "kit/collect" }] } },
  });
  sd.registerTransform({ name: "kit/value", type: "value", transform: cssValue });
  sd.registerTransform({ name: "kit/name", type: "name", transform: (t) => varName(t.path).slice(2) });
  const collected: TransformedToken[] = [];
  sd.registerFormat({
    name: "kit/collect",
    format: ({ dictionary }) => {
      collected.push(...dictionary.allTokens);
      return "";
    },
  });
  await sd.formatPlatform("css");

  const decl = (t: TransformedToken) => `  --${t.name}: ${t.$value ?? t.value};`;
  const isDark = (t: TransformedToken) => t.path[0] === "color" && t.path[1] === "dark";
  const root = collected.filter((t) => !isDark(t)).map(decl);
  const dark = collected.filter(isDark).map(decl);
  const variables = `:root {\n${root.join("\n")}\n}\n${dark.length ? `.dark {\n${dark.join("\n")}\n}\n` : ""}`;

  const theme: string[] = [];
  for (const t of collected) {
    const v = themeVar(t);
    if (v) theme.push(`  ${v}: var(--${t.name});`);
  }
  if (collected.some((t) => t.path.join(".") === "typeface.body")) theme.push("  --font-sans: var(--typeface-body);");
  if (collected.some((t) => t.path.join(".") === "radius.base")) {
    theme.push(
      "  --radius-sm: calc(var(--radius-base) - 4px);",
      "  --radius-md: calc(var(--radius-base) - 2px);",
      "  --radius-lg: var(--radius-base);",
      "  --radius-xl: calc(var(--radius-base) + 4px);",
    );
  }
  const families = [
    ...new Set(
      collected
        .filter((t) => (t.$type ?? t.type) === "fontFamily")
        .flatMap((t) => {
          const raw = t.original.$value ?? t.original.value;
          return Array.isArray(raw) ? raw : [raw];
        }),
    ),
  ] as string[];
  return { variables, theme: `@theme inline {\n${theme.join("\n")}\n}\n`, families };
}
