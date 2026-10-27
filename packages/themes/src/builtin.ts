import type { JigTheme, TerminalColors, TokenColorRule } from "./model";

/*
 * Jig's own themes. The brand accent is a warm amber (wood, workshop) — bright on dark, deepened on
 * light so it passes contrast as text and as a button background.
 */

const darkAnsi: Omit<TerminalColors, "background" | "foreground" | "cursor" | "selection"> = {
  black: "#1e1f22",
  red: "#ef6b6b",
  green: "#6fbf73",
  yellow: "#e5c07b",
  blue: "#6cb6ff",
  magenta: "#c792ea",
  cyan: "#56c2c6",
  white: "#c8ccd3",
  brightBlack: "#70747c",
  brightRed: "#ff8787",
  brightGreen: "#8fd694",
  brightYellow: "#f0d399",
  brightBlue: "#91caff",
  brightMagenta: "#d7aefb",
  brightCyan: "#7fd8db",
  brightWhite: "#f2f3f5",
};

const lightAnsi: Omit<TerminalColors, "background" | "foreground" | "cursor" | "selection"> = {
  black: "#1f2023",
  red: "#c43c3c",
  green: "#2f8a3a",
  yellow: "#8a6100",
  blue: "#2468b3",
  magenta: "#8f3fb0",
  cyan: "#1b7f86",
  white: "#6b6e75",
  brightBlack: "#5b5e66",
  brightRed: "#d65151",
  brightGreen: "#3c9e47",
  brightYellow: "#a07300",
  brightBlue: "#3479c6",
  brightMagenta: "#a352c4",
  brightCyan: "#22939b",
  brightWhite: "#2b2d31",
};

const rule = (scope: string | string[], foreground: string, fontStyle?: string): TokenColorRule => ({
  scope,
  settings: fontStyle ? { foreground, fontStyle } : { foreground },
});

function syntax(p: {
  fg: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  fn: string;
  type: string;
  constant: string;
  tag: string;
  attribute: string;
  regexp: string;
  heading: string;
}): TokenColorRule[] {
  return [
    { settings: { foreground: p.fg } },
    rule(["comment", "punctuation.definition.comment"], p.comment, "italic"),
    rule(["keyword", "storage", "storage.type", "keyword.control", "keyword.operator.new"], p.keyword),
    rule(["string", "string.quoted", "string.template", "punctuation.definition.string"], p.string),
    rule(["constant.numeric", "constant.language.boolean"], p.number),
    rule(["constant", "variable.other.constant", "support.constant", "constant.language"], p.constant),
    rule(["entity.name.function", "support.function", "meta.function-call entity.name.function"], p.fn),
    rule(
      [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
        "entity.other.inherited-class",
      ],
      p.type,
    ),
    rule(["entity.name.tag", "punctuation.definition.tag"], p.tag),
    rule(
      ["entity.other.attribute-name", "support.type.property-name", "meta.object-literal.key"],
      p.attribute,
    ),
    rule(["string.regexp", "constant.character.escape"], p.regexp),
    rule(["markup.heading", "entity.name.section"], p.heading, "bold"),
    rule("markup.bold", p.fg, "bold"),
    rule("markup.italic", p.fg, "italic"),
    rule(["markup.inline.raw", "markup.fenced_code"], p.string),
    rule("markup.inserted", p.string),
    rule("markup.deleted", p.keyword),
    rule(["variable", "variable.parameter", "meta.definition.variable"], p.fg),
  ];
}

export const jigDark: JigTheme = {
  id: "jig-dark",
  label: "Jig Dark",
  appearance: "dark",
  source: { kind: "builtin" },
  colors: {
    canvas: "#1e1f22",
    surface: "#232428",
    raised: "#2b2d31",
    elevated: "#2f3136",
    titlebar: "#1b1c1f",
    statusbar: "#1b1c1f",
    onStatusbar: "#9da0a6",
    line: "#34363b",
    lineStrong: "#45484f",
    fg: "#dfe1e5",
    muted: "#a2a6ad",
    hint: "#70747c",
    accent: "#e0a458",
    accentHover: "#ebb877",
    onAccent: "#1e1f22",
    hover: "#2e3035",
    active: "#383b41",
    selection: "#e0a45840",
    focus: "#e0a458",
    code: "#1a1b1e",
    success: "#6fbf73",
    warning: "#e5c07b",
    danger: "#ef6b6b",
    onDanger: "#1e1f22",
    info: "#6cb6ff",
    shadow: "#00000059",
  },
  terminal: {
    ...darkAnsi,
    background: "#1a1b1e",
    foreground: "#dfe1e5",
    cursor: "#e0a458",
    selection: "#e0a45840",
  },
  syntax: {
    tokenColors: syntax({
      fg: "#dfe1e5",
      comment: "#7a7e85",
      keyword: "#cf8e6d",
      string: "#8fbf7f",
      number: "#56c2c6",
      fn: "#6cb6ff",
      type: "#e0a458",
      constant: "#c792ea",
      tag: "#e5c07b",
      attribute: "#b9bcc2",
      regexp: "#56c2c6",
      heading: "#e0a458",
    }),
  },
};

export const jigLight: JigTheme = {
  id: "jig-light",
  label: "Jig Light",
  appearance: "light",
  source: { kind: "builtin" },
  colors: {
    canvas: "#fbfaf8",
    surface: "#f3f2ef",
    raised: "#ffffff",
    elevated: "#ffffff",
    titlebar: "#ecebe7",
    statusbar: "#ecebe7",
    onStatusbar: "#4f5259",
    line: "#e1dfda",
    lineStrong: "#c9c6bf",
    fg: "#1f2023",
    muted: "#55585f",
    hint: "#85888f",
    accent: "#a8641a",
    accentHover: "#8f5413",
    onAccent: "#ffffff",
    hover: "#e9e7e2",
    active: "#dfdcd5",
    selection: "#a8641a33",
    focus: "#a8641a",
    code: "#f3f2ef",
    success: "#2f8a3a",
    warning: "#8a6100",
    danger: "#c43c3c",
    onDanger: "#ffffff",
    info: "#2468b3",
    shadow: "#0000001f",
  },
  terminal: {
    ...lightAnsi,
    background: "#fbfaf8",
    foreground: "#1f2023",
    cursor: "#a8641a",
    selection: "#a8641a33",
  },
  syntax: {
    tokenColors: syntax({
      fg: "#1f2023",
      comment: "#7b7e84",
      keyword: "#a33f1c",
      string: "#2f7d32",
      number: "#1b7f86",
      fn: "#2468b3",
      type: "#8f5413",
      constant: "#8f3fb0",
      tag: "#8a6100",
      attribute: "#55585f",
      regexp: "#1b7f86",
      heading: "#a8641a",
    }),
  },
};

export const BUILTIN_THEMES: readonly JigTheme[] = [jigDark, jigLight];
