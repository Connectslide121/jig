import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { docxToText, pptxToText, xlsxToSheets } from "@jig/documents";
import { JigError } from "../../shared/ipc";
import { type FilePreview, MAX_PREVIEW_TEXT, previewKind } from "../../shared/preview";
import { isInside } from "../themes/sources";

/**
 * `jig-file://<grant>/<path>` serves files for previews. A grant is a folder the user asked to preview
 * something in (the file's project, else its folder); only files inside it are served, so a previewed
 * HTML page can load its own CSS and images, but nothing else on disk.
 */
const grants = new Map<string, string>();
const grantOf = new Map<string, string>();

export function grantFolder(root: string): string {
  const folder = resolve(root);
  let token = grantOf.get(folder);
  if (!token) {
    token = randomBytes(12).toString("hex");
    grants.set(token, folder);
    grantOf.set(folder, token);
  }
  return token;
}

const encodePath = (rel: string) => rel.split(sep).map(encodeURIComponent).join("/");

/** The file a `jig-file:` URL points to, if its grant allows it. */
export function resolveFileUrl(url: string): string | undefined {
  const u = new URL(url);
  const root = grants.get(u.hostname);
  if (!root) return undefined;
  const file = resolve(root, ...decodeURIComponent(u.pathname).split("/").filter(Boolean));
  return isInside(file, root) ? file : undefined;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

/**
 * Serves a granted file, with Range support (seeking in audio and video). HTML pages get a CSP that
 * lets them load only from their own folder; scripts run only when the preview's iframe allows them
 * (it never gets same-origin access, so a page can't reach Jig).
 */
export async function serveFile(request: Request): Promise<Response> {
  const file = resolveFileUrl(request.url);
  if (!file) return new Response("Forbidden", { status: 403 });
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "content-security-policy":
      "default-src jig-file: data: blob:; script-src jig-file: 'unsafe-inline'; style-src jig-file: 'unsafe-inline'; connect-src 'none'; frame-ancestors jig-app: http://localhost:*",
    "cache-control": "no-cache",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && info.size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${info.size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${info.size}`,
        "content-length": String(end - start + 1),
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "content-length": String(info.size) } });
}

/** Whether the start of a file looks like text (no NUL bytes in the first 8 KB). */
async function looksLikeText(path: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(8192), 0, 8192, 0);
    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

const TEXT_KINDS = new Set(["markdown", "html", "csv", "json", "notebook", "svg", "mermaid", "diff", "text"]);
const OFFICE_LIMIT = 60 * 1024 * 1024;

/**
 * What the Preview tab needs for a file. `roots` are the project folders: a file inside one gets a
 * grant for the whole project (Markdown and HTML often link `../images/…`), else for its own folder.
 */
export async function previewFile(path: string, roots: string[]): Promise<FilePreview> {
  const file = resolve(path);
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) throw new JigError("not_found", `${path} doesn't exist`);
  const root = roots.map((r) => resolve(r)).find((r) => isInside(file, r)) ?? dirname(file);
  const token = grantFolder(root);
  const rel = relative(root, file);
  const relDir = relative(root, dirname(file));
  const kind = previewKind(file);
  const preview: FilePreview = {
    path: file,
    name: basename(file),
    kind,
    size: info.size,
    mtimeMs: info.mtimeMs,
    url: `jig-file://${token}/${encodePath(rel)}`,
    baseUrl: `jig-file://${token}/${relDir ? `${encodePath(relDir)}/` : ""}`,
  };
  if (TEXT_KINDS.has(kind)) {
    if (kind === "text" && !(await looksLikeText(file))) return { ...preview, binary: true };
    const handle = await open(file, "r");
    try {
      const length = Math.min(info.size, MAX_PREVIEW_TEXT);
      const { buffer } = await handle.read(Buffer.alloc(length), 0, length, 0);
      preview.text = buffer.toString("utf8");
      preview.truncated = info.size > MAX_PREVIEW_TEXT;
    } finally {
      await handle.close();
    }
  } else if (kind === "word" || kind === "slides" || kind === "spreadsheet") {
    if (info.size > OFFICE_LIMIT) throw new JigError("too_large", "The file is larger than 60 MB");
    const bytes = new Uint8Array(await readFile(file));
    if (kind === "spreadsheet") preview.sheets = xlsxToSheets(bytes);
    else preview.document = kind === "word" ? docxToText(bytes) : pptxToText(bytes);
  }
  return preview;
}
