import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { type AddonManifest, parseManifest } from "@jig/sdk";
import { parseJsonc } from "@jig/themes";

/**
 * Finds add-ons: folders with an `addon.json`, in Jig's built-in `addons/` and in `~/.jig/addons`.
 * A user add-on with the same id as a built-in one replaces it (that is how the builder changes a
 * built-in add-on: it copies it into your add-ons and edits the copy).
 */
export interface AddonRecord {
  id: string;
  dir: string;
  source: "builtin" | "user";
  overridesBuiltin?: boolean;
  manifest?: AddonManifest;
  errors: string[];
  uiEntry?: string;
  hostEntry?: string;
  readme?: string;
}

const UI_FILES = ["ui.tsx", "ui.ts", "ui.jsx", "ui.js"];
const HOST_FILES = ["host.ts", "host.js", "host.mjs"];

async function firstExisting(dir: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    const path = join(dir, name);
    if (
      await stat(path).then(
        (s) => s.isFile(),
        () => false,
      )
    )
      return path;
  }
  return undefined;
}

export async function readAddon(
  dir: string,
  source: AddonRecord["source"],
): Promise<AddonRecord | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(dir, "addon.json"), "utf8");
  } catch {
    return undefined;
  }
  const folder = dir.replaceAll("\\", "/").split("/").pop()!;
  let json: unknown;
  try {
    json = parseJsonc(raw);
  } catch (error) {
    return { id: folder, dir, source, errors: [`addon.json is not valid JSON: ${(error as Error).message}`] };
  }
  const { manifest, errors } = parseManifest(json);
  const [uiEntry, hostEntry, readme] = await Promise.all([
    firstExisting(dir, UI_FILES),
    firstExisting(dir, HOST_FILES),
    readFile(join(dir, "README.md"), "utf8").catch(() => undefined),
  ]);
  return {
    id:
      manifest?.id ??
      (typeof (json as { id?: unknown })?.id === "string" ? (json as { id: string }).id : folder),
    dir,
    source,
    manifest,
    errors,
    uiEntry,
    hostEntry,
    readme: readme?.slice(0, 4000),
  };
}

async function scanDir(root: string, source: AddonRecord["source"]): Promise<AddonRecord[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const records = await Promise.all(
    entries
      .filter((e) => !e.startsWith(".") && e !== "node_modules")
      .map(async (e) => {
        const dir = join(root, e);
        if (
          !(await stat(dir).then(
            (s) => s.isDirectory(),
            () => false,
          ))
        )
          return undefined;
        return readAddon(dir, source);
      }),
  );
  return records.filter((r): r is AddonRecord => r !== undefined);
}

export async function scanAddons(builtinDir: string | undefined, userDir: string): Promise<AddonRecord[]> {
  const [builtin, user] = await Promise.all([
    builtinDir ? scanDir(builtinDir, "builtin") : [],
    scanDir(userDir, "user"),
  ]);
  const byId = new Map<string, AddonRecord>();
  for (const record of builtin) byId.set(record.id, record);
  for (const record of user) {
    const existing = byId.get(record.id);
    if (existing?.source === "user") {
      record.errors = [
        ...record.errors,
        `Another add-on in ${existing.dir} already uses the id "${record.id}"`,
      ];
      byId.set(`${record.id}@${record.dir}`, record);
      continue;
    }
    byId.set(record.id, { ...record, overridesBuiltin: existing?.source === "builtin" || undefined });
  }
  return [...byId.values()].sort((a, b) =>
    (a.manifest?.name ?? a.id).localeCompare(b.manifest?.name ?? b.id),
  );
}
