import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "@jig/themes";
import { app, dialog, protocol, utilityProcess } from "electron";
import type { AddonInfo } from "../../shared/addons";
import { JigError } from "../../shared/ipc";
import { appWindows } from "../appWindows";
import { getConfig } from "../config";
import { card } from "../configure/tools";
import {
  registerJigTools,
  setAddonSummary,
  setAddonTools,
  setAddonTurnContext,
  setJigToolHandlers,
} from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { projectStore } from "../projects";
import { mimeFor } from "../protocols";
import { createChat, onSessionStatus, sessionManager } from "../sessions";
import { paths } from "../state/paths";
import { fileEntry, type ThemeEntry } from "../themes/sources";
import { addonChats } from "./chats";
import { addonContext, addonDataTools, addonTools } from "./claudeTools";
import { setTokensFile } from "./css";
import { galleryRecords, readGallery, sourceFolder } from "./gallery";
import type { HostChannel } from "./hostProcess";
import type { FromHost } from "./hostRuntime";
import { commitAll } from "./repo";
import { AddonService } from "./service";
import { inspectPackage, installPackage, packAddon, readPackage } from "./share";

const log = logger("addons");
const here = dirname(fileURLToPath(import.meta.url));

let service: AddonService | undefined;
let latest: AddonInfo[] = [];
const changeListeners = new Set<(addons: AddonInfo[]) => void>();

export function addonService(): AddonService {
  if (!service) throw new Error("Add-ons not started");
  return service;
}

export function onAddonsChange(listener: (addons: AddonInfo[]) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/** Jig's own add-ons: `addons/` in the repository (dev) or in the app's resources (installed). */
export function builtinAddonsDir(): string | undefined {
  if (process.env.JIG_BUILTIN_ADDONS) return process.env.JIG_BUILTIN_ADDONS || undefined;
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, "addons")]
    : [join(here, "..", "..", "..", "..", "addons")];
  return candidates.find((c) => existsSync(c));
}

function utilityHost(addonId: string): HostChannel {
  const child = utilityProcess.fork(join(here, "addon-host.mjs"), [], {
    serviceName: `Jig add-on ${addonId}`,
    stdio: "pipe",
  });
  child.stdout?.on("data", (d: Buffer) => log.debug(`[${addonId}] ${d.toString().trimEnd()}`));
  child.stderr?.on("data", (d: Buffer) => log.warn(`[${addonId}] ${d.toString().trimEnd()}`));
  return {
    send: (message) => child.postMessage(message),
    onMessage: (listener) => child.on("message", (message: FromHost) => listener(message)),
    onExit: (listener) => child.on("exit", listener),
    kill: () => child.kill(),
  };
}

/** Themes contributed by enabled add-ons (`contributes.themes`). */
export async function addonThemes(): Promise<ThemeEntry[]> {
  return latest
    .filter((a) => a.enabled && a.errors.length === 0)
    .flatMap((a) =>
      (a.manifest?.contributes.themes ?? []).map((t) => {
        const file = join(a.dir, t.path);
        const label =
          t.label ??
          t.path
            .split("/")
            .pop()!
            .replace(/\.jsonc?$/, "");
        return fileEntry(file, `addon:${a.id}/${slugify(label)}`, label, { kind: "user", file }, a.dir);
      }),
    );
}

