import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { type Extension, Prec, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type JigTheme, type SyntaxKind, syntaxStyles } from "@jig/themes";
import { type Tag, tags as t } from "@lezer/highlight";

/** CodeMirror's syntax tags for each kind of code a theme colours (`SYNTAX_SCOPES` in @jig/themes). */
const TAGS: Record<SyntaxKind, Tag[]> = {
  comment: [t.comment, t.lineComment, t.blockComment],
  docComment: [t.docComment],
  string: [t.string],
  specialString: [t.special(t.string)],
  regexp: [t.regexp],
  escape: [t.escape],
  character: [t.character],
  number: [t.number, t.integer, t.float],
  bool: [t.bool],
  atom: [t.atom, t.null],
  constant: [t.constant(t.variableName), t.standard(t.variableName)],
  keyword: [t.keyword, t.controlKeyword],
  definitionKeyword: [t.definitionKeyword],
  modifier: [t.modifier],
  moduleKeyword: [t.moduleKeyword],
  operatorKeyword: [t.operatorKeyword],
  operator: [t.operator],
  self: [t.self],
  function: [t.function(t.variableName), t.function(t.definition(t.variableName))],
  method: [t.function(t.propertyName), t.function(t.definition(t.propertyName))],
  variable: [t.variableName, t.definition(t.variableName)],
  property: [t.propertyName, t.definition(t.propertyName)],
  type: [t.typeName],
  className: [t.className, t.definition(t.className)],
  namespace: [t.namespace],
  label: [t.labelName],
  decorator: [t.annotation],
  tag: [t.tagName, t.angleBracket],
  attribute: [t.attributeName],
  attributeValue: [t.attributeValue],
  heading: [t.heading],
  emphasis: [t.emphasis],
  strong: [t.strong],
  link: [t.link, t.url],
  quote: [t.quote],
  monospace: [t.monospace],
  list: [t.list],
  inserted: [t.inserted],
  deleted: [t.deleted],
  changed: [t.changed],
  meta: [t.meta, t.processingInstruction],
  punctuation: [t.punctuation],
  invalid: [t.invalid],
};

/** For a theme with (almost) no syntax colours: Jig's own tokens. */
const FALLBACK = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: "var(--color-accent)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--color-success)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--color-warning)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--color-info)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--color-info)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--color-hint)", fontStyle: "italic" },
  { tag: [t.tagName, t.heading], color: "var(--color-accent)", fontWeight: "600" },
  { tag: [t.attributeName, t.propertyName], color: "var(--color-muted)" },
  { tag: t.invalid, color: "var(--color-danger)" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
]);

const cache = new WeakMap<JigTheme, HighlightStyle>();

/**
 * The editor's highlighting in the theme's own syntax colours (its `tokenColors`, as VS Code and the
 * chat's code blocks show them).
 */
export function themeHighlight(theme: JigTheme | undefined): HighlightStyle {
  if (!theme) return FALLBACK;
  const hit = cache.get(theme);
  if (hit) return hit;
  const styles = syntaxStyles(theme);
  const specs = (Object.entries(styles) as Array<[SyntaxKind, NonNullable<(typeof styles)[SyntaxKind]>]>).map(
    ([kind, s]) => ({
      tag: TAGS[kind],
      color: s.color,
      fontStyle: s.italic ? "italic" : undefined,
      fontWeight: s.bold ? "700" : undefined,
      textDecoration: s.underline ? "underline" : undefined,
    }),
  );
  const style = specs.length >= 3 ? HighlightStyle.define(specs) : FALLBACK;
  cache.set(theme, style);
  return style;
}

/**
 * Angular's control-flow blocks (`@if`, `@else`, `@for`, `@switch`, `@defer`, `@let`…), which its
 * CodeMirror grammar (0.1.x) doesn't know yet: marked as keywords, in the theme's keyword style.
 */
const BLOCKS =
  /(?<=^|[\s}])@(?:else\s+if|if|else|for|empty|switch|case|default|defer|placeholder|loading|error|let)\b/g;

