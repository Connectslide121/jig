import type { JigTheme, TokenColorRule } from "./model";

/** A colour and font style for a kind of code, from a theme's `tokenColors`. */
export interface ScopeStyle {
  color?: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

/**
 * The style a theme gives a TextMate scope (e.g. `keyword.control`), as VS Code picks it: a rule's
 * selector matches the scope itself or a parent (`keyword` matches `keyword.control`); the most
 * specific selector wins, and of equally specific ones the later rule. Descendant selectors
 * (`meta.function-call entity.name.function`) are matched by their last part only.
 */
export function scopeStyle(rules: readonly TokenColorRule[], scope: string): ScopeStyle | undefined {
  let best: { depth: number; index: number; settings: TokenColorRule["settings"] } | undefined;
  rules.forEach((rule, index) => {
    if (!rule.scope || !rule.settings) return;
    const selectors = (Array.isArray(rule.scope) ? rule.scope : rule.scope.split(","))
      .map((s) => s.trim().split(/\s+/).pop() ?? "")
      .filter(Boolean);
    for (const sel of selectors) {
      if (sel !== scope && !scope.startsWith(`${sel}.`)) continue;
      const depth = sel.split(".").length;
      if (!best || depth > best.depth || (depth === best.depth && index >= best.index))
        best = { depth, index, settings: rule.settings };
    }
  });
  if (!best) return undefined;
  const font = best.settings.fontStyle ?? "";
  const style: ScopeStyle = {
    color: best.settings.foreground,
    italic: font.includes("italic") || undefined,
    bold: font.includes("bold") || undefined,
    underline: font.includes("underline") || undefined,
  };
  return style.color || style.italic || style.bold || style.underline ? style : undefined;
}

/**
 * Kinds of code the editor tells apart, each with the TextMate scopes that mean it (most specific
 * first). The editor maps each kind to its own syntax tags.
 */
export const SYNTAX_SCOPES = {
  comment: ["comment"],
  docComment: ["comment.block.documentation", "comment"],
  string: ["string.quoted", "string"],
  specialString: ["string.template", "string"],
  regexp: ["string.regexp"],
  escape: ["constant.character.escape"],
  character: ["constant.character", "string"],
  number: ["constant.numeric"],
  bool: ["constant.language.boolean", "constant.language"],
  atom: ["constant.language", "constant"],
  constant: ["variable.other.constant", "constant"],
  keyword: ["keyword.control", "keyword"],
  definitionKeyword: ["storage.type", "storage", "keyword"],
  modifier: ["storage.modifier", "storage", "keyword"],
  moduleKeyword: ["keyword.control.import", "keyword.control", "keyword"],
  operatorKeyword: ["keyword.operator.new", "keyword.operator", "keyword"],
  operator: ["keyword.operator"],
  self: ["variable.language", "keyword"],
  function: ["entity.name.function", "support.function"],
  method: ["entity.name.function.member", "entity.name.function"],
  variable: ["variable.other.readwrite", "variable"],
  property: ["variable.other.property", "support.type.property-name", "variable"],
  type: ["entity.name.type", "support.type", "storage.type"],
  className: ["entity.name.type.class", "entity.name.class", "entity.name.type"],
  namespace: ["entity.name.namespace", "entity.name.type"],
  label: ["entity.name.label"],
  decorator: ["meta.decorator", "entity.name.function.decorator", "entity.name.function"],
  tag: ["entity.name.tag"],
  attribute: ["entity.other.attribute-name"],
  attributeValue: ["string.quoted", "string"],
  heading: ["markup.heading", "entity.name.section"],
  emphasis: ["markup.italic"],
  strong: ["markup.bold"],
  link: ["markup.underline.link", "string.other.link"],
  quote: ["markup.quote"],
  monospace: ["markup.inline.raw", "markup.fenced_code"],
  list: ["punctuation.definition.list", "markup.list"],
  inserted: ["markup.inserted"],
  deleted: ["markup.deleted"],
  changed: ["markup.changed"],
  meta: ["meta.preprocessor", "keyword.other"],
  punctuation: ["punctuation"],
  invalid: ["invalid"],
} as const satisfies Record<string, readonly string[]>;

export type SyntaxKind = keyof typeof SYNTAX_SCOPES;

/** The theme's style for each kind of code it colours (kinds it leaves alone are left out). */
export function syntaxStyles(theme: Pick<JigTheme, "syntax">): Partial<Record<SyntaxKind, ScopeStyle>> {
  const rules = theme.syntax.tokenColors;
  const out: Partial<Record<SyntaxKind, ScopeStyle>> = {};
  for (const [kind, scopes] of Object.entries(SYNTAX_SCOPES) as Array<[SyntaxKind, readonly string[]]>) {
    for (const scope of scopes) {
      const style = scopeStyle(rules, scope);
      if (style) {
        out[kind] = style;
        break;
      }
    }
  }
  return out;
}
