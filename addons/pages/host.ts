import { randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import {
  byNewest,
  isHtmlName,
  isInside,
  LIMITS,
  normalizeRel,
  type Page,
  pageTitle,
  readableSource,
  referencedPaths,
  versionsToPrune,
} from "./lib/pages";

/**
 * Pages (D-405): Jig's own artifacts. Claude publishes a self-contained HTML page (and the files it loads)
 * and Jig keeps it in its own state, `<dataDir>/<id>/v<n>/`, lists it and previews it in the Preview tab
 * (sandboxed, scripts off). Nothing is uploaded anywhere. The list is `pages` in this add-on's storage.
 */
const KEY = "pages";
const ID = /^p_[a-f0-9]{10}$/;
const SKIP_DIRS = new Set(["node_modules", ".git"]);

interface ToolChat {
  cwd?: string;
  projectId?: string;
  sessionId?: string;
}

// One publish at a time: each rewrites the list in storage.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
};

const pageId = (id: string): string => {
  if (!ID.test(id)) throw new Error(`"${id}" isn't a page id (they look like p_0123456789)`);
  return id;
};
const versionDir = (api: AddonHostApi, id: string, version: number) =>
  join(api.addon.dataDir, pageId(id), `v${version}`);

async function read(api: AddonHostApi): Promise<Page[]> {
  return (await api.storage.get<Page[]>(KEY)) ?? [];
}

async function write(api: AddonHostApi, pages: Page[]): Promise<void> {
  await api.storage.set(KEY, pages);
  api.emit("changed", {});
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Every file under `dir` (relative, forward slashes), and the sizes. */
async function walk(dir: string, base = dir): Promise<Array<{ rel: string; bytes: number }>> {
  const out: Array<{ rel: string; bytes: number }> = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      out.push({ rel: full.slice(base.length + 1).replaceAll("\\", "/"), bytes: (await stat(full)).size });
    }
  }
  return out;
}

function tooMany(files: number, bytes: number): string | undefined {
  if (files > LIMITS.files) return `a page holds at most ${LIMITS.files} files (this one has ${files})`;
  if (bytes > LIMITS.bytes)
    return `a page holds at most ${Math.round(LIMITS.bytes / 1048576)} MB (this one has ${(bytes / 1048576).toFixed(1)} MB)`;
  return undefined;
}

/** The folders a page may be read from: the chat's, its project's, and the system temp folder. */
async function sourceRoots(chat: ToolChat | undefined, api: AddonHostApi): Promise<string[]> {
  const project = chat?.projectId ? (await api.projects()).find((p) => p.id === chat.projectId) : undefined;
  const roots = [chat?.cwd, project?.path, ...(project?.repos.map((r) => r.path) ?? []), tmpdir()];
  const real = await Promise.all(
    roots.filter(Boolean).map((r) => realpath(r as string).catch(() => undefined)),
  );
  return real.filter((r): r is string => !!r);
}

export interface PublishArgs {
  title?: string;
  /** Path to the HTML file (absolute, or relative to the chat's folder). */
  file?: string;
  /** The page's HTML itself, instead of `file`. */
  html?: string;
  /** Files and folders next to the page, relative to its folder. */
  files?: string[];
  /** The page to update. */
  id?: string;
  chat?: ToolChat;
}

