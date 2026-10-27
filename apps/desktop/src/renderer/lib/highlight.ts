import { type JigTheme, shikiTheme } from "@jig/themes";
import {
  bundledLanguages,
  bundledLanguagesAlias,
  createHighlighter,
  createJavaScriptRegexEngine,
  type HighlighterGeneric,
} from "shiki";

/**
 * Syntax highlighting with Shiki, coloured by the active theme's own `tokenColors` (for an imported
 * VS Code theme, exactly what VS Code shows). Uses Shiki's JavaScript regex engine (no WASM) and loads
 * grammars on demand.
 */
// biome-ignore lint/suspicious/noExplicitAny: Shiki's generic parameters are not needed here.
type Highlighter = HighlighterGeneric<any, any>;

let highlighter: Promise<Highlighter> | undefined;
let themeName = "";
const loading = new Map<string, Promise<void>>();

function instance(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: [], langs: [], engine: createJavaScriptRegexEngine() });
  return highlighter;
}

/** Registers the theme with Shiki; call whenever the active theme changes. */
export async function setHighlightTheme(theme: JigTheme): Promise<void> {
  const h = await instance();
  const data = shikiTheme(theme);
  // A new name per load, because Shiki caches themes by name and the user may edit a theme file.
  const name = `${data.name}-${Date.now()}`;
  await h.loadTheme({ ...data, name } as never);
  themeName = name;
}

export function resolveLanguage(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  const key = lang.toLowerCase();
  if (key in bundledLanguages) return key;
  if (key in bundledLanguagesAlias) return key;
  return undefined;
}

/** Returns highlighted HTML (`<pre class="shiki">…`), or undefined for unknown languages. */
export async function highlight(code: string, lang: string | undefined): Promise<string | undefined> {
  const language = resolveLanguage(lang);
  if (!language || !themeName) return undefined;
  const h = await instance();
  if (!h.getLoadedLanguages().includes(language)) {
    let pending = loading.get(language);
    if (!pending) {
      pending = h.loadLanguage(language as never);
      loading.set(language, pending);
    }
    await pending;
  }
  return h.codeToHtml(code, { lang: language, theme: themeName });
}

export function currentHighlightTheme(): string {
  return themeName;
}