function angularBlocks(style: HighlightStyle): Extension {
  const decorator = new MatchDecorator({
    regexp: BLOCKS,
    decoration: Decoration.mark({ class: style.style([t.controlKeyword]) ?? style.style([t.keyword]) ?? "" }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

/** The theme's colours a tag name can take, most tag-like first; Jig's tokens for a theme with few. */
const TAG_KINDS: SyntaxKind[] = [
  "tag",
  "function",
  "type",
  "keyword",
  "className",
  "number",
  "decorator",
  "constant",
  "method",
  "attribute",
  "property",
  "string",
];
const TOKEN_COLORS = [
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
];
const palettes = new WeakMap<JigTheme, string[]>();

/** A colour a tag can stand out in: not a grey or white (the theme's plain text often is). */
export function colorful(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number.parseInt(x!, 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  return saturation >= 0.3;
}

/** A colour's hue in degrees (0–360). */
export function hue(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number.parseInt(x!, 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Keeps colours whose hues are at least `apart` degrees from every one kept before, in order. */
export function distinctHues(colors: string[], apart = 25): string[] {
  const kept: string[] = [];
  for (const c of colors) {
    const h = hue(c);
    if (kept.every((k) => Math.min(Math.abs(hue(k) - h), 360 - Math.abs(hue(k) - h)) >= apart)) kept.push(c);
  }
  return kept;
}

export function tagPalette(theme: JigTheme | undefined): string[] {
  if (!theme) return TOKEN_COLORS;
  const hit = palettes.get(theme);
  if (hit) return hit;
  const styles = syntaxStyles(theme);
  const colors = [
    ...new Set(
      TAG_KINDS.map((kind) => styles[kind]?.color?.toLowerCase()).filter(
        (c): c is string => !!c && colorful(c),
      ),
    ),
  ];
  // Tags must read as different: near-identical hues (three oranges) count once.
  const distinct = distinctHues(colors);
  const palette = distinct.length >= 4 ? distinct : TOKEN_COLORS;
  palettes.set(theme, palette);
  return palette;
}

/**
 * Common elements in an order that keeps the ones usually found together apart: with five colours,
 * `div`, `nav`, `aside`, `button` and `a` all differ. Other tags get a colour from their name.
 */
const COMMON_TAGS = [
  "div",
  "nav",
  "aside",
  "button",
  "a",
  "span",
  "p",
  "img",
  "section",
  "header",
  "ul",
  "li",
  "main",
  "footer",
  "form",
  "input",
  "label",
  "h1",
  "h2",
  "h3",
  "table",
  "tr",
  "td",
  "th",
  "select",
  "option",
  "textarea",
  "strong",
  "em",
  "i",
];

/** The same colour for a tag name everywhere (`div` is always one colour, `button` another). */
export function tagColorIndex(name: string, size: number): number {
  const common = COMMON_TAGS.indexOf(name.toLowerCase());
  if (common >= 0) return common % size;
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % size;
}

/** Tags whose name and brackets are coloured, and those parts. */
const TAGS_WITH_BRACKETS = new Set(["OpenTag", "CloseTag", "SelfClosingTag"]);
const TAG_PARTS = new Set(["StartTag", "StartCloseTag", "TagName", "EndTag"]);

/**
 * Each HTML element in a colour of its own (D-156): the tag names CodeMirror's markup grammars
 * (HTML, Angular, Vue, XML) find, coloured by name from the theme's syntax colours, with their
 * brackets, opening and closing tag alike. Only what's on screen is coloured.
 */
function tagColors(palette: string[]): Extension {
  const marks = palette.map((color) => Decoration.mark({ attributes: { style: `color:${color}` } }));
  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const tree = syntaxTree(view.state);
    // A tag seen in two visible ranges (around a fold) is coloured once.
    let last = -1;
    for (const { from, to } of view.visibleRanges)
      tree.iterate({
        from,
        to,
        enter: (node) => {
          if (!TAGS_WITH_BRACKETS.has(node.name)) return;
          const tagName = node.node.getChild("TagName");
          if (!tagName) return;
          const mark =
            marks[tagColorIndex(view.state.doc.sliceString(tagName.from, tagName.to), marks.length)]!;
          // The brackets (`<`, `</`, `>`, `/>`) and the name, in the tag's colour; not its attributes.
          for (let part = node.node.firstChild; part; part = part.nextSibling)
            if (TAG_PARTS.has(part.name) && part.from >= last && part.to > part.from) {
              builder.add(part.from, part.to, mark);
              last = part.to;
            }
          return false;
        },
      });
    return builder.finish();
  };
  // Highest precedence: the tag's own colour wins over the theme's one colour for every tag.
  return Prec.highest(
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = build(view);
        }
        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.viewportChanged ||
            syntaxTree(update.startState) !== syntaxTree(update.state)
          )
            this.decorations = build(update.view);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  );
}

/**
 * The editor's highlighting for a theme: every tag in a colour of its own, and Angular's blocks
 * for an Angular template (D-155).
 */
export function editorSyntax(theme: JigTheme | undefined, angular: boolean): Extension {
  const style = themeHighlight(theme);
  return [
    syntaxHighlighting(style),
    tagColors(tagPalette(theme)),
    ...(angular ? [angularBlocks(style)] : []),
  ];
}
