import {
  type AddonProject,
  type AddonUiContext,
  addonTabType,
  addonViewId,
  type MenuItemInput,
  type RunningScript,
} from "@jig/sdk";
import { icons } from "lucide-react";
import { createContext, useContext } from "react";
import type { AddonInfo } from "../../shared/addons";
import { useTerminals } from "../features/terminals/store";
import { call, errorMessage } from "../lib/host";
import { confirmDialog, type MenuEntry, openMenu, openMenuAt, promptDialog } from "../ui";
import { contributedEntries } from "../workbench/contextMenus";
import { useProjects } from "../workbench/projects";
import { workbench } from "../workbench/store";
import { notify } from "../workbench/toasts";

/** lucide icon by kebab-case name ("git-branch" → GitBranch). */
export function iconByName(name: string | undefined) {
  if (!name) return undefined;
  const pascal = name.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
  return (icons as Record<string, (typeof icons)[keyof typeof icons]>)[pascal];
}

/** Add-on events from host code (`api.emit`). */
const eventListeners = new Map<string, Set<(topic: string, payload: unknown) => void>>();
export function dispatchAddonEvent(id: string, topic: string, payload: unknown): void {
  for (const listener of eventListeners.get(id) ?? []) listener(topic, payload);
}

const toProject = (p: ReturnType<typeof useProjects.getState>["projects"][number]): AddonProject => ({
  id: p.id,
  name: p.name,
  path: p.path,
  isGitRepo: p.isGitRepo,
  exists: p.exists,
  repos: p.repos ?? [],
  focusRepo: p.focusRepo,
});

function toEntries(items: Array<MenuItemInput | { separator: true }>): MenuEntry[] {
  return items.map((item) =>
    "separator" in item
      ? item
      : {
          label: item.label,
          icon: iconByName(item.icon),
          danger: item.danger,
          disabled: item.disabled,
          checked: item.checked,
          onSelect: item.onSelect,
          submenu: item.submenu ? toEntries(item.submenu) : undefined,
        },
  );
}

const has = (addon: AddonInfo, permission: string) =>
  addon.manifest?.permissions.includes(permission) ?? false;

