import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import { checkTokens, uiExports } from "@jig/sdk";
import { build } from "esbuild";
import { bundleHost, bundleUi, SHARED_UI_MODULES } from "../addons/bundle";
import { readAddon } from "../addons/catalog";

/**
 * Checks an add-on folder before you see it: manifest schema, UI and host bundles build, every export
 * the manifest names exists, design tokens only, a README. Problems go back to the builder to fix.
 */
export interface Validation {
  ok: boolean;
  problems: string[];
  addonId?: string;
  permissions: string[];
}

async function uiExportNames(entry: string): Promise<string[]> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    metafile: true,
    jsx: "automatic",
    logLevel: "silent",
    external: SHARED_UI_MODULES,
    outdir: "out",
  });
  return Object.values(result.metafile.outputs).flatMap((o) => o.exports ?? []);
}

export async function validateAddon(dir: string, nodePaths: string[]): Promise<Validation> {
  const record = await readAddon(dir, "user");
  if (!record)
    return { ok: false, problems: ["There is no addon.json in the add-on folder."], permissions: [] };
  const problems = [...record.errors];
  const manifest = record.manifest;
  if (!record.readme?.trim()) problems.push("README.md is missing: explain what the add-on does and why.");
  if (manifest) {
    const needed = uiExports(manifest);
    if (record.uiEntry) {
      const ui = await bundleUi(record.uiEntry);
      problems.push(...ui.errors.map((e) => `ui.tsx: ${e}`));
      if (ui.errors.length === 0) {
        for (const file of ui.inputs) {
          const source = await readFile(file, "utf8").catch(() => "");
          const rel = relative(dir, file).split(sep).join("/");
          for (const v of checkTokens(source))
            problems.push(`${rel}:${v.line}:${v.column} ${v.match} — ${v.message}`);
        }
        const exported = new Set(await uiExportNames(record.uiEntry).catch(() => [] as string[]));
        for (const name of needed)
          if (!exported.has(name))
            problems.push(`addon.json refers to "${name}", but ui.tsx has no export with that name.`);
      }
    } else if (needed.length) problems.push("addon.json refers to UI components but there is no ui.tsx.");
    if (record.hostEntry) {
      const host = await bundleHost(record.hostEntry, nodePaths);
      problems.push(...host.errors.map((e) => `host.ts: ${e}`));
    } else if (manifest.contributes.watchers.length)
      problems.push("addon.json has watchers but there is no host.ts.");
  }
  return {
    ok: problems.length === 0,
    problems,
    addonId: record.id,
    permissions: manifest?.permissions ?? [],
  };
}
