// Prepares one demo's build: its tokens become CSS, its fonts local @font-face rules, and a CSS entry
// that points Tailwind at the demo's own folder (which may live outside the kit, in a run folder).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildTokens } from "./tokens.ts";

export const KIT_ROOT = path.resolve(import.meta.dirname, "../..");
export const SAMPLE_TOKENS = path.join(KIT_ROOT, "kits/sample/tokens.json");

export interface DemoPaths {
  /** The demo's source folder (demo.tsx, data, screens). */
  demoDir: string;
  /** The tokens it is built with: <demo>/tokens.json, else the sample product kit. */
  tokensPath: string;
  /** Where generated CSS goes (one folder per demo, so demos can build side by side). */
  genDir: string;
}

export function demoPaths(demo: string): DemoPaths {
  const demoDir = path.resolve(demo);
  if (!fs.existsSync(path.join(demoDir, "demo.tsx"))) {
    throw new Error(`${demoDir} is not a demo: it has no demo.tsx (npm run new -- <folder> makes one)`);
  }
  const own = path.join(demoDir, "tokens.json");
  const tokensPath = fs.existsSync(own) ? own : SAMPLE_TOKENS;
  const id = createHash("sha1").update(demoDir).digest("hex").slice(0, 10);
  return { demoDir, tokensPath, genDir: path.join(KIT_ROOT, ".generated", id) };
}

/** A relative CSS path from folder `from` to `to`, with forward slashes. */
export const rel = (from: string, to: string) => {
  const r = path.relative(from, to).split(path.sep).join("/");
  return r.startsWith(".") ? r : `./${r}`;
};

interface FontFiles {
  family: string;
  faces: { file: string; range: string }[];
}

/** Local font files for the families the kit has installed (@fontsource-variable/*), by family name. */
export function installedFonts(): Map<string, FontFiles> {
  const map = new Map<string, FontFiles>();
  const base = path.join(KIT_ROOT, "node_modules/@fontsource-variable");
  if (!fs.existsSync(base)) return map;
  for (const pkg of fs.readdirSync(base)) {
    const dir = path.join(base, pkg);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));
      const unicode = JSON.parse(fs.readFileSync(path.join(dir, "unicode.json"), "utf8")) as Record<string, string>;
      const faces = (["latin", "latin-ext"] as const)
        .map((subset) => ({ file: path.join(dir, "files", `${pkg}-${subset}-wght-normal.woff2`), range: unicode[subset] ?? "" }))
        .filter((f) => fs.existsSync(f.file));
      if (faces.length) map.set(`${meta.family} Variable`, { family: `${meta.family} Variable`, faces });
    } catch {
      // not a font package
    }
  }
  return map;
}

/** @font-face rules for the families the kit has; `from` is the folder the CSS is written to. */
export function fontFaces(families: string[], from: string, fonts = installedFonts()): string {
  const rules: string[] = [];
  for (const name of families) {
    const f = fonts.get(name);
    if (!f) continue;
    for (const face of f.faces) {
      rules.push(
        `@font-face {\n  font-family: "${f.family}";\n  font-style: normal;\n  font-display: block;\n  font-weight: 100 900;\n  src: url("${rel(from, face.file)}") format("woff2-variations");\n  unicode-range: ${face.range};\n}`,
      );
    }
  }
  return rules.join("\n");
}

/** Writes the demo's generated CSS and returns its paths. */
export async function generate(demo: string): Promise<DemoPaths> {
  const paths = demoPaths(demo);
  const tokens = JSON.parse(fs.readFileSync(paths.tokensPath, "utf8"));
  const built = await buildTokens(tokens);
  fs.mkdirSync(paths.genDir, { recursive: true });
  const write = (name: string, text: string) => {
    const file = path.join(paths.genDir, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) fs.writeFileSync(file, text);
  };
  write("tokens.css", built.variables);
  write("fonts.css", fontFaces(built.families, paths.genDir));
  write(
    "demo.css",
    [
      `@import "${rel(paths.genDir, path.join(KIT_ROOT, "src/styles/kit.css"))}";`,
      `@import "./fonts.css";`,
      `@import "./tokens.css";`,
      built.theme,
      `@source "${rel(paths.genDir, paths.demoDir)}";`,
      `@source "${rel(paths.genDir, path.join(KIT_ROOT, "src"))}";`,
      "",
    ].join("\n"),
  );
  return paths;
}
