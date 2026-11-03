import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { files } from "./share";

/**
 * The originals of installed add-ons (D-249): when an add-on comes from a gallery or a `.zip`, Jig
 * keeps a copy of it as it came (`~/.jig/addon-originals/<id>/files`, with `origin.json`). Comparing
 * with it shows that you (or the builder) changed it; restoring puts it back. A built-in add-on needs
 * none: your copy of it is the change, and deleting your copy restores the built-in.
 */
export interface AddonOrigin {
  kind: "gallery" | "import";
  /** The gallery source it was installed from. */
  source?: string;
  version?: string;
  savedAt: string;
}

const folder = (root: string, id: string) => join(root, id);

/** Keeps the add-on folder `dir` as the original of `id`, replacing an older one. */
export async function saveOriginal(
  root: string,
  id: string,
  dir: string,
  origin: Omit<AddonOrigin, "savedAt">,
): Promise<void> {
  const target = folder(root, id);
  await rm(target, { recursive: true, force: true });
  await mkdir(join(target, "files"), { recursive: true });
  for (const f of await files(dir)) {
    await mkdir(join(target, "files", f, ".."), { recursive: true });
    await cp(join(dir, f), join(target, "files", f));
  }
  await writeFile(
    join(target, "origin.json"),
    `${JSON.stringify({ ...origin, savedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

export async function readOrigin(root: string, id: string): Promise<AddonOrigin | undefined> {
  try {
    return JSON.parse(await readFile(join(folder(root, id), "origin.json"), "utf8")) as AddonOrigin;
  } catch {
    return undefined;
  }
}

export async function forgetOriginal(root: string, id: string): Promise<void> {
  await rm(folder(root, id), { recursive: true, force: true });
}

/** Whether the add-on folder differs from its original (a file added, removed or changed). */
export async function isModified(root: string, id: string, dir: string): Promise<boolean> {
  const original = join(folder(root, id), "files");
  const exists = await stat(original).then(
    () => true,
    () => false,
  );
  if (!exists) return false;
  const [mine, theirs] = await Promise.all([files(dir), files(original)]);
  if (mine.length !== theirs.length || mine.some((f, i) => f !== theirs[i])) return true;
  for (const f of mine) {
    const [a, b] = await Promise.all([readFile(join(dir, f)), readFile(join(original, f))]);
    if (!a.equals(b)) return true;
  }
  return false;
}

/** Puts the original back into `dir` (its files only: other files in `dir` are removed). */
export async function restoreOriginal(root: string, id: string, dir: string): Promise<void> {
  const original = join(folder(root, id), "files");
  if (!(await readOrigin(root, id))) throw new Error("Jig has no original of this add-on");
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  await mkdir(dir, { recursive: true });
  await cp(original, dir, { recursive: true });
}
