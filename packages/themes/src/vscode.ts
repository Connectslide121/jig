/**
 * VS Code theme → Jig theme.
 *
 * - Workbench `colors` are mapped onto Jig tokens through an ordered list of VS Code keys per token,
 *   falling back to colours derived from tokens already resolved. Translucent VS Code colours are
 *   painted over their base so tokens are opaque (except `selection` and `shadow`).
 * - A contrast pass keeps text readable whatever the theme does.
 * - `terminal.ansi*` maps 1:1 (defaults from VS Code's own palettes).
 * - `tokenColors` are used as-is for syntax highlighting.
 *
 * Nothing in here touches the file system; `resolveIncludes` takes a loader.
 * Documented in docs/guides/themes.md.
 */
import { jigDark, jigLight } from "./builtin";
import {
  BLACK,
  composite,
  contrastRatio,
  ensureContrast,
  isDark,
  mix,
  parseColor,
  type Rgba,
  readableOn,
  shade,
  toHex,
  WHITE,
} from "./color";
import type { JigTheme, TerminalColors, ThemeSource, TokenColorRule } from "./model";

export interface VsCodeTheme {
  name?: string;
  type?: string; // "dark" | "light" | "hc" | "hcLight" (also "vs-dark" etc. in the wild)
  include?: string;
  colors?: Record<string, string | null>;
  tokenColors?: TokenColorRule[] | string;
  semanticHighlighting?: boolean;
}

// ---------------------------------------------------------------------------------------------
// JSONC

/**
 * Parses JSON with comments and trailing commas (the format VS Code themes are written in). String
 * literals are copied verbatim, so `//`, `/*` or `, ]` inside a string are left alone.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  /** Index in `out` of a comma that may turn out to be trailing. */
  let pendingComma = -1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (ch === '"') {
      pendingComma = -1;
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
    } else if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else {
      if (ch === "}" || ch === "]") {
        if (pendingComma >= 0) out = out.slice(0, pendingComma) + out.slice(pendingComma + 1);
        pendingComma = -1;
      } else if (ch === ",") {
        pendingComma = out.length;
      } else if (!/\s/.test(ch)) {
        pendingComma = -1;
      }
      out += ch;
      i++;
    }
  }
  return JSON.parse(out.replace(/^\uFEFF/, ""));
}

// ---------------------------------------------------------------------------------------------
// include chains

/**
 * Follows `include` (relative paths, recursively) and merges: the including theme wins for colours;
 * token colours are concatenated base-first so later rules override. `load` reads a path relative to
 * the including file and returns its parsed JSON (or a tmTheme-less object).
 */
export async function resolveIncludes(
  theme: VsCodeTheme,
  load: (relativePath: string, fromPath: string) => Promise<{ theme: VsCodeTheme; path: string }>,
  fromPath: string,
  depth = 0,
): Promise<VsCodeTheme> {
  let tokenColors: TokenColorRule[] = [];
  if (typeof theme.tokenColors === "string") {
    const loaded = await load(theme.tokenColors, fromPath).catch(() => undefined);
    const rules = (loaded?.theme as unknown as { tokenColors?: TokenColorRule[] } | undefined)?.tokenColors;
    if (Array.isArray(rules)) tokenColors = rules;
  } else if (Array.isArray(theme.tokenColors)) {
    tokenColors = theme.tokenColors;
  }
  const own: VsCodeTheme = { ...theme, tokenColors };
  if (!theme.include || depth > 8) return own;
  const base = await load(theme.include, fromPath).catch(() => undefined);
  if (!base) return own;
  const resolved = await resolveIncludes(base.theme, load, base.path, depth + 1);
  return {
    ...resolved,
    ...own,
    colors: { ...(resolved.colors ?? {}), ...(own.colors ?? {}) },
    tokenColors: [...((resolved.tokenColors as TokenColorRule[]) ?? []), ...tokenColors],
  };
}

// ---------------------------------------------------------------------------------------------
// mapping

const DEFAULT_ANSI_DARK = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

const DEFAULT_ANSI_LIGHT = {
  black: "#000000",
  red: "#cd3131",
  green: "#00bc00",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};

export interface MapOptions {
  id: string;
  label?: string;
  source: ThemeSource;
  /** `uiTheme` from the extension's package.json (`vs`, `vs-dark`, `hc-black`, `hc-light`). */
  uiTheme?: string;
}

