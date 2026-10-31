import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  ATTACHMENT_LIMITS,
  attachmentType,
  extensionOf,
  limitText,
  officeToText,
  wrapDocument,
} from "@jig/documents";
import type { ChatAttachment } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { isInside } from "../themes/sources";

/**
 * Files attached to a chat message (pasted, dropped or picked), kept in
 * `~/.jig/attachments/<session>/`. On send they become what Claude Code takes: images as image blocks,
 * PDFs as document blocks, Office and text files as text (Office text is extracted by Jig).
 */
export type EnginePart =
  | { type: "image"; mime: string; data: string }
  | { type: "pdf"; name: string; data: string }
  | { type: "text"; name: string; text: string };

const SAFE_ID = /^[\w-]+$/;
const MB = 1024 * 1024;
/** Claude takes at most 32 MB per request. */
const MAX_TOTAL_BYTES = 30 * MB;

function sessionDir(root: string, sessionId: string): string {
  if (!SAFE_ID.test(sessionId)) throw new JigError("invalid_args", "Bad session id");
  return join(root, sessionId);
}

const ADDON_ID = /^[a-z0-9][a-z0-9.-]*$/;

/**
 * Where an add-on keeps files for messages it sends later, before their chat exists
 * (`attachments/addon-<id>/`; a session id never starts with `addon-`).
 */
export function addonAttachmentsDir(root: string, addonId: string): string {
  if (!ADDON_ID.test(addonId)) throw new JigError("invalid_args", "Bad add-on id");
  return join(root, `addon-${addonId}`);
}

function limitFor(kind: ChatAttachment["kind"]): number {
  return kind === "image"
    ? ATTACHMENT_LIMITS.imageBytes
    : kind === "pdf"
      ? ATTACHMENT_LIMITS.pdfBytes
      : ATTACHMENT_LIMITS.fileBytes;
}

const tooLarge = (kind: ChatAttachment["kind"]) =>
  new JigError(
    "too_large",
    kind === "image"
      ? "The image is larger than 5 MB, the most Claude accepts"
      : `The file is larger than ${limitFor(kind) / MB} MB, the most Jig sends to Claude`,
  );

type AttachmentInput = { data?: string; mime?: string; name?: string; path?: string };

/** Saves pasted/dropped bytes (base64) or copies a file into the session's attachments. */
export async function addAttachment(
  root: string,
  sessionId: string,
  input: AttachmentInput,
): Promise<ChatAttachment> {
  return keepFile(sessionDir(root, sessionId), input);
}

/** The same for an add-on: kept until it sends them with `chats.send` (copied into the chat then). */
export async function addAddonAttachment(
  root: string,
  addonId: string,
  input: AttachmentInput,
): Promise<ChatAttachment> {
  return keepFile(addonAttachmentsDir(root, addonId), input);
}

/** An add-on's kept files → copies in the chat's attachments, so the chat keeps them whatever the add-on does. */
export async function copyAddonAttachments(
  root: string,
  addonId: string,
  sessionId: string,
  list: ChatAttachment[],
): Promise<ChatAttachment[]> {
  const from = addonAttachmentsDir(root, addonId);
  const dir = sessionDir(root, sessionId);
  const out: ChatAttachment[] = [];
  for (const a of list) {
    if (typeof a?.path !== "string" || !isInside(a.path, from))
      throw new JigError("invalid_args", "That file isn't an attachment of this add-on");
    const info = await stat(a.path).catch(() => undefined);
    if (!info?.isFile()) throw new JigError("not_found", `${a.name ?? basename(a.path)} is gone`);
    const type = attachmentType(a.name ?? basename(a.path), a.mime);
    if (type.kind === "unsupported") throw new JigError("not_supported", type.reason);
    await mkdir(dir, { recursive: true });
    const target = join(dir, `${randomUUID()}.${extensionOf(a.path) || "bin"}`);
    await copyFile(a.path, target);
    out.push({ path: target, mime: type.mime, name: a.name ?? basename(a.path), kind: type.kind });
  }
  return out;
}

