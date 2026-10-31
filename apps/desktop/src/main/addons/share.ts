import { lstat, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { type AddonManifest, parseManifest } from "@jig/sdk";
import { unzipSync, zipSync } from "fflate";

/**
 * Sharing add-ons (backlog: "sharing add-ons with colleagues"): an add-on folder as one `.zip`, and a
 * `.zip` back into `~/.jig/addons/<id>` after you've seen its name and permissions. Nothing runs
 * while importing; the add-on loads like any other (its errors show in Settings → Add-ons).
 */
const SKIP = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db"]);
const MAX_BYTES = 20 * 1024 * 1024;
/** Unpacked, all files together: a small zip can claim to hold gigabytes. */
const MAX_UNPACKED = 100 * 1024 * 1024;

/** Every file of an add-on folder (relative, forward slashes), without .git and node_modules. */
async function files(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    // lstat: a link (to a file outside the add-on) is never packed.
    const s = await lstat(full);
    if (s.isDirectory()) out.push(...(await files(full, base)));
    else if (s.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

/** The add-on folder as zip bytes, its files under `<id>/`. */
export async function packAddon(dir: string, id: string): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of await files(dir)) entries[`${id}/${f}`] = new Uint8Array(await readFile(join(dir, f)));
  return zipSync(entries, { level: 6 });
}

export interface AddonPackage {
  id: string;
  name: string;
  version?: string;
  description?: string;
  permissions: string[];
  files: string[];
  manifest?: AddonManifest;
  errors: string[];
}

/** A safe relative path inside the add-on (no `..`, no absolute or drive paths). */
const safe = (p: string) =>
  p.length > 0 &&
  !p.startsWith("/") &&
  !/^[A-Za-z]:/.test(p) &&
  !p.includes("\\") &&
  !p.split("/").includes("..");

/** Reads a package without writing anything: its manifest, files and problems. */
/** Reads a package file, refusing a large one before reading it. */
export async function readPackage(file: string): Promise<Uint8Array> {
  if ((await stat(file)).size > MAX_BYTES) throw new Error("The package is larger than 20 MB");
  return new Uint8Array(await readFile(file));
}

export function inspectPackage(bytes: Uint8Array): {
  pkg: AddonPackage;
  contents: Record<string, Uint8Array>;
} {
  if (bytes.byteLength > MAX_BYTES) throw new Error("The package is larger than 20 MB");
  let raw: Record<string, Uint8Array>;
  try {
    let unpacked = 0;
    raw = unzipSync(bytes, {
      filter: (f) => {
        unpacked += f.originalSize;
        if (unpacked > MAX_UNPACKED) throw new Error("too large");
        return true;
      },
    });
  } catch (error) {
    if ((error as Error).message === "too large") throw new Error("The package unpacks to more than 100 MB");
    throw new Error("This isn't a zip file");
  }
  const names = Object.keys(raw).filter((n) => !n.endsWith("/"));
  if (!names.length) throw new Error("The package is empty");
  // The files may sit in one top folder (an exported add-on) or at the root.
  const top = names.every((n) => n.includes("/")) ? names[0]!.split("/")[0]! : "";
  const contents: Record<string, Uint8Array> = {};
  const errors: string[] = [];
  for (const n of names) {
    const rel = top && n.startsWith(`${top}/`) ? n.slice(top.length + 1) : n;
    if (!safe(rel)) {
      errors.push(`Unsafe path in the package: ${n}`);
      continue;
    }
    contents[rel] = raw[n]!;
  }
  const manifestBytes = contents["addon.json"];
  let manifest: AddonManifest | undefined;
  if (!manifestBytes) errors.push("No addon.json in the package");
  else {
    try {
      const parsed = parseManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
      manifest = parsed.manifest;
      errors.push(...parsed.errors.map((e) => `addon.json: ${e}`));
    } catch {
      errors.push("addon.json isn't valid JSON");
    }
  }
  return {
    pkg: {
      id: manifest?.id ?? top,
      name: manifest?.name ?? top,
      version: manifest?.version,
      description: manifest?.description,
      permissions: manifest?.permissions ?? [],
      files: Object.keys(contents).sort(),
      manifest,
      errors,
    },
    contents,
  };
}

/** Writes a package into `<userDir>/<id>`; an existing add-on is only replaced with `replace`. */
export async function installPackage(
  bytes: Uint8Array,
  userDir: string,
  options: { replace?: boolean } = {},
): Promise<AddonPackage> {
  const { pkg, contents } = inspectPackage(bytes);
  if (pkg.errors.length || !pkg.manifest) throw new Error(pkg.errors.join("\n") || "Not an add-on");
  const dir = join(userDir, pkg.id);
  const exists = await stat(dir).then(
    () => true,
    () => false,
  );
  if (exists && !options.replace) throw new Error(`You already have an add-on "${pkg.id}"`);
  if (exists) await rm(dir, { recursive: true, force: true });
  for (const [rel, data] of Object.entries(contents)) {
    const file = join(dir, ...rel.split("/"));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return pkg;
}
