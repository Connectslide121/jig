import { type AddonUiContext, addonActionId, addonTabType, addonViewId } from "@jig/sdk";
import { Puzzle } from "lucide-react";
import { type ComponentType, createElement, useEffect } from "react";
import { create } from "zustand";
import type { AddonInfo } from "../../shared/addons";
import { registerDashboardWidget } from "../features/projects/widgets";
import { registerPrompt } from "../features/sessions/prompts";
import { registerToolRenderer } from "../features/sessions/toolRenderers";
import { registerSettingsPage } from "../features/settings/SettingsTab";
import { call, useHostEvent } from "../lib/host";
import { contributeMenu } from "../workbench/contextMenus";
import {
  registerAction,
  registerChatToolbarItem,
  registerStatusItem,
  registerTabType,
  registerTopbarItem,
  registerView,
  unregisterOwner,
} from "../workbench/registry";
import { notify } from "../workbench/toasts";
import { AddonBoundary } from "./AddonBoundary";
import { AddonContext, dispatchAddonEvent, iconByName, makeContext } from "./context";
import { installSharedModules } from "./shared";

/** The add-ons the host reported, for Settings → Add-ons and the builder. */
export const useAddons = create<{ addons: AddonInfo[]; loadErrors: Record<string, string> }>(() => ({
  addons: [],
  loadErrors: {},
}));

type AnyComponent = ComponentType<Record<string, unknown>>;

interface Mounted {
  hash: string;
  cleanups: Array<() => void>;
}
const mounted = new Map<string, Mounted>();

function unmount(id: string) {
  const m = mounted.get(id);
  for (const fn of m?.cleanups ?? []) fn();
  unregisterOwner(id);
  document.getElementById(`addon-css-${id}`)?.remove();
  mounted.delete(id);
}

/** Wraps an add-on export so it gets `ctx`, the add-on context and an error boundary. */
// biome-ignore lint/suspicious/noExplicitAny: wrapped components take each slot's own props.
type SlotComponent = ComponentType<any>;

function wrap(addon: AddonInfo, ctx: AddonUiContext, Component: AnyComponent, what: string): SlotComponent {
  const Wrapped = (props: Record<string, unknown>) => (
    <AddonBoundary addon={addon} what={what}>
      <AddonContext.Provider value={ctx}>
        <Component {...props} ctx={ctx} />
      </AddonContext.Provider>
    </AddonBoundary>
  );
  Wrapped.displayName = `Addon(${addon.id}:${what})`;
  return Wrapped;
}

