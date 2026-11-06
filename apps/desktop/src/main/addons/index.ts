import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { activeTenantRef } from "@jig/azure";
import { addonToolName } from "@jig/sdk";
import { slugify } from "@jig/themes";
import { app, dialog, Notification, protocol, utilityProcess } from "electron";
import type { AddonInfo, AddonOriginInfo } from "../../shared/addons";
import type { SessionStatus } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { appWindows, focusJig, hiddenMode, mainWindow } from "../appWindows";
import { onActiveTenantChange } from "../azure";
import { onAzureContextChange } from "../azure/env";
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
import { recentMeetings } from "../meetings";
import { projectStore } from "../projects";
import { mimeFor } from "../protocols";
import { providerStatus } from "../providers";
import { GUARD_TIMEOUT_MS, registerQuitGuard } from "../quit";
import { createChat, keepChatAwake, onSessionStatus, sessionManager, setToolAddons } from "../sessions";
import { addAddonAttachment, copyAddonAttachments, removeAddonAttachments } from "../sessions/attachments";
import { notificationsAllowed } from "../sessions/notify";
import { paths } from "../state/paths";
import { fileEntry, type ThemeEntry } from "../themes/sources";
import { ANNOUNCE_TIMEOUT_MS, beforeUpdate } from "../updates/announce";
import { APP_ICON } from "../window";
import { Badges, ownViewId } from "./badges";
import { addonChats } from "./chats";
import { addonContext, addonDataTools, addonTools } from "./claudeTools";
import { setTokensFile } from "./css";
import { galleryRecords, isGitSource, readGallery, sourceFolder } from "./gallery";
import type { HostChannel } from "./hostProcess";
import type { FromHost } from "./hostRuntime";
import { chatEventFor, type Dispatch, GitEvents } from "./jigEvents";
import { forgetOriginal, isModified, readOrigin, restoreOriginal, saveOriginal } from "./originals";
import { commitAll } from "./repo";
import { saveAddonCopy } from "./saveCopy";
import { AddonService } from "./service";
import {
  addonContents,
  copyContents,
  freeId,
  idFromName,
  inspectPackage,
  installPackage,
  packAddon,
  packCopy,
  readPackage,
  writeContents,
} from "./share";
import { taskUsesChat } from "./taskChats";

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
    canRead: (id) => {
      const granted = service?.list().find((a) => a.id === id)?.manifest?.permissions ?? [];
      return granted.includes("chat:read") || granted.includes("chat");
    },
    list: () => sessionManager().list(),
    isBuiltin: (id) => service?.list().find((a) => a.id === id)?.source === "builtin",
    create: (input) => createChat(input),
    chatGptReady: async () =>
      (await providerStatus().catch(() => [])).some((p) => p.provider === "chatgpt" && p.ready),
    send: (sessionId, text, attachments) => sessionManager().send(sessionId, text, attachments),
    sendFrom: (sessionId, text, from, icon) => sessionManager().notify(sessionId, text, from, icon),
    icon: (id) => service?.list().find((a) => a.id === id)?.manifest?.icon,
    copyAttachments: (addonId, sessionId, list) =>
      copyAddonAttachments(paths.attachments(), addonId, sessionId, list),
    snapshot: (sessionId) => sessionManager().snapshot(sessionId),
    notify: (id, change) => addonService().call(id, "chatChanged", change),
  });
  onSessionStatus((meta) => chats.statusChanged(meta));
  // A chat a queued task runs in, or will continue, keeps its process while idle (D-367).
  keepChatAwake(async (meta) => {
    const addons = service;
    if (!addons?.list().some((a) => a.id === "tasks")) return false;
    return taskUsesChat(await addons.storageAll("tasks").catch(() => ({})), meta.id);
  });

  const badges = new Badges((all) => emit("addons.badges", all));
  const badge = (addonId: string, view: string, value: unknown) => {
    const views =
      service
        ?.list()
        .find((a) => a.id === addonId)
        ?.manifest?.contributes.views.map((v) => v.id) ?? [];
    const full = ownViewId(addonId, String(view), views);
    if (!full) throw new JigError("invalid_args", `"${view}" isn't one of this add-on's views`);
    badges.set(full, value);
  };
  // A system notification for an add-on, only while Jig is in the background (D-215).
  const shown = new Set<Notification>();
  const systemNotify = (title: string, message?: string): boolean => {
    if (!notificationsAllowed(getConfig().notifications.desktop, process.env)) return false;
    if (hiddenMode() || appWindows().some((w) => w.isFocused()) || !Notification.isSupported()) return false;
    const n = new Notification({ title, body: message ?? "", icon: APP_ICON });
    shown.add(n);
    n.on("click", () => focusJig());
    n.on("close", () => shown.delete(n));
    n.on("failed", () => shown.delete(n));
    n.show();
    return true;
  };

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
          timeout?: number;
          system?: boolean;
          actions?: Array<{ label: string } & Record<string, unknown>>;
        };
        const system = n.system ? systemNotify(String(n.title), n.message) : false;
        emit("notify", {
          title: String(n.title),
          message: n.message,
          tone: n.tone,
          timeout: system ? 0 : n.timeout,
          addonId,
          actions: Array.isArray(n.actions)
            ? (n.actions.filter((a) => a && typeof a.label === "string").slice(0, 3) as never)
            : undefined,
        });
      } else if (op === "setBadge") {
        const { view, value } = args as { view: string; value?: unknown };
        badge(addonId, view, value);
      } else if (op === "addons.list") {
        return service?.shared() ?? [];
      } else if (op === "addons.call") {
        const { id, method, args: input } = args as { id: string; method: string; args?: unknown };
        return service?.callShared(addonId, id, method, input);
      } else if (op === "emit") {
        const { topic, payload } = args as { topic: string; payload: unknown };
        emit("addons.event", { id: addonId, topic, payload });
      } else if (op === "config") {
        // A built-in add-on's own namespace of Jig's settings (D-450); nothing for any other add-on.
        if (service?.list().find((a) => a.id === addonId)?.source !== "builtin")
          throw new Error("Only built-in add-ons read Jig's settings.");
        return (getConfig() as Record<string, unknown>)[addonId];
      } else if (op === "meetings.recent") {
        // Checked here too (D-460): the host process enforces it, but main doesn't trust it.
        if (
          !service
            ?.list()
            .find((a) => a.id === addonId)
            ?.manifest?.permissions.includes("meetings:read")
        )
          throw new Error('This add-on needs the "meetings:read" permission in addon.json');
        const { limit } = args as { limit?: unknown };
        return recentMeetings(typeof limit === "number" ? limit : undefined);
      } else if (op === "projects") {
        // With the provider of each project's new chats (its own, else Jig's), as the UI's list has it.
        const fallback = getConfig().engine.provider;
        return (await projectStore().state()).projects.map((p) => ({
          ...p,
          provider: (p.provider ?? fallback) === "codex" ? "chatgpt" : "claude",
        }));
      } else if (op === "workspaces") {
        return (await projectStore().state()).workspaces;
      } else if (op === "chats.create") {
        return chats.create(addonId, args as never);
      } else if (op === "chats.send") {
        return chats.send(addonId, args as never);
      } else if (op === "attachments.remove") {
        const list = (args as { attachments?: Array<{ path?: unknown }> }).attachments ?? [];
        await removeAddonAttachments(
          paths.attachments(),
          addonId,
          list.map((a) => a?.path).filter((p): p is string => typeof p === "string"),
        );
      } else if (op === "chats.list") {
        return chats.list(addonId, args as never);
      } else if (op === "chats.timeline") {
        return chats.timeline(addonId, (args as { sessionId: string }).sessionId);
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
      for (const a of addons) if (!a.enabled || a.errors.length) badges.clear(a.id);
      emit("addons.changed", addons);
      // Add-ons' tools for Claude follow the add-ons (new chats get the current set).
      setAddonTools(addonTools(addons, (id, method, args) => addonService().call(id, method, args)));
      const owners = new Map<string, string>();
      for (const a of addons)
        for (const t of a.manifest?.contributes.tools ?? [])
          owners.set(`mcp__jig__${addonToolName(a.id, t.id)}`, a.id);
      setToolAddons((tool) => owners.get(tool));
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
  handle("addons.callShared", ({ from, id, method, args }) => s.callShared(from, id, method, args));
  handle("addons.badges", () => badges.all());
  handle("addons.setBadge", ({ id, view, value }) => badge(id, view, value));
  handle("addons.systemNotify", ({ title, message }) => systemNotify(title, message));
  handle("addons.search", (query) => s.search(query));

  // What happens in Jig, for add-ons' events (D-215).
  const dispatch: Dispatch = (name, payload) => {
    void s.dispatchEvent(name, payload);
    emit("addons.jigEvent", { name, payload });
  };
  // Jig closes to install an update: add-ons hold their work first, waited for briefly (D-395).
  beforeUpdate((info) => {
    emit("addons.jigEvent", { name: "app.updating", payload: info });
    return s.dispatchEvent("app.updating", info, ANNOUNCE_TIMEOUT_MS);
  });
  const lastStatus = new Map<string, SessionStatus>();
  onSessionStatus((meta) => {
    const event = chatEventFor(lastStatus.get(meta.id), meta);
    lastStatus.set(meta.id, meta.status);
    if (event) dispatch(event.name, event.payload);
  });
  const git = new GitEvents(dispatch);
  // Another Azure tenant (D-282): running host processes run their next az with it, and add-ons hear.
  onAzureContextChange((azure) => s.setHostAzure(azure));
  onActiveTenantChange((state) => dispatch("azure.tenant", activeTenantRef(state)));
  let activeId: string | undefined;
  const followProjects = (state: Awaited<ReturnType<ReturnType<typeof projectStore>["state"]>>) => {
    const repos = new Set<string>();
    for (const w of state.workspaces) {
      if (w.isGitRepo) repos.add(w.path);
      for (const r of w.repos) repos.add(r.path);
    }
    for (const p of state.projects) {
      if (p.isGitRepo) repos.add(p.path);
      for (const r of p.repos) repos.add(r.path);
      if (p.focusRepo) repos.add(p.focusRepo);
    }
    void git.setRepos([...repos]);
    if (state.activeId !== activeId) {
      const first = activeId === undefined;
      activeId = state.activeId;
      const p = state.projects.find((x) => x.id === activeId);
      if (!first) dispatch("project.active", { projectId: p?.id, name: p?.name, path: p?.path });
    }
  };
  void projectStore()
    .state()
    .then(followProjects)
    .catch(() => undefined);
  projectStore().onChange(followProjects);
  app.on("will-quit", () => git.stop());
  // Add-ons' quit guards (`contributes.quitGuards`, D-343): their answers join Jig's quit modal.
  registerQuitGuard("addons", async () =>
    // Each add-on gets a little less than the whole flow, so a slow one is skipped on its own.
    (await s.quitGuards(GUARD_TIMEOUT_MS - 250)).map((g) => ({
      reason: {
        key: `addon:${g.addonId}:${g.guard}`,
        source: g.name,
        icon: g.icon,
        message: g.answer.message,
        detail: g.answer.detail,
        actions: (g.answer.actions ?? []).map((a) => ({ id: a.id, label: a.label })),
      },
      run: async (actionId: string) => {
        const action = g.answer.actions?.find((a) => a.id === actionId);
        if (action?.run) await s.call(g.addonId, action.run, action.args);
      },
    })),
  );
  handle("addons.addAttachment", ({ id, ...input }) => addAddonAttachment(paths.attachments(), id, input));
  handle("addons.saveCopy", ({ id, from, name, title }) => {
    const w = window();
    return saveAddonCopy(
      join(paths.addonData(), id),
      from,
      { name },
      {
        file: async (defaultName) => {
          const options = { title: title ?? "Save a copy", defaultPath: defaultName };
          const result = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options);
          return result.canceled ? undefined : result.filePath;
        },
        folder: async () => {
          const options = {
            title: title ?? "Save a copy into…",
            properties: ["openDirectory" as const, "createDirectory" as const],
          };
          const result = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options);
          return result.canceled ? undefined : result.filePaths[0];
        },
      },
    );
  });
  handle("addons.storageGet", ({ id, key }) => s.storageGet(id, key));
  handle("addons.storageSet", ({ id, key, value }) => s.storageSet(id, key, value));
  handle("addons.reload", async ({ id }) => {
    if (id) await s.reload(id);
    else await s.reloadAll();
  });
  handle("addons.history", ({ id }) => s.history(id));
  handle("addons.rollback", ({ id, commit }) => s.rollback(id, commit));
  handle("addons.remove", async ({ id }) => {
    await s.remove(id);
    await forgetOriginal(paths.addonOriginals(), id).catch(() => undefined);
  });

  // Originals (D-249): what an installed add-on looked like when it came, to show edits and restore.
  handle("addons.originals", async () => {
    const out: Record<string, AddonOriginInfo> = {};
    for (const a of s.list()) {
      if (a.source !== "user" || a.preview) continue;
      const origin = await readOrigin(paths.addonOriginals(), a.id);
      if (!origin) continue;
      const modified = await isModified(paths.addonOriginals(), a.id, a.dir).catch(() => false);
      out[a.id] = { kind: origin.kind, source: origin.source, version: origin.version, modified };
    }
    return out;
  });
  handle("addons.restoreOriginal", async ({ id }) => {
    const addon = s.list().find((a) => a.id === id && !a.preview);
    if (addon?.source !== "user") throw new JigError("not_found", "Only your own add-ons can be restored");
    // An edited built-in: your copy is the change, so removing it brings the built-in back.
    if (addon.overridesBuiltin && !(await readOrigin(paths.addonOriginals(), id))) return s.remove(id);
    await restoreOriginal(paths.addonOriginals(), id, addon.dir);
    await s.commit(id, `Restore ${addon.name} to the original`).catch(() => undefined);
    await s.reload(id);
  });

  // Sharing: an add-on as a .zip, and a .zip back in (after you've seen what it is).
  const window = () => appWindows().find((w) => w.isFocused()) ?? mainWindow();
  handle("addons.export", async ({ id, copy: asCopy, gallerySource }) => {
    const addon = s.list().find((a) => a.id === id);
    if (!addon) throw new JigError("not_found", "No such add-on");
    // An edited built-in shared as itself would replace the receiver's built-in: it goes as a copy.
    if (addon.overridesBuiltin && !asCopy)
      throw new JigError("invalid_args", "An edited built-in add-on is shared as a copy with its own name");
    const name = asCopy?.name.trim() ?? addon.name;
    const ids = new Set(s.list().map((a) => a.id));
    const copy = asCopy ? { id: freeId(idFromName(name), (x) => ids.has(x)), name } : undefined;
    const shareId = copy?.id ?? id;
    if (gallerySource !== undefined) {
      // Only into a folder source you added in Settings; a git gallery is shared by committing a .zip.
      if (!getConfig().addonGallery.sources.some((x) => x.trim() === gallerySource.trim()))
        throw new JigError("invalid_args", "Not a gallery source in Settings");
      if (isGitSource(gallerySource))
        throw new JigError("invalid_args", "A git gallery can't be written to: save a .zip and commit it");
      const folder = gallerySource.trim();
      const inner = join(folder, "addons");
      const parent = existsSync(inner) ? inner : folder;
      const entries = copy ? await copyContents(addon.dir, copy) : await addonContents(addon.dir, id);
      try {
        return await writeContents(parent, entries);
      } catch (e) {
        throw new JigError("exists", e instanceof Error ? e.message : String(e));
      }
    }
    const options = {
      title: `Save ${name} to share`,
      defaultPath: `${shareId}-${addon.version ?? "1.0.0"}.jig-addon.zip`,
      filters: [{ name: "Jig add-on", extensions: ["zip"] }],
    };
    const w = window();
    const result = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return undefined;
    await writeFile(result.filePath, copy ? await packCopy(addon.dir, copy) : await packAddon(addon.dir, id));
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
    await saveOriginal(paths.addonOriginals(), pkg.id, join(paths.addons(), pkg.id), {
      kind: "import",
      version: pkg.version,
    }).catch((e) => log.warn("Couldn't keep the original", e));
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
    await saveOriginal(paths.addonOriginals(), pkg.id, join(paths.addons(), pkg.id), {
      kind: "gallery",
      source,
      version: pkg.version,
    }).catch((e) => log.warn("Couldn't keep the original", e));
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