export function installAddonProtocol(): void {
  protocol.handle("jig-addon", async (request) => {
    const url = new URL(request.url);
    const id = url.hostname;
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const s = service;
    const headers = (type: string) => ({ "content-type": type, "cache-control": "no-store" });
    if (!s) return new Response("Not ready", { status: 503 });
    if (path === "ui.js") {
      const ui = s.ui(id);
      return ui
        ? new Response(ui.code, { headers: headers("text/javascript; charset=utf-8") })
        : new Response("Not found", { status: 404 });
    }
    if (path === "ui.css") {
      const ui = s.ui(id);
      return ui
        ? new Response(ui.css, { headers: headers("text/css; charset=utf-8") })
        : new Response("", { status: 404 });
    }
    // Other files of the add-on folder (images, …), read-only and never outside it.
    const addon = s.list().find((a) => a.id === id);
    if (!addon) return new Response("Not found", { status: 404 });
    const file = normalize(join(addon.dir, path));
    if (!file.startsWith(addon.dir + sep) || /\.(ts|tsx|mjs|js)$/.test(file))
      return new Response("Forbidden", { status: 403 });
    try {
      return new Response(await readFile(file), { headers: headers(mimeFor(file)) });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

/** Where add-on host code resolves `@jig/sdk` and friends from. */
export function addonNodePaths(): string[] {
  return [join(here, "..", "..", "node_modules"), join(here, "..", "..", "..", "..", "node_modules")];
}

export async function startAddons(): Promise<void> {
  const tokens = [
    join(here, "tokens.css"),
    join(here, "..", "..", "src", "renderer", "styles", "tokens.css"),
  ].find((p) => existsSync(p));
  if (tokens) setTokensFile(tokens);
  else log.warn("tokens.css not found; add-on CSS will be empty");

  const chats = addonChats({
    // Checked here too: the host process enforces it, but main doesn't trust it.
    hasPermission: (id) =>
      !!service
        ?.list()
        .find((a) => a.id === id)
        ?.manifest?.permissions.includes("chat"),
    create: (input) => createChat(input),
    send: (sessionId, text) => sessionManager().send(sessionId, text),
    snapshot: (sessionId) => sessionManager().snapshot(sessionId),
    notify: (id, change) => addonService().call(id, "chatChanged", change),
  });
  onSessionStatus((meta) => chats.statusChanged(meta));

  service = new AddonService({
    builtinDir: builtinAddonsDir(),
    userDir: paths.addons(),
    cacheDir: paths.cache(),
    dataDir: paths.addonData(),
    stateFile: paths.addonsState(),
    nodePaths: addonNodePaths(),
    hostFactory: utilityHost,
    safeMode: process.env.JIG_SAFE_MODE === "1",
    rpc: (addonId) => async (op, args) => {
      if (op === "notify") {
        const n = args as {
          title: string;
          message?: string;
          tone?: "info" | "success" | "warning" | "danger";
        };
        emit("notify", { title: n.title, message: n.message, tone: n.tone });
      } else if (op === "emit") {
        const { topic, payload } = args as { topic: string; payload: unknown };
        emit("addons.event", { id: addonId, topic, payload });
      } else if (op === "projects") {
        return (await projectStore().state()).projects;
      } else if (op === "workspaces") {
        return (await projectStore().state()).workspaces;
      } else if (op === "chats.create") {
        return chats.create(addonId, args as never);
      } else if (op === "chats.send") {
        return chats.send(addonId, args as never);
      } else if (op === "chats.get") {
        return chats.get(addonId, (args as { sessionId: string }).sessionId);
      } else if (op === "log") {
        const { message, detail } = args as { message: string; detail?: unknown };
        log.info(`[${addonId}] ${message}`, detail);
      }
      return undefined;
    },
    onChange: (addons) => {
      latest = addons;
      emit("addons.changed", addons);
      // Add-ons' tools for Claude follow the add-ons (new chats get the current set).
      setAddonTools(addonTools(addons, (id, method, args) => addonService().call(id, method, args)));
      for (const listener of changeListeners) listener(addons);
    },
  });
  const s = service;
  await s.start();
  s.watchFiles();
  setJigToolHandlers({ listAddons: async () => s.catalog() });
  setAddonTools(addonTools(s.list(), (id, method, args) => s.call(id, method, args)));
  setAddonTurnContext((meta) =>
    addonContext(s.list(), (id, method, args) => s.call(id, method, args), {
      cwd: meta.cwd,
      projectId: meta.projectId,
      sessionId: meta.id,
    }),
  );
  setAddonSummary(() =>
    s
      .list()
      .filter((a) => a.enabled && a.errors.length === 0)
      .map((a) => `- ${a.name}: ${(a.description ?? "").split(". ")[0]}`)
      .join("\n"),
  );
  registerJigTools(
    addonDataTools({
      list: () => s.list(),
      all: (id) => s.storageAll(id),
      set: (id, key, value) => s.storageSet(id, key, value),
      remove: (id, key) => s.storageDelete(id, key),
      changed: (id, key) => emit("addons.event", { id, topic: "storage", payload: { key } }),
      addCard: (sessionId, item) => sessionManager().addItem(sessionId, item),
      card,
    }),
  );

  handle("addons.list", () => s.list());
  handle("addons.setEnabled", ({ id, enabled }) => s.setEnabled(id, enabled));
  handle("addons.call", ({ id, method, args }) => s.call(id, method, args));
  handle("addons.storageGet", ({ id, key }) => s.storageGet(id, key));
  handle("addons.storageSet", ({ id, key, value }) => s.storageSet(id, key, value));
  handle("addons.reload", async ({ id }) => {
    if (id) await s.reload(id);
    else await s.reloadAll();
  });
  handle("addons.history", ({ id }) => s.history(id));
  handle("addons.rollback", ({ id, commit }) => s.rollback(id, commit));
  handle("addons.remove", ({ id }) => s.remove(id));

  // Sharing: an add-on as a .zip, and a .zip back in (after you've seen what it is).
  const window = () => appWindows().find((w) => w.isFocused()) ?? appWindows()[0];
  handle("addons.export", async ({ id }) => {
    const addon = s.list().find((a) => a.id === id);
    if (!addon) throw new JigError("not_found", "No such add-on");
    const options = {
      title: `Save ${addon.name} to share`,
      defaultPath: `${id}-${addon.version ?? "1.0.0"}.jig-addon.zip`,
      filters: [{ name: "Jig add-on", extensions: ["zip"] }],
    };
    const w = window();
    const result = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return undefined;
    await writeFile(result.filePath, await packAddon(addon.dir, id));
    return result.filePath;
  });
  handle("addons.inspectPackage", async ({ path }) => {
    let file = path;
    if (!file) {
      const options = {
        title: "Import an add-on",
        properties: ["openFile" as const],
        filters: [{ name: "Jig add-on", extensions: ["zip"] }],
      };
      const w = window();
      const result = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return undefined;
      file = result.filePaths[0];
    }
    const { pkg } = inspectPackage(await readPackage(file));
    const existing = s.list().find((a) => a.id === pkg.id);
    const { manifest: _m, ...info } = pkg;
    return {
      path: file,
      ...info,
      exists: (existing ? (existing.source === "user" ? "user" : "builtin") : undefined) as
        | "user"
        | "builtin"
        | undefined,
    };
  });
  handle("addons.importPackage", async ({ path, replace }) => {
    const pkg = await installPackage(await readPackage(path), paths.addons(), { replace });
    await commitAll(
      paths.addons(),
      `Import ${pkg.name}${pkg.version ? ` ${pkg.version}` : ""}`,
      pkg.id,
    ).catch(() => undefined);
    await s.reloadAll();
    return { id: pkg.id, name: pkg.name };
  });
  const installedForGallery = () =>
    s
      .list()
      .filter((a) => !a.preview)
      .map((a) => ({ id: a.id, source: a.source, version: a.version }));
  handle("addons.gallery", async (args) =>
    readGallery(getConfig().addonGallery.sources, paths.cache(), installedForGallery(), args?.refresh),
  );
  handle("addons.galleryInstall", async ({ source, id, replace }) => {
    // Only from a source you added in Settings, never one a caller makes up.
    if (!getConfig().addonGallery.sources.some((x) => x.trim() === source.trim()))
      throw new JigError("invalid_args", "Not a gallery source in Settings");
    const records = await galleryRecords(await sourceFolder(source, paths.cache()));
    const record = records.find((r) => r.id === id);
    if (!record) throw new JigError("not_found", "That add-on isn't in this gallery");
    const pkg = await installPackage(await packAddon(record.dir, id), paths.addons(), { replace });
    await commitAll(
      paths.addons(),
      `Install ${pkg.name}${pkg.version ? ` ${pkg.version}` : ""} from the gallery`,
      pkg.id,
    ).catch(() => undefined);
    await s.reloadAll();
    return { id: pkg.id, name: pkg.name };
  });

  app.on("will-quit", () => s.stop());
}