/** Deletes files an add-on kept (only its own). */
export async function removeAddonAttachments(root: string, addonId: string, paths: string[]): Promise<void> {
  const dir = addonAttachmentsDir(root, addonId);
  for (const p of paths)
    if (typeof p === "string" && isInside(p, dir) && p !== dir) await rm(p, { force: true }).catch(() => {});
}

async function keepFile(dir: string, input: AttachmentInput): Promise<ChatAttachment> {
  const name = (input.path ? basename(input.path) : input.name) || "pasted";
  const type = attachmentType(name, input.mime);
  if (type.kind === "unsupported") throw new JigError("not_supported", type.reason);
  let bytes: Buffer;
  if (input.path) {
    const info = await stat(input.path).catch(() => undefined);
    if (!info?.isFile()) throw new JigError("not_found", `${input.path} doesn't exist`);
    if (info.size > limitFor(type.kind)) throw tooLarge(type.kind);
    bytes = await readFile(input.path);
  } else {
    bytes = Buffer.from(input.data ?? "", "base64");
    if (bytes.byteLength === 0) throw new JigError("invalid_args", "The file is empty");
    if (bytes.byteLength > limitFor(type.kind)) throw tooLarge(type.kind);
  }
  if (type.kind === "office") {
    try {
      officeToText(extensionOf(name), bytes);
    } catch (error) {
      throw new JigError("unreadable", `${name}: ${(error as Error).message}`);
    }
  }
  await mkdir(dir, { recursive: true });
  const ext = extensionOf(name) || (type.kind === "image" ? type.mime.split("/")[1] : "txt");
  const target = join(dir, `${randomUUID()}.${ext}`);
  if (input.path) await copyFile(input.path, target);
  else await writeFile(target, bytes);
  return { path: target, mime: type.mime, name, kind: type.kind };
}

/** Checks that the attachments belong to the session and turns them into what Claude Code takes. */
export async function readAttachments(
  root: string,
  sessionId: string,
  list: ChatAttachment[],
): Promise<EnginePart[]> {
  const dir = sessionDir(root, sessionId);
  let total = 0;
  const parts: EnginePart[] = [];
  for (const a of list) {
    if (!isInside(a.path, dir))
      throw new JigError("invalid_args", "That file isn't an attachment of this chat");
    const bytes = await readFile(a.path);
    total += bytes.byteLength;
    if (total > MAX_TOTAL_BYTES)
      throw new JigError(
        "too_large",
        "The attachments add up to more than 30 MB; send them in separate messages",
      );
    const name = a.name ?? basename(a.path);
    const kind = a.kind ?? "image";
    if (kind === "image") parts.push({ type: "image", mime: a.mime, data: bytes.toString("base64") });
    else if (kind === "pdf") parts.push({ type: "pdf", name, data: bytes.toString("base64") });
    else {
      const raw = kind === "office" ? officeToText(extensionOf(name), bytes) : bytes.toString("utf8");
      const { text, truncated } = limitText(raw);
      const note = kind === "office" ? "text extracted by Jig" : truncated ? "cut by Jig" : undefined;
      parts.push({ type: "text", name, text: wrapDocument(name, text, note) });
    }
  }
  return parts;
}

export async function removeAttachments(root: string, sessionId: string): Promise<void> {
  await rm(sessionDir(root, sessionId), { recursive: true, force: true });
}

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Saves images a tool returned (synchronously: tool results are applied in order) and returns them as
 * attachments of the chat. Images over 10 MB or of other types are skipped.
 */
export function saveToolImages(
  root: string,
  sessionId: string,
  toolUseId: string,
  images: Array<{ mime: string; data: string }>,
): ChatAttachment[] {
  const dir = sessionDir(root, sessionId);
  mkdirSync(dir, { recursive: true });
  const safe = toolUseId.replace(/[^\w-]/g, "").slice(0, 60) || "tool";
  const out: ChatAttachment[] = [];
  images.forEach((image, i) => {
    const ext = IMAGE_EXT[image.mime];
    if (!ext || image.data.length > 14 * MB) return;
    const name = `tool-${safe}-${i + 1}.${ext}`;
    writeFileSync(join(dir, name), Buffer.from(image.data, "base64"));
    out.push({ path: join(dir, name), mime: image.mime, name, kind: "image" });
  });
  return out;
}