export function makeContext(addon: AddonInfo): AddonUiContext {
  const id = addon.id;
  return {
    addon: { id, name: addon.name },
    host: {
      call: <T>(method: string, args?: unknown) => call("addons.call", { id, method, args }) as Promise<T>,
    },
    on(topic, listener) {
      const wrapped = (t: string, payload: unknown) => {
        if (t === topic) listener(payload);
      };
      const set = eventListeners.get(id) ?? new Set();
      set.add(wrapped);
      eventListeners.set(id, set);
      return () => set.delete(wrapped);
    },
    projects: {
      active() {
        const { projects, activeId } = useProjects.getState();
        const p = projects.find((x) => x.id === activeId);
        return p ? toProject(p) : undefined;
      },
      list: () => useProjects.getState().projects.map(toProject),
      setActive: async (projectId) => {
        await call("projects.setActive", { id: projectId });
      },
      setFocusRepo: async (projectId, repo) => {
        await call("projects.setFocusRepo", { id: projectId, repo });
      },
      rescanRepos: async (projectId) => {
        await call("projects.rescanRepos", { id: projectId });
      },
    },
    openChat: async (options = {}) => {
      await (await import("../features/sessions/actions")).newSession(options.projectId, options.cwd);
    },
    openTab: (type, params) => void workbench.openTab(addonTabType(id, type), params),
    openImage: (path) => void workbench.openTab("jig.image", { path }),
    // A full id ("addon.git.git", "jig.terminals") shows another view; a short id one of this add-on's.
    showView: (viewId) =>
      workbench.showView(/^(addon|jig)\./.test(viewId) ? viewId : addonViewId(id, viewId)),
    scripts: {
      list: (projectId) => call("scripts.list", { projectId }),
      async run(projectId, scriptId) {
        const t = await call("scripts.run", { projectId, scriptId });
        (await import("../features/terminals/actions")).showTerminal(t.id);
      },
      stop: (projectId, scriptId) => call("scripts.stop", { projectId, scriptId }),
      async restart(projectId, scriptId) {
        const t = await call("scripts.restart", { projectId, scriptId });
        (await import("../features/terminals/actions")).showTerminal(t.id);
      },
      async runGroup(projectId, groupId) {
        const started = await call("scripts.runGroup", { projectId, groupId });
        if (started[0]) (await import("../features/terminals/actions")).showTerminal(started[0].id);
      },
      running: () => runningScripts(useTerminals.getState().terminals),
      show: (terminalId) =>
        void import("../features/terminals/actions").then((m) => m.showTerminal(terminalId)),
    },
    openSettings: () => void workbench.openTab("jig.settings", { section: `addon.${id}` }),
    async runInTerminal(command, options = {}) {
      if (!has(addon, "terminal")) throw new Error(`${addon.name} needs the "terminal" permission`);
      const { showTerminal } = await import("../features/terminals/actions");
      const t = await call("terminals.create", {
        command,
        cwd: options.cwd,
        title: options.title,
        projectId: options.projectId ?? useProjects.getState().activeId,
      });
      showTerminal(t.id);
    },
    async sendToChat(text, options = {}) {
      if (!has(addon, "chat")) throw new Error(`${addon.name} needs the "chat" permission`);
      let sessionId = options.sessionId;
      if (!sessionId) {
        const { newSession } = await import("../features/sessions/actions");
        sessionId = await newSession();
      }
      if (sessionId && options.send !== false) await call("sessions.send", { id: sessionId, text });
    },
    notify: (input) => notify({ title: input.title, message: input.message, tone: input.tone }),
    storage: {
      get: <T>(key: string) => call("addons.storageGet", { id, key }) as Promise<T | undefined>,
      set: (key, value) => call("addons.storageSet", { id, key, value }),
    },
    openExternal: (url) =>
      void call("app.openExternal", { url }).catch((e) =>
        notify({ title: "Can't open", message: errorMessage(e), tone: "warning" }),
      ),
    openPath: (path) =>
      void call("app.openPath", { path }).catch((e) =>
        notify({ title: "Can't open", message: errorMessage(e), tone: "warning" }),
      ),
    copy: (text) => void navigator.clipboard.writeText(text),
    menu(items, at, target) {
      const entries = toEntries(items);
      const extra = target ? contributedEntries(target) : [];
      const all = extra.length ? [...entries, { separator: true as const }, ...extra] : entries;
      if (at instanceof HTMLElement) openMenuAt(at, all);
      else openMenu(all, { x: at.clientX, y: at.clientY });
    },
    confirm: (input) => confirmDialog(input),
    prompt: (input) => promptDialog(input),
  };
}

function runningScripts(terminals: ReturnType<typeof useTerminals.getState>["terminals"]): RunningScript[] {
  return terminals
    .filter((t) => t.scriptId && t.projectId && t.status === "running")
    .map((t) => ({ terminalId: t.id, projectId: t.projectId!, scriptId: t.scriptId!, title: t.title }));
}

/** Scripts running in terminals, re-rendering when that changes. */
export function useRunningScripts(): RunningScript[] {
  const terminals = useTerminals((s) => s.terminals);
  return runningScripts(terminals);
}

export const AddonContext = createContext<AddonUiContext | undefined>(undefined);

/** The add-on's context inside its components (same object as the `ctx` prop). */
export function useAddon(): AddonUiContext {
  const ctx = useContext(AddonContext);
  if (!ctx) throw new Error("useAddon() must be used inside an add-on component");
  return ctx;
}

/** The active project, re-rendering when it changes. */
export function useActiveProject(): AddonProject | undefined {
  const project = useProjects((s) => s.projects.find((p) => p.id === s.activeId));
  return project ? toProject(project) : undefined;
}

export function useProjectList(): AddonProject[] {
  const projects = useProjects((s) => s.projects);
  return projects.map(toProject);
}