/** Copies what the page needs into `into`, and returns the files it left out. */
async function collect(
  api: AddonHostApi,
  args: PublishArgs,
  into: string,
): Promise<{ entry: string; html: string; skipped: string[]; fallbackTitle: string }> {
  const chat = args.chat;
  const roots = await sourceRoots(chat, api);
  if (!!args.file === (args.html !== undefined))
    throw new Error(
      "Give either `file` (an HTML file) or `html` (the page itself), not both and not neither",
    );
  let base: string;
  let entry: string;
  let html: string;
  if (args.file) {
    const abs = resolve(chat?.cwd ?? process.cwd(), args.file);
    if (!isHtmlName(abs)) throw new Error(`"${args.file}" isn't an HTML file (.html or .htm)`);
    const real = await realpath(abs).catch(() => {
      throw new Error(`"${args.file}" doesn't exist`);
    });
    if (!readableSource(real, roots))
      throw new Error(
        `"${args.file}" is outside this chat's folder, its project and the temp folder: write the page there first`,
      );
    base = dirname(real);
    entry = basename(real);
    html = await readFile(real, "utf8");
  } else {
    base = await realpath(chat?.cwd ?? process.cwd()).catch(() => chat?.cwd ?? process.cwd());
    entry = "index.html";
    html = args.html ?? "";
  }
  if (!html.trim()) throw new Error("The page is empty");

  const wanted = new Map<string, boolean>(); // rel path → explicit
  for (const f of args.files ?? []) wanted.set(normalizeRel(f), true);
  for (const f of referencedPaths(html)) if (!wanted.has(f)) wanted.set(f, false);
  wanted.delete(entry);

  const skipped: string[] = [];
  let count = 1;
  let bytes = Buffer.byteLength(html);
  await writeFile(join(into, entry), html, "utf8");
  for (const [rel, explicit] of wanted) {
    const abs = resolve(base, rel);
    const real = await realpath(abs).catch(() => undefined);
    if (!real || !isInside(real, base)) {
      if (explicit)
        throw new Error(
          real ? `"${rel}" is outside the page's folder` : `"${rel}" doesn't exist next to the page`,
        );
      skipped.push(rel);
      continue;
    }
    const info = await stat(real);
    const items = info.isDirectory()
      ? (await walk(real)).map((f) => ({ from: join(real, f.rel), to: `${rel}/${f.rel}`, bytes: f.bytes }))
      : [{ from: real, to: rel, bytes: info.size }];
    for (const item of items) {
      const target = join(into, item.to);
      if (!isInside(target, into)) throw new Error(`"${item.to}" leaves the page's folder`);
      count += 1;
      bytes += item.bytes;
      const problem = tooMany(count, bytes);
      if (problem) throw new Error(`Too big: ${problem}`);
      await mkdir(dirname(target), { recursive: true });
      await cp(item.from, target);
    }
  }
  return {
    entry,
    html,
    skipped,
    fallbackTitle: args.file ? basename(args.file).replace(/\.html?$/i, "") : "",
  };
}

async function chatTitleOf(chat: ToolChat | undefined, api: AddonHostApi): Promise<string | undefined> {
  if (!chat?.sessionId) return undefined;
  return api.chats
    .get(chat.sessionId)
    .then((c) => c.title)
    .catch(() => undefined);
}

