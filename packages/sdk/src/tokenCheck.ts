/**
 * Design-token check: finds hard-coded colours and arbitrary Tailwind values in UI source.
 *
 * Used by `scripts/check-tokens.ts` for the app and the built-in add-ons, and by the builder to
 * validate add-ons the agent writes. Self-contained (no imports) so Node can run it with type
 * stripping.
 */

export interface TokenViolation {
  line: number;
  column: number;
  rule: "hex-colour" | "css-colour-function" | "palette-colour" | "arbitrary-value";
  match: string;
  message: string;
}

const IGNORE_LINE = "jig-tokens-ignore-line";

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const COLOUR_UTILITIES =
  "bg|text|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|to|via|outline|divide|shadow|accent|caret|decoration|placeholder";

const RULES: Array<{ rule: TokenViolation["rule"]; pattern: RegExp; message: string }> = [
  {
    rule: "hex-colour",
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
    message: "Hard-coded hex colour — use a colour token (e.g. bg-surface, text-muted, var(--jig-accent)).",
  },
  {
    rule: "css-colour-function",
    pattern: /\b(?:rgba?|hsla?|oklch|oklab|hwb)\(\s*[\d.]/g,
    message: "Hard-coded colour function — use a colour token.",
  },
  {
    rule: "palette-colour",
    pattern: new RegExp(
      `(?<![\\w-])(?:${COLOUR_UTILITIES})-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`,
      "g",
    ),
    message: "Tailwind palette colour — use a Jig colour token utility instead (e.g. text-danger).",
  },
  {
    rule: "arbitrary-value",
    pattern: /(?<![\w])[a-z][\w-]*-\[(?!var\(--jig-)[^\]\s]+\]/g,
    message: "Arbitrary Tailwind value — use the spacing/type scale or a token.",
  },
];

/** Returns every violation in `source`. Lines containing `jig-tokens-ignore-line` are skipped. */
export function checkTokens(source: string): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((text, index) => {
    if (text.includes(IGNORE_LINE)) return;
    for (const { rule, pattern, message } of RULES) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        violations.push({ line: index + 1, column: (match.index ?? 0) + 1, rule, match: match[0], message });
      }
    }
  });
  return violations;
}
