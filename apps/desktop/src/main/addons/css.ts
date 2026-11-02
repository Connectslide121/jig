import { readFile } from "node:fs/promises";
import { compile } from "tailwindcss";

/**
 * Tailwind utilities for an add-on's UI, generated at runtime from its source with Jig's tokens (the
 * app's own CSS only contains the classes Jig itself uses). Only the token `@theme` is used — the
 * raw fallback colours in tokens.css are not, so add-on CSS can never override the active theme.
 */
let themeCss: Promise<string> | undefined;

export function setTokensFile(path: string): void {
  themeCss = readFile(path, "utf8").then(extractTheme);
}

/** The `@theme { … }` block of tokens.css. */
export function extractTheme(tokensCss: string): string {
  const start = tokensCss.indexOf("@theme");
  if (start < 0) return "";
  let depth = 0;
  for (let i = tokensCss.indexOf("{", start); i < tokensCss.length; i++) {
    if (tokensCss[i] === "{") depth++;
    else if (tokensCss[i] === "}" && --depth === 0) return tokensCss.slice(start, i + 1);
  }
  return "";
}

/**
 * Tailwind's default screen and container sizes, which tokens.css doesn't redefine: without them an
 * add-on's `md:` and `@xl:` variants silently generate nothing (the app gets them from its own import).
 */
const LAYOUT_SCALES = `@theme {
  --breakpoint-sm: 40rem; --breakpoint-md: 48rem; --breakpoint-lg: 64rem; --breakpoint-xl: 80rem;
  --breakpoint-2xl: 96rem;
  --container-3xs: 16rem; --container-2xs: 18rem; --container-xs: 20rem; --container-sm: 24rem;
  --container-md: 28rem; --container-lg: 32rem; --container-xl: 36rem; --container-2xl: 42rem;
  --container-3xl: 48rem; --container-4xl: 56rem; --container-5xl: 64rem; --container-6xl: 72rem;
  --container-7xl: 80rem;
}`;

/** Class-name candidates in source code (Tailwind ignores anything that isn't a utility). */
export function candidates(source: string): string[] {
  return [...new Set(source.split(/[\s"'`;{}<>=\\]+/).filter((c) => c.length > 1 && c.length < 120))];
}

export async function addonCss(sources: string[]): Promise<string> {
  if (!themeCss) throw new Error("Tokens file not set");
  const theme = await themeCss;
  const compiler = await compile(
    `${LAYOUT_SCALES}\n${theme}\n@layer utilities {\n@tailwind utilities;\n}\n`,
    {
      base: "/",
      loadStylesheet: async () => ({ path: "", base: "/", content: "" }),
    },
  );
  return compiler.build(sources.flatMap(candidates));
}
