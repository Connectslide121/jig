import { isAbsolute, relative, resolve, sep } from "node:path";

/** A page Claude published into Jig (D-405). Its files live in `<dataDir>/<id>/v<version>/`. */
export interface Page {
  id: string;
  title: string;
  /** The HTML file to open, relative to the version folder (forward slashes). */
  entry: string;
  version: number;
  /** Versions still on disk, oldest first (the last one is `version`). */
  versions: number[];
  files: number;
  bytes: number;
  /** The chat that published it. */
  chatId?: string;
  chatTitle?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export const LIMITS = {
  /** Files in one version (the page itself included). */
  files: 300,
  /** Bytes in one version. */
  bytes: 25 * 1024 * 1024,
  /** Older versions kept besides the newest. */
  keep: 4,
  title: 120,
};

const HTML_ENTRY = /\.html?$/i;

export const isHtmlName = (name: string) => HTML_ENTRY.test(name);

/**
 * A path inside a page's own folder, written with forward slashes. Absolute paths (`/x`, `\x`, `C:\x`),
 * `..` and empty or NUL-containing paths are refused: a page can only hold what lies under its folder.
 */
export function normalizeRel(input: string): string {
  const raw = input.trim().replaceAll("\\", "/");
  if (!raw || raw.includes("\0")) throw new Error(`Not a usable file path: "${input}"`);
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || isAbsolute(raw))
    throw new Error(`"${input}" is an absolute path: files must be given relative to the page's folder`);
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    if (part === "..") throw new Error(`"${input}" leaves the page's folder (..)`);
    if (part === "" || part === ".") continue;
    parts.push(part);
  }
  if (!parts.length) throw new Error(`Not a usable file path: "${input}"`);
  return parts.join("/");
}

/** Whether `path` is `root` or lies inside it (case-insensitive on Windows). */
export function isInside(path: string, root: string, platform: NodeJS.Platform = process.platform): boolean {
  const fold = (p: string) => (platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  const rel = relative(fold(root), fold(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Whether a page may be read from `file`: inside one of the allowed folders (the chat's, the project's, temp). */
export function readableSource(file: string, roots: string[], platform?: NodeJS.Platform): boolean {
  return roots.some((root) => !!root && isInside(file, root, platform));
}

/**
 * The files an HTML page loads from its own folder (`src`, `href`, `poster`, CSS `url()`, `srcset`),
 * as written. Links to other pages (`<a href>`), absolute URLs, `data:`, `#` anchors and scripts of
 * other origins are left out.
 */
export function referencedPaths(html: string): string[] {
  const found = new Set<string>();
  const add = (value: string) => {
    const v = value.trim().replace(/[?#].*$/, "");
    if (!v || /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(v)) return;
    try {
      found.add(normalizeRel(decodeURIComponent(v)));
    } catch {
      // Not a path in the page's folder: leave it out.
    }
  };
  for (const m of html.matchAll(/<(?:img|script|source|video|audio|track|embed|input|link)\b[^>]*>/gi)) {
    const tag = m[0];
    if (
      /^<link\b/i.test(tag) &&
      !/\brel\s*=\s*["']?(?:stylesheet|icon|shortcut icon|preload|manifest)/i.test(tag)
    )
      continue;
    for (const a of tag.matchAll(/\b(?:src|href|poster|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
      add(a[1] ?? a[2] ?? a[3] ?? "");
    for (const a of tag.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi))
      for (const item of (a[1] ?? a[2] ?? "").split(",")) add(item.trim().split(/\s+/)[0] ?? "");
  }
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi))
    add(m[1] ?? m[2] ?? m[3] ?? "");
  for (const m of html.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) add(m[1] ?? m[2] ?? "");
  return [...found];
}

/** A title for the list: the given one, else the page's `<title>`, else the file's name. */
export function pageTitle(given: string | undefined, html: string, fallback: string): string {
  const fromHtml = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const clean = (s: string | undefined) =>
    (s ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS.title);
  return clean(given) || clean(fromHtml) || clean(fallback) || "Untitled page";
}

/** The versions to delete after adding `latest`: all but the newest `LIMITS.keep + 1`. */
export function versionsToPrune(versions: number[]): number[] {
  const sorted = [...versions].sort((a, b) => a - b);
  return sorted.slice(0, Math.max(0, sorted.length - (LIMITS.keep + 1)));
}

/** Newest first. */
export const byNewest = (a: Page, b: Page) => b.updatedAt.localeCompare(a.updatedAt);
