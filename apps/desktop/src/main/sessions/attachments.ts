import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatImage } from "../../shared/engine";
import { imageMime } from "../../shared/files";
import { JigError } from "../../shared/ipc";
import { isInside } from "../themes/sources";

/** Image types Claude accepts, and its size limit per image. */
export const CHAT_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;

export interface EngineImage {
  mime: string;
  /** base64 */
  data: string;
}

const SAFE_ID = /^[\w-]+$/;

function sessionDir(root: string, sessionId: string): string {
  if (!SAFE_ID.test(sessionId)) throw new JigError("invalid_args", "Bad session id");
  return join(root, sessionId);
}

function checkType(mime: string | undefined): string {
  const ext = mime ? CHAT_IMAGE_TYPES[mime] : undefined;
  if (!ext) throw new JigError("not_supported", "Claude accepts PNG, JPEG, GIF and WebP images");
  return ext;
}

function tooLarge(): JigError {
  return new JigError("too_large", "The image is larger than 5 MB, the most Claude accepts");
}

/** Saves a pasted/dropped image (base64) or copies an image file into the session's attachments. */
export async function addImage(
  root: string,
  sessionId: string,
  input: { data?: string; mime?: string; path?: string },
): Promise<ChatImage> {
  const dir = sessionDir(root, sessionId);
  await mkdir(dir, { recursive: true });
  if (input.path) {
    const mime = imageMime(input.path);
    const ext = checkType(mime);
    const info = await stat(input.path).catch(() => undefined);
    if (!info?.isFile()) throw new JigError("not_found", `${input.path} doesn't exist`);
    if (info.size > MAX_CHAT_IMAGE_BYTES) throw tooLarge();
    const target = join(dir, `${randomUUID()}.${ext}`);
    await copyFile(input.path, target);
    return { path: target, mime: mime! };
  }
  const ext = checkType(input.mime);
  const bytes = Buffer.from(input.data ?? "", "base64");
  if (bytes.byteLength === 0) throw new JigError("invalid_args", "No image data");
  if (bytes.byteLength > MAX_CHAT_IMAGE_BYTES) throw tooLarge();
  const target = join(dir, `${randomUUID()}.${ext}`);
  await writeFile(target, bytes);
  return { path: target, mime: input.mime! };
}

/** Checks that the images belong to the session and reads them for Claude. */
export async function readImages(
  root: string,
  sessionId: string,
  images: ChatImage[],
): Promise<EngineImage[]> {
  const dir = sessionDir(root, sessionId);
  return Promise.all(
    images.map(async (image) => {
      if (!isInside(image.path, dir))
        throw new JigError("invalid_args", "That image isn't an attachment of this chat");
      checkType(image.mime);
      return { mime: image.mime, data: (await readFile(image.path)).toString("base64") };
    }),
  );
}

export async function removeAttachments(root: string, sessionId: string): Promise<void> {
  await rm(sessionDir(root, sessionId), { recursive: true, force: true });
}
