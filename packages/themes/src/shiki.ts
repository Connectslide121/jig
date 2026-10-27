import type { JigTheme, TokenColorRule } from "./model";

/**
 * A Shiki theme registration built from a Jig theme: the theme's own `tokenColors` (VS Code's
 * TextMate rules, used as-is) plus the editor colours Shiki needs. Structurally compatible with
 * Shiki's `ThemeRegistrationRaw`, so this package doesn't depend on Shiki.
 */
export interface ShikiThemeData {
  name: string;
  type: "dark" | "light";
  fg: string;
  bg: string;
  settings: TokenColorRule[];
  colors: Record<string, string>;
}

export function shikiTheme(theme: JigTheme): ShikiThemeData {
  const fg =
    theme.syntax.tokenColors.find((rule) => !rule.scope && rule.settings.foreground)?.settings.foreground ??
    theme.colors.fg;
  const bg = theme.colors.code;
  const rules = theme.syntax.tokenColors.filter((rule) => rule.settings && typeof rule.settings === "object");
  return {
    name: `jig-${theme.id}`,
    type: theme.appearance,
    fg,
    bg,
    // Shiki takes the global (scope-less) rule as the default colours, so it must come first.
    settings: [{ settings: { foreground: fg, background: bg } }, ...rules.filter((rule) => rule.scope)],
    colors: { "editor.foreground": fg, "editor.background": bg },
  };
}