/** Publishes a page, or a new version of one. Returns what Claude is told. */
export async function publish(args: PublishArgs, api: AddonHostApi): Promise<string> {
  return serial(async () => {
    const pages = await read(api);
    const previous = args.id ? pages.find((p) => p.id === pageId(args.id as string)) : undefined;
    if (args.id && !previous)
      throw new Error(
        `No page ${args.id}. Pages: ${pages.map((p) => `${p.id} (${p.title})`).join(", ") || "(none yet)"}`,
      );
    const id = previous?.id ?? `p_${randomBytes(5).toString("hex")}`;
    const version = (previous?.version ?? 0) + 1;
    const root = join(api.addon.dataDir, id);
    const staging = join(root, `v${version}.tmp`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      // An update carries over what it doesn't bring again (images next to an unchanged page).
      if (previous) await cp(versionDir(api, id, previous.version), staging, { recursive: true });
      const { entry, html, skipped, fallbackTitle } = await collect(api, args, staging);
      const all = await walk(staging);
      const problem = tooMany(
        all.length,
        all.reduce((n, f) => n + f.bytes, 0),
      );
      if (problem) throw new Error(`Too big: ${problem}`);
      await rename(staging, versionDir(api, id, version));

      const now = new Date().toISOString();
      const chat = args.chat;
      const page: Page = {
        id,
        title: args.title?.trim()
          ? pageTitle(args.title, html, fallbackTitle)
          : (previous?.title ?? pageTitle(undefined, html, fallbackTitle)),
        entry,
        version,
        versions: [...(previous?.versions ?? []), version],
        files: all.length,
        bytes: all.reduce((n, f) => n + f.bytes, 0),
        chatId: chat?.sessionId ?? previous?.chatId,
        chatTitle: (await chatTitleOf(chat, api)) ?? previous?.chatTitle,
        projectId: chat?.projectId ?? previous?.projectId,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      const pruned = versionsToPrune(page.versions);
      for (const old of pruned) await rm(versionDir(api, id, old), { recursive: true, force: true });
      page.versions = page.versions.filter((v) => !pruned.includes(v));
      await write(api, [page, ...pages.filter((p) => p.id !== id)]);
      return JSON.stringify({
        page: id,
        title: page.title,
        version,
        updated: !!previous,
        entry,
        files: page.files,
        ...(skipped.length ? { notIncluded: skipped } : {}),
        message: `${previous ? "Updated" : "Published"} "${page.title}" in Jig's Pages${skipped.length ? `; not found next to the page: ${skipped.join(", ")}` : ""}. The user can open it from the card in this chat or from the Pages view.`,
      });
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (!previous) await rm(root, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });
}

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

/** The pages, newest first, for Claude. */
export async function toolList(_args: Record<string, never>, api: AddonHostApi): Promise<string> {
  const pages = (await read(api)).sort(byNewest);
  if (!pages.length) return "No pages yet. Publish one with addon_pages_publish.";
  return pages
    .map(
      (p) =>
        `- ${p.id}: "${p.title}", version ${p.version}, ${p.files} file${p.files === 1 ? "" : "s"}, updated ${when(p.updatedAt)}${p.chatTitle ? `, from the chat "${p.chatTitle}"` : ""}`,
    )
    .join("\n");
}

/** A page's HTML (and its file list), to continue from it. */
export async function toolRead(args: { id: string }, api: AddonHostApi): Promise<string> {
  const id = pageId(args.id);
  const page = (await read(api)).find((p) => p.id === id);
  if (!page) throw new Error(`No page ${args.id}`);
  const dir = versionDir(api, page.id, page.version);
  const html = await readFile(join(dir, page.entry), "utf8");
  const limit = 200_000;
  return [
    `Page ${page.id} "${page.title}", version ${page.version}, entry ${page.entry}`,
    `Files: ${(await walk(dir)).map((f) => f.rel).join(", ")}`,
    "",
    html.length > limit ? `${html.slice(0, limit)}\n… (cut at ${limit} characters)` : html,
  ].join("\n");
}

// What the Pages view calls.

/** Titles of the chats follow renames; a chat that is gone keeps the title it had. */
export async function list(_args: undefined, api: AddonHostApi): Promise<Page[]> {
  const pages = (await read(api)).sort(byNewest);
  const titles = new Map<string, string | undefined>();
  await Promise.all(
    [...new Set(pages.map((p) => p.chatId).filter((c): c is string => !!c))].map(async (c) =>
      titles.set(c, await chatTitleOf({ sessionId: c }, api)),
    ),
  );
  return pages.map((p) => ({ ...p, chatTitle: (p.chatId && titles.get(p.chatId)) || p.chatTitle }));
}

/** Where a page's files are (for Preview, the browser and Show in folder), and what it holds. */
export async function where(
  args: { id: string; version?: number },
  api: AddonHostApi,
): Promise<{
  file: string;
  dir: string;
  title: string;
  version: number;
  latest: number;
  files: number;
  bytes: number;
  updatedAt: string;
}> {
  const id = pageId(args.id);
  const page = (await read(api)).find((p) => p.id === id);
  if (!page) throw new Error("That page is gone");
  const version = args.version && page.versions.includes(args.version) ? args.version : page.version;
  const dir = versionDir(api, page.id, version);
  if (!(await exists(join(dir, page.entry)))) throw new Error("The page's files are missing");
  // Counted from the folder: an older version holds what it held then.
  const held = version === page.version ? { files: page.files, bytes: page.bytes } : await sizeOf(dir);
  return {
    file: join(dir, page.entry),
    dir,
    title: page.title,
    version,
    latest: page.version,
    ...held,
    updatedAt: page.updatedAt,
  };
}

async function sizeOf(dir: string): Promise<{ files: number; bytes: number }> {
  const all = await walk(dir);
  return { files: all.length, bytes: all.reduce((n, f) => n + f.bytes, 0) };
}

export async function retitle(args: { id: string; title: string }, api: AddonHostApi): Promise<void> {
  const title = args.title.replace(/\s+/g, " ").trim().slice(0, LIMITS.title);
  if (!title) throw new Error("A page needs a title");
  await serial(async () => {
    const pages = await read(api);
    const id = pageId(args.id);
    const page = pages.find((p) => p.id === id);
    if (!page) throw new Error("That page is gone");
    page.title = title;
    await write(api, pages);
  });
}

export async function remove(args: { id: string }, api: AddonHostApi): Promise<void> {
  await serial(async () => {
    const pages = await read(api);
    const id = pageId(args.id);
    if (!pages.some((p) => p.id === id)) return;
    await write(
      api,
      pages.filter((p) => p.id !== id),
    );
    await rm(join(api.addon.dataDir, id), { recursive: true, force: true });
  });
}
