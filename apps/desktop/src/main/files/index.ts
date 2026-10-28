import { readFile, stat } from "node:fs/promises";
import { protocol } from "electron";
import { type ImageData, imageMime, MAX_IMAGE_BYTES } from "../../shared/files";
import { JigError } from "../../shared/ipc";
import { handle } from "../ipc/router";
import { projectStore } from "../projects";
import { previewFile, serveFile } from "./preview";

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

export function registerFileHandlers(): void {
  handle("files.image", ({ path }) => readImage(path));
  protocol.handle("jig-file", serveFile);
  handle("files.preview", async ({ path }) =>
    previewFile(
      path,
      (await projectStore().list()).map((p) => p.path),
    ),
  );
  handle("files.stat", async ({ path }) => {
    const info = await stat(path).catch(() => undefined);
    return info?.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null;
  });
}
