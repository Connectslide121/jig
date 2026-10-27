import { jigDark, jigLight } from "./builtin";
import { parseColor } from "./color";
import { ANSI_NAMES, COLOR_TOKENS, type JigTheme, type ThemeSource, type TokenColorRule } from "./model";

/**
 * Jig-format theme files (`~/.jig/themes/*.json`): `{ label, appearance, colors{token: colour},
 * terminal?, tokenColors? }`. Missing tokens are taken from Jig Dark/Light, so a theme can set only the
 * colours it cares about. VS Code theme files dropped into the same folder are told apart by
 * `isJigThemeFile`.
 */
export interface JigThemeFile {
  label?: string;
  appearance?: "dark" | "light";
  colors?: Record<string, string>;
  terminal?: Record<string, string>;
  tokenColors?: TokenColorRule[];
}

/** A file is in Jig format when it declares `appearance` and uses Jig token names (not VS Code keys). */
export function isJigThemeFile(json: unknown): json is JigThemeFile {
  if (typeof json !== "object" || json === null) return false;
  const file = json as JigThemeFile;
  if (file.appearance !== "dark" && file.appearance !== "light") return false;
  const keys = Object.keys(file.colors ?? {});
  return keys.every((key) => !key.includes("."));
}

export class ThemeFileError extends Error {}

/** Builds a complete theme from a Jig-format file; throws `ThemeFileError` on invalid colours. */
export function jigThemeFromFile(file: JigThemeFile, id: string, source: ThemeSource): JigTheme {
  const base = file.appearance === "light" ? jigLight : jigDark;
  const colors = { ...base.colors };
  for (const [key, value] of Object.entries(file.colors ?? {})) {
    if (!(COLOR_TOKENS as readonly string[]).includes(key)) continue;
    if (!parseColor(value)) throw new ThemeFileError(`"${key}": "${value}" is not a colour`);
    colors[key as keyof typeof colors] = value;
  }
  const terminal = { ...base.terminal };
  for (const [key, value] of Object.entries(file.terminal ?? {})) {
    const known = [...ANSI_NAMES, "background", "foreground", "cursor", "selection"] as string[];
    if (known.includes(key) && parseColor(value)) terminal[key as keyof typeof terminal] = value;
  }
  return {
    id,
    label: file.label ?? id,
    appearance: base.appearance,
    source,
    colors,
    terminal,
    syntax: {
      tokenColors: Array.isArray(file.tokenColors) ? file.tokenColors : base.syntax.tokenColors,
    },
  };
}