async function mount(addon: AddonInfo): Promise<void> {
  const manifest = addon.manifest;
  if (!manifest || !addon.uiUrl) return;
  // One retry: a reload of every add-on can briefly replace the bundle while it is being fetched.
  const url = addon.uiUrl;
  const load = () => import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
  const module = await load().catch(async () => {
    await new Promise((r) => setTimeout(r, 400));
    return load();
  });
  const ctx = makeContext(addon);
  const owner = addon.id;
  const cleanups: Array<() => void> = [];
  // Known as mounted before anything registers, so unmounting after a failure part-way cleans up.
  mounted.set(owner, { hash: addon.uiUrl, cleanups });
  const missing: string[] = [];
  const component = (name: string, what: string) => {
    const c = module[name];
    if (typeof c !== "function") {
      missing.push(name);
      return undefined;
    }
    return wrap(addon, ctx, c as AnyComponent, what);
  };
  const handler = (name: string) => {
    const fn = module[name];
    if (typeof fn !== "function") {
      missing.push(name);
      return undefined;
    }
    return (...args: unknown[]) => {
      void call("learning.record", {
        kind: "addon.action",
        text: `${addon.id}: ${name}`,
        detail: { addon: addon.id },
      }).catch(() => {});
      try {
        const result = (fn as (...a: unknown[]) => unknown)(ctx, ...args);
        if (result instanceof Promise)
          result.catch((e: Error) => notify({ title: `${addon.name}: ${e.message}`, tone: "danger" }));
      } catch (e) {
        notify({ title: `${addon.name}: ${(e as Error).message}`, tone: "danger" });
      }
    };
  };
  const c = manifest.contributes;
  for (const v of c.views) {
    const Component = component(v.component, `view ${v.title}`);
    if (Component)
      registerView({
        id: addonViewId(owner, v.id),
        title: addon.preview ? `${v.title} (preview)` : v.title,
        icon: iconByName(v.icon ?? manifest.icon) ?? Puzzle,
        defaultRegion: v.region,
        component: Component,
        owner,
        reveal: addon.source === "user",
        under: v.under,
      });
  }
  for (const t of c.tabs) {
    const Component = component(t.component, `tab ${t.title}`);
    if (Component)
      registerTabType({
        type: addonTabType(owner, t.type),
        title: (params) => (typeof params.title === "string" ? params.title : t.title),
        icon: iconByName(t.icon ?? manifest.icon) ?? Puzzle,
        component: Component,
        owner,
      });
  }
  for (const t of c.topbar) {
    const Component = component(t.component, "top bar item");
    if (Component) registerTopbarItem({ id: `${owner}.${t.id}`, component: Component, owner });
  }
  for (const s of c.statusbar) {
    const Component = component(s.component, "status bar item");
    if (Component)
      registerStatusItem({ id: `${owner}.${s.id}`, side: s.side, order: 100, component: Component, owner });
  }
  for (const d of c.dashboard) {
    const Component = component(d.component, "dashboard widget");
    if (Component)
      cleanups.push(
        registerDashboardWidget({
          id: `${owner}.${d.id}`,
          order: d.order,
          owner,
          render: (project) => createElement(Component, { project }),
        }),
      );
  }
  for (const a of c.actions) {
    const run = handler(a.run);
    if (run)
      registerAction({
        id: addonActionId(owner, a.id),
        title: a.title,
        group: a.group ?? addon.name,
        icon: iconByName(a.icon ?? manifest.icon),
        shortcut: a.shortcut,
        run: () => run(),
        owner,
      });
  }
  for (const m of c.menus) {
    const run = handler(m.run);
    if (run)
      cleanups.push(
        contributeMenu(m.slot, (target) => [
          { label: m.title, icon: iconByName(m.icon ?? manifest.icon), onSelect: () => run(target) },
        ]),
      );
  }
  for (const t of c.chatToolbar) {
    const Component = component(t.component, "chat toolbar button");
    if (Component) registerChatToolbarItem({ id: `${owner}.${t.id}`, component: Component, owner });
  }
  for (const r of c.toolRenderers) {
    const Component = component(r.component, `card for ${r.tool}`);
    if (Component)
      cleanups.push(
        registerToolRenderer({ tool: r.tool, owner, render: (item) => createElement(Component, { item }) }),
      );
  }
  for (const p of c.prompts)
    cleanups.push(
      registerPrompt({ id: `${owner}.${p.id}`, label: p.label, text: p.text, send: p.send, owner }),
    );
  if (c.settings) {
    const Component = component(c.settings.component, "settings page");
    if (Component)
      cleanups.push(
        registerSettingsPage({
          id: `addon.${owner}`,
          title: c.settings.title,
          icon: iconByName(manifest.icon) ?? Puzzle,
          component: Component as ComponentType,
          order: 50,
          owner,
        }),
      );
  }
  if (addon.cssUrl) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.id = `addon-css-${owner}`;
    link.href = addon.cssUrl;
    document.head.appendChild(link);
  }
  if (missing.length)
    useAddons.setState((s) => ({
      loadErrors: {
        ...s.loadErrors,
        [owner]: `ui.tsx has no export named ${missing.map((m) => `"${m}"`).join(", ")}`,
      },
    }));
}

/**
 * Mounts, remounts (on change) and unmounts add-ons to match the host's list. Runs one sync at a time:
 * a change arriving while an add-on's code loads would otherwise mount it twice.
 */
let syncing: Promise<void> = Promise.resolve();
export function syncAddons(addons: AddonInfo[]): Promise<void> {
  syncing = syncing.then(() => doSync(addons)).catch(() => {});
  return syncing;
}

async function doSync(addons: AddonInfo[]): Promise<void> {
  const active = new Map(
    addons.filter((a) => a.enabled && a.uiUrl && a.errors.length === 0).map((a) => [a.id, a]),
  );
  // Load errors of add-ons that are gone or switched off don't stay around.
  useAddons.setState((s) => ({
    addons,
    loadErrors: Object.fromEntries(Object.entries(s.loadErrors).filter(([id]) => active.has(id))),
  }));
  for (const id of [...mounted.keys()]) {
    const next = active.get(id);
    if (!next || next.uiUrl !== mounted.get(id)?.hash) unmount(id);
  }
  for (const addon of active.values()) {
    if (mounted.has(addon.id)) continue;
    useAddons.setState((s) => {
      const loadErrors = { ...s.loadErrors };
      delete loadErrors[addon.id];
      return { loadErrors };
    });
    try {
      await mount(addon);
    } catch (error) {
      unmount(addon.id);
      useAddons.setState((s) => ({ loadErrors: { ...s.loadErrors, [addon.id]: (error as Error).message } }));
    }
  }
}

/** Mounted once at the root. */
export function useAddonsSync(): void {
  useEffect(() => {
    installSharedModules();
    void call("addons.list").then(syncAddons);
  }, []);
  useHostEvent("addons.changed", (addons) => void syncAddons(addons));
  useHostEvent("addons.event", ({ id, topic, payload }) => dispatchAddonEvent(id, topic, payload));
}