/** Maps a (resolved) VS Code theme onto a complete Jig theme. */
export function mapVsCodeTheme(theme: VsCodeTheme, options: MapOptions): JigTheme {
  const colors = theme.colors ?? {};
  const get = (...keys: string[]): Rgba | undefined => {
    for (const key of keys) {
      const parsed = parseColor(colors[key] ?? undefined);
      if (parsed) return parsed;
    }
    return undefined;
  };

  const declared = (options.uiTheme ?? theme.type ?? "").toLowerCase();
  const highContrast = declared.startsWith("hc");

  // 1. Dark or light: what the theme declares, else the canvas luminance.
  const canvasRaw = get("editor.background", "sideBar.background", "panel.background");
  let dark: boolean;
  if (["vs", "light", "hc-light", "hclight"].includes(declared)) dark = false;
  else if (["vs-dark", "dark", "hc-black", "hc"].includes(declared)) dark = true;
  else dark = canvasRaw ? isDark(composite(canvasRaw, BLACK)) : true;
  const base = dark ? jigDark : jigLight;
  const baseColor = (token: keyof JigTheme["colors"]) => parseColor(base.colors[token])!;
  const opaque = (c: Rgba | undefined, under: Rgba) => (c ? composite(c, under) : undefined);

  const canvas = opaque(canvasRaw, dark ? BLACK : WHITE) ?? baseColor("canvas");
  const fg = opaque(get("foreground", "editor.foreground", "sideBar.foreground"), canvas) ?? baseColor("fg");
  const towardsFg = (amount: number, from: Rgba = canvas) => mix(from, fg, amount);

  const surface =
    opaque(get("sideBar.background", "panel.background", "editorGroupHeader.tabsBackground"), canvas) ??
    shade(canvas, dark ? -0.06 : -0.03);
  const raised =
    opaque(get("input.background", "dropdown.background", "editorWidget.background"), surface) ??
    towardsFg(0.05, surface);
  const elevated =
    opaque(
      get("menu.background", "editorWidget.background", "quickInput.background", "dropdown.background"),
      surface,
    ) ?? towardsFg(0.07, surface);
  const titlebar = opaque(get("titleBar.activeBackground"), surface) ?? surface;
  const statusbar = opaque(get("statusBar.background"), surface) ?? surface;
  const onStatusbar = opaque(get("statusBar.foreground"), statusbar) ?? mix(fg, statusbar, 0.25);

  const line =
    opaque(
      get("panel.border", "sideBar.border", "editorGroup.border", "widget.border", "contrastBorder"),
      canvas,
    ) ?? towardsFg(0.12);
  const lineStrong =
    opaque(get("input.border", "dropdown.border", "contrastActiveBorder"), canvas) ?? towardsFg(0.24);

  const muted = opaque(get("descriptionForeground"), surface) ?? mix(fg, surface, 0.35);
  const hint =
    opaque(
      get("disabledForeground", "editorLineNumber.foreground", "input.placeholderForeground"),
      surface,
    ) ?? mix(fg, surface, 0.55);

  const accentRaw =
    get(
      "button.background",
      "activityBarBadge.background",
      "focusBorder",
      "textLink.foreground",
      "editorCursor.foreground",
    ) ?? baseColor("accent");
  const accent = composite(accentRaw, canvas);
  const accentHover = opaque(get("button.hoverBackground"), canvas) ?? shade(accent, dark ? 0.12 : -0.12);
  const onAccentRaw = opaque(get("button.foreground"), accent);
  const onAccent =
    onAccentRaw && contrastRatio(onAccentRaw, accent) >= 4.5 ? onAccentRaw : readableOn(accent);

  const hover =
    opaque(get("list.hoverBackground", "toolbar.hoverBackground"), surface) ?? towardsFg(0.07, surface);
  const active =
    opaque(
      get("list.inactiveSelectionBackground", "list.activeSelectionBackground", "tab.activeBackground"),
      surface,
    ) ?? towardsFg(0.12, surface);
  const selection = get("editor.selectionBackground", "selection.background") ?? { ...accent, a: 0.3 };
  const focus = opaque(get("focusBorder"), canvas) ?? accent;
  const code =
    opaque(get("textCodeBlock.background", "editor.background"), canvas) ??
    shade(canvas, dark ? -0.04 : -0.02);

  const ansi = dark ? DEFAULT_ANSI_DARK : DEFAULT_ANSI_LIGHT;
  const semantic = (keys: string[], ansiKey: keyof typeof ansi, fallback: Rgba) =>
    ensureContrast(
      opaque(get(...keys), canvas) ??
        parseColor(colors[`terminal.ansi${cap(ansiKey)}`] ?? undefined) ??
        fallback,
      canvas,
      3,
    );
  const success = semantic(
    ["gitDecoration.addedResourceForeground", "testing.iconPassed"],
    "green",
    baseColor("success"),
  );
  const warning = semantic(
    ["editorWarning.foreground", "list.warningForeground"],
    "yellow",
    baseColor("warning"),
  );
  const danger = semantic(
    ["errorForeground", "editorError.foreground", "list.errorForeground"],
    "red",
    baseColor("danger"),
  );
  const info = semantic(["editorInfo.foreground", "textLink.foreground"], "blue", baseColor("info"));
  const shadow = get("widget.shadow") ?? (dark ? { ...BLACK, a: 0.35 } : { ...BLACK, a: 0.12 });

  // 2. Contrast pass — text must stay readable on every background it sits on.
  const textMin = highContrast ? 7 : 4.5;
  const fgSafe = ensureContrast(fg, darkest([canvas, surface, active, hover], dark), textMin);

  const out: JigTheme["colors"] = {
    canvas: toHex(canvas),
    surface: toHex(surface),
    raised: toHex(raised),
    elevated: toHex(elevated),
    titlebar: toHex(titlebar),
    statusbar: toHex(statusbar),
    onStatusbar: toHex(ensureContrast(onStatusbar, statusbar, 4.5)),
    line: toHex(line),
    lineStrong: toHex(lineStrong),
    fg: toHex(fgSafe),
    muted: toHex(ensureContrast(muted, surface, highContrast ? 7 : 4)),
    hint: toHex(ensureContrast(hint, surface, 2.6)),
    accent: toHex(ensureContrast(accent, canvas, 2.5)),
    accentHover: toHex(accentHover),
    onAccent: toHex(onAccent),
    hover: toHex(hover),
    active: toHex(active),
    selection: toHex(selection),
    focus: toHex(focus),
    code: toHex(code),
    success: toHex(success),
    warning: toHex(warning),
    danger: toHex(danger),
    onDanger: toHex(readableOn(danger)),
    info: toHex(info),
    shadow: toHex(shadow),
  };

  const ansiColor = (name: keyof typeof ansi) =>
    toHex(opaque(get(`terminal.ansi${cap(name)}`), canvas) ?? parseColor(ansi[name])!);
  const terminalBackground =
    opaque(get("terminal.background", "panel.background", "editor.background"), canvas) ?? canvas;
  const terminal = Object.fromEntries(
    Object.keys(ansi).map((name) => [name, ansiColor(name as keyof typeof ansi)]),
  ) as Record<keyof typeof ansi, string>;

  const tokenColors =
    Array.isArray(theme.tokenColors) && theme.tokenColors.length > 0
      ? theme.tokenColors
      : base.syntax.tokenColors;
  // Make sure the default foreground for code matches the theme even if no global rule exists.
  const editorFg = get("editor.foreground");
  const hasGlobalRule = tokenColors.some((r) => !r.scope && r.settings.foreground);

  return {
    id: options.id,
    label: options.label ?? theme.name ?? options.id,
    appearance: dark ? "dark" : "light",
    highContrast: highContrast || undefined,
    source: options.source,
    colors: out,
    terminal: {
      ...terminal,
      background: toHex(terminalBackground),
      foreground: toHex(opaque(get("terminal.foreground"), terminalBackground) ?? fgSafe),
      cursor: toHex(
        opaque(get("terminalCursor.foreground", "editorCursor.foreground"), terminalBackground) ?? accent,
      ),
      selection: toHex(get("terminal.selectionBackground") ?? selection),
    } satisfies TerminalColors,
    syntax: {
      tokenColors:
        hasGlobalRule || !editorFg
          ? tokenColors
          : [{ settings: { foreground: toHex(composite(editorFg, canvas)) } }, ...tokenColors],
    },
  };
}

function cap(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The background that is hardest for text: the lightest one on dark themes, the darkest on light. */
function darkest(backgrounds: Rgba[], dark: boolean): Rgba {
  const lum = (c: Rgba) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return backgrounds.reduce((worst, c) =>
    dark ? (lum(c) > lum(worst) ? c : worst) : lum(c) < lum(worst) ? c : worst,
  );
}

/** Slug for ids: lower-case, alphanumerics and dashes. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/** Theme entry declared in an extension's package.json `contributes.themes`. */
export interface ContributedTheme {
  label?: string;
  id?: string;
  uiTheme?: string;
  path: string;
}

/** Reads `contributes.themes` from an extension manifest. */
export function contributedThemes(manifest: unknown): ContributedTheme[] {
  const themes = (manifest as { contributes?: { themes?: unknown } })?.contributes?.themes;
  if (!Array.isArray(themes)) return [];
  return themes.filter(
    (t): t is ContributedTheme =>
      typeof t === "object" && t !== null && typeof (t as ContributedTheme).path === "string",
  );
}
