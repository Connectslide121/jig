/**
 * The Jig theme model. A theme sets every colour token, the terminal palette and the syntax colours.
 * Layout, spacing and typography are not part of a theme — they are Jig's design (see style settings).
 * Token meanings are documented in docs/reference/design-tokens.md; keep the two in sync.
 */

export const COLOR_TOKENS = [
  "canvas", // app background behind everything (editor-like main area)
  "surface", // sidebars, panels
  "raised", // inputs, cards, list items that sit on a surface
  "elevated", // menus, dialogs, popovers, tooltips
  "titlebar", // top bar
  "statusbar", // bottom status bar
  "onStatusbar", // text on the status bar
  "line", // subtle borders and dividers
  "lineStrong", // input borders, emphasised dividers
  "fg", // primary text
  "muted", // secondary text
  "hint", // placeholder, disabled, tertiary text
  "accent", // primary actions, links, active indicators
  "accentHover",
  "onAccent", // text on accent backgrounds
  "hover", // row/button hover background
  "active", // selected row/tab background
  "selection", // text selection (may be translucent)
  "focus", // focus ring
  "code", // code block background
  "success",
  "warning",
  "danger",
  "onDanger",
  "info",
  "shadow", // shadow colour (usually translucent black)
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type ThemeColors = Record<ColorToken, string>;

export const ANSI_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export type AnsiName = (typeof ANSI_NAMES)[number];
export type TerminalColors = Record<AnsiName | "background" | "foreground" | "cursor" | "selection", string>;

/** A TextMate token colour rule, as found in VS Code themes' `tokenColors`. */
export interface TokenColorRule {
  name?: string;
  scope?: string | string[];
  settings: { foreground?: string; background?: string; fontStyle?: string };
}

export type ThemeSource =
  | { kind: "builtin" }
  | { kind: "user"; file: string }
  | { kind: "vscode"; extension: string; file: string; installDir: string }
  | { kind: "openvsx"; extension: string; file: string };

export interface JigTheme {
  /** Stable id, e.g. `jig-dark`, `vscode:dracula-theme.theme-dracula/dracula`. */
  id: string;
  label: string;
  appearance: "dark" | "light";
  highContrast?: boolean;
  source: ThemeSource;
  colors: ThemeColors;
  terminal: TerminalColors;
  syntax: { tokenColors: TokenColorRule[] };
}

/** Lightweight entry for theme pickers. */
export interface ThemeSummary {
  id: string;
  label: string;
  appearance: "dark" | "light";
  source: ThemeSource["kind"];
  /** A few colours for the picker's swatch: canvas, surface, fg, accent. */
  swatch?: [string, string, string, string];
}

const kebab = (token: string) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS custom properties (`--jig-*`) for a theme's colour tokens. */
export function themeCssVariables(theme: JigTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const token of COLOR_TOKENS) vars[`--jig-${kebab(token)}`] = theme.colors[token];
  return vars;
}

export function summarize(theme: JigTheme): ThemeSummary {
  const c = theme.colors;
  return {
    id: theme.id,
    label: theme.label,
    appearance: theme.appearance,
    source: theme.source.kind,
    swatch: [c.canvas, c.surface, c.fg, c.accent],
  };
}

/** Returns the names of missing or empty tokens (empty array = valid). */
export function missingTokens(colors: Partial<Record<string, string>>): string[] {
  return COLOR_TOKENS.filter((token) => typeof colors[token] !== "string" || colors[token] === "");
}
