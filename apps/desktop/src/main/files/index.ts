import { chmod, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { protocol } from "electron";
import { type ImageData, imageMime, MAX_IMAGE_BYTES } from "../../shared/files";
import { JigError } from "../../shared/ipc";
import { handle } from "../ipc/router";
import { projectStore } from "../projects";
import { renameWithRetry } from "../state/jsonStore";
import { isInside } from "../themes/sources";
import { previewFile, serveFile } from "./preview";
import { searchFiles } from "./search";

/** Reads an image file for a preview: image types only, at most 25 MB. */
export async function readImage(path: string): Promise<ImageData> {
  const mime = imageMime(path);
  if (!mime) throw new JigError("not_image", "Only image files can be previewed");
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw new JigError("not_found", `${path} doesn't exist`);
  if (info.size > MAX_IMAGE_BYTES) throw new JigError("too_large", "The image is larger than 25 MB");
  const data = await readFile(path);
  return { dataUrl: `data:${mime};base64,${data.toString("base64")}`, bytes: data.byteLength, mime };
}

/** Folders Jig knows: every workspace (projects' default folders are workspaces too). */
async function knownFolders(): Promise<string[]> {
  return (await projectStore().workspaces()).map((w) => w.path);
}

/** Files opened in Preview this run: they may be saved even outside a workspace. */
const previewed = new Set<string>();

/**
 * Saves a text file from the Preview tab's editor. Only inside a workspace or a file you opened in
 * Preview. With `expectedMtimeMs`, refuses (`changed`) when the file changed on disk since, so an
 * edit by Claude is never overwritten by accident. Written next to the file, then renamed over it.
 */
export async function writeTextFile(
  path: string,
  text: string,
  expectedMtimeMs: number | undefined,
  allowed: (path: string) => boolean | Promise<boolean>,
): Promise<{ size: number; mtimeMs: number }> {
  if (!(await allowed(resolve(path))))
    throw new JigError("not_allowed", "Jig saves files inside your workspaces only");
  // Through a symlink to the file it points at, so the link stays a link.
  const file = await realpath(resolve(path)).catch(() => resolve(path));
  const before = await stat(file).catch(() => undefined);
  if (before && !before.isFile()) throw new JigError("not_a_file", `${file} is not a file`);
  if (expectedMtimeMs !== undefined && before && Math.abs(before.mtimeMs - expectedMtimeMs) > 1)
    throw new JigError("changed", "The file changed on disk since you opened it");
  const temp = join(dirname(file), `.${basename(file)}.jig-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temp, text, "utf8");
    // Keep the file's permissions (an executable script stays executable).
    if (before) await chmod(temp, before.mode & 0o7777);
    await renameWithRetry(temp, file).catch(async (error: NodeJS.ErrnoException) => {
      // Windows can't replace a file another program holds open (an editor, a log viewer, a
      // scanner), but it can often still write into it, as VS Code does.
      if (!before || !["EPERM", "EBUSY", "EACCES"].includes(error.code ?? "")) throw error;
      await writeFile(file, text, "utf8");
      await rm(temp, { force: true });
    });
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw new JigError("write_failed", `Couldn't save ${file}: ${(error as Error).message}`);
  }
  const after = await stat(file);
  return { size: after.size, mtimeMs: after.mtimeMs };
}

export function registerFileHandlers(): void {
  handle("files.image", ({ path }) => readImage(path));
  protocol.handle("jig-file", serveFile);
  handle("files.preview", async ({ path }) => {
    const preview = await previewFile(path, await knownFolders());
    previewed.add(resolve(path));
    return preview;
  });
  handle("files.write", async ({ path, text, expectedMtimeMs }) =>
    writeTextFile(path, text, expectedMtimeMs, async (file) => {
      if (previewed.has(file)) return true;
      return (await knownFolders()).some((root) => isInside(file, root));
    }),
  );
  handle("files.search", async ({ root, query, limit }) => {
    const projects = await knownFolders();
    if (!projects.some((p) => isInside(root, p)))
      throw new JigError("invalid_args", "Search works inside your projects only");
    return searchFiles(root, query, Math.min(limit ?? 50, 200));
  });
  handle("files.stat", async ({ path }) => {
    const info = await stat(path).catch(() => undefined);
    return info?.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null;
  });
}
