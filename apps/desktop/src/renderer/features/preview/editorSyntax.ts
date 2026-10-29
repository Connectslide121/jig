import { HighlightStyle } from "@codemirror/language";
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
