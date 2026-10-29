import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { create } from "zustand";
import type { SideRegion } from "../../shared/layout";

/**
 * Everything the workbench can show or do, registered by core features and (phase 6) add-ons. The
 * registry is a store so contributions can come and go at runtime (add-on hot reload).
 */
export interface ViewProps {
  viewId: string;
  region: SideRegion;
}

export interface ViewDef {
  id: string;
  title: string;
  icon: LucideIcon;
  defaultRegion: SideRegion;
  component: ComponentType<ViewProps>;
  /** Extra buttons in the region header while this view is active. */
  headerActions?: ComponentType<ViewProps>;
  /** `core` or the add-on id. */
  owner?: string;
  /** Open its region the first time it is placed (views of add-ons you built). */
  reveal?: boolean;
  /** Placed the first time as a collapsible section below this view (e.g. `addon.git.git`). */
  under?: string;
}

export interface TabProps {
  tabId: string;
  params: Record<string, unknown>;
  /** The tab showing in its pane. */
  active: boolean;
  /** Showing in the pane you're working in (with two panes side by side, only one is): keys go here. */
  focused?: boolean;
}

export type TabStatus = "working" | "attention" | "error" | "unread";

export interface TabTypeDef {
  type: string;
  title: (params: Record<string, unknown>) => string;
  /** Hook variant of `title` for titles that change (a renamed project, a session's summary). */
  useTitle?: (params: Record<string, unknown>) => string;
  icon: LucideIcon;
  /** Icon depending on the tab's params (e.g. a file type); falls back to `icon`. */
  iconFor?: (params: Record<string, unknown>) => LucideIcon | undefined;
  /** A state worth seeing from the tab bar (a chat that works, needs you or finished unseen). */
  useStatus?: (params: Record<string, unknown>) => TabStatus | undefined;
  /** A file the tab shows: its icon comes from the file icon theme (wins over `icon`). */
  filePath?: (params: Record<string, unknown>) => string | undefined;
  component: ComponentType<TabProps>;
  /** At most one tab of this type (e.g. Settings): opening it again reuses it with the new params. */
  singleton?: boolean;
  owner?: string;
}

export interface ActionDef {
  id: string;
  title: string;
  /** Tools-menu group, e.g. "Projects", "Layout", "Appearance", or an add-on's name. */
  group: string;
  icon?: LucideIcon;
  /** e.g. `Mod+,` — Mod is Ctrl on Windows/Linux and Cmd on macOS. */
  shortcut?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
  /** Hidden from the Tools menu when false (still runnable by shortcut if enabled). */
  visible?: () => boolean;
  owner?: string;
}

export interface StatusItemDef {
  id: string;
  side: "left" | "right";
  order?: number;
  component: ComponentType;
  owner?: string;
}

export interface TopbarItemDef {
  id: string;
  order?: number;
  component: ComponentType;
  owner?: string;
}

export interface ChatToolbarItemDef {
  id: string;
  component: ComponentType<{ sessionId: string; projectId?: string }>;
  owner?: string;
}

interface RegistryState {
  topbarItems: Record<string, TopbarItemDef>;
  chatToolbar: Record<string, ChatToolbarItemDef>;
  views: Record<string, ViewDef>;
  tabTypes: Record<string, TabTypeDef>;
  actions: Record<string, ActionDef>;
  statusItems: Record<string, StatusItemDef>;
}

export const useRegistry = create<RegistryState>(() => ({
  topbarItems: {},
  chatToolbar: {},
  views: {},
  tabTypes: {},
  actions: {},
  statusItems: {},
}));

function register<K extends keyof RegistryState>(kind: K, key: string, value: RegistryState[K][string]) {
  useRegistry.setState((s) => ({ [kind]: { ...s[kind], [key]: value } }) as Partial<RegistryState>);
  return () =>
    useRegistry.setState((s) => {
      const next = { ...s[kind] };
      delete next[key];
      return { [kind]: next } as Partial<RegistryState>;
    });
}

export const registerView = (def: ViewDef) => register("views", def.id, def);
export const registerTabType = (def: TabTypeDef) => register("tabTypes", def.type, def);
export const registerAction = (def: ActionDef) => register("actions", def.id, def);
export const registerStatusItem = (def: StatusItemDef) => register("statusItems", def.id, def);
export const registerTopbarItem = (def: TopbarItemDef) => register("topbarItems", def.id, def);
export const registerChatToolbarItem = (def: ChatToolbarItemDef) => register("chatToolbar", def.id, def);

/** Removes everything an owner (an add-on) registered. */
export function unregisterOwner(owner: string): void {
  useRegistry.setState((s) => {
    const keep = <T extends { owner?: string }>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([, v]) => v.owner !== owner));
    return {
      topbarItems: keep(s.topbarItems),
      chatToolbar: keep(s.chatToolbar),
      views: keep(s.views),
      tabTypes: keep(s.tabTypes),
      actions: keep(s.actions),
      statusItems: keep(s.statusItems),
    };
  });
}

export function runAction(id: string): void {
  const action = useRegistry.getState().actions[id];
  if (action) void action.run();
}

export type { ReactNode };
