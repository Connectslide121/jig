import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { create } from "zustand";
import type { SideRegion } from "../../shared/layout";
import type { MenuEntry } from "../ui/Menu";
import { recordUi } from "./recordUi";

/**
 * Everything the workbench can show or do, registered by core features and (phase 6) add-ons. The
 * registry is a store so contributions can come and go at runtime (add-on hot reload).
 */
export interface ViewProps {
  viewId: string;
  /** Where the view shows: a sidebar half, the bottom panel, or `main` (a tab in the main area). */
  region: SideRegion | "main";
}

export interface ViewDef {
  id: string;
  title: string;
  icon: LucideIcon;
  defaultRegion: SideRegion;
  component: ComponentType<ViewProps>;
  /** Extra buttons in the region header while this view is active. */
  headerActions?: ComponentType<ViewProps>;
  /** View-specific entries prepended to its options menu. */
  headerMenu?: () => MenuEntry[];
  /** `core` or the add-on id. */
  owner?: string;
  /** Open its region the first time it is placed (views of add-ons you built). */
  reveal?: boolean;
  /** Starts out of the sidebars: its action (top bar menus) or the Views list opens it as a main-area tab. */
  startHidden?: boolean;
}

export interface TabProps {
  tabId: string;
  params: Record<string, unknown>;
  /** The tab showing in its pane. */
  active: boolean;
  /** Showing in the pane you're working in (with two panes side by side, only one is): keys go here. */
  focused?: boolean;
}

export type TabStatus = "working" | "attention" | "error";

export interface TabTypeDef {
  type: string;
  title: (params: Record<string, unknown>) => string;
  /** Hook variant of `title` for titles that change (a renamed project, a session's summary). */
  useTitle?: (params: Record<string, unknown>) => string;
  icon: LucideIcon;
  /** Icon depending on the tab's params (e.g. a file type); falls back to `icon`. */
  iconFor?: (params: Record<string, unknown>) => LucideIcon | undefined;
  /** Draws the tab's icon itself, status included (a chat: its project colour and state, D-416). */
  IconView?: ComponentType<{ params: Record<string, unknown> }>;
  /** A state worth seeing from the tab bar (something that works or needs you), shown in the icon's place (D-416). */
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
  /** "right-start": first in the right-hand group, before Suggestions (D-305); else with Jig's own items. */
  placement?: "right-start";
  order?: number;
  component: ComponentType;
  owner?: string;
}

export interface ChatToolbarItemDef {
  id: string;
  component: ComponentType<{ sessionId: string; projectId?: string }>;
  owner?: string;
}

/** An add-on's section in a chat's overview card (`chat.overview`, D-423). */
export interface ChatOverviewSectionDef {
  id: string;
  title: string;
  /** The add-on's icon (a Lucide name). */
  icon?: string;
  order: number;
  component: ComponentType<{
    sessionId: string;
    projectId?: string;
    provider: "claude" | "chatgpt";
    turns: number;
  }>;
  owner?: string;
}

/**
 * Live entries of a top bar menu group (an add-on's `menuGroups`, D-305), computed each time the menu
 * opens and shown above the group's actions.
 */
export interface MenuGroupDef {
  id: string;
  /** The action group (`ActionDef.group`) whose menu shows the entries. */
  group: string;
  items: () => MenuEntry[] | Promise<MenuEntry[]>;
  /** Told when `items` throws or takes too long; the menu opens without its entries. */
  onError?: (error: Error) => void;
  owner?: string;
}

interface RegistryState {
  topbarItems: Record<string, TopbarItemDef>;
  chatToolbar: Record<string, ChatToolbarItemDef>;
  chatOverview: Record<string, ChatOverviewSectionDef>;
  views: Record<string, ViewDef>;
  tabTypes: Record<string, TabTypeDef>;
  actions: Record<string, ActionDef>;
  statusItems: Record<string, StatusItemDef>;
  menuGroups: Record<string, MenuGroupDef>;
}

export const useRegistry = create<RegistryState>(() => ({
  topbarItems: {},
  chatToolbar: {},
  chatOverview: {},
  views: {},
  tabTypes: {},
  actions: {},
  statusItems: {},
  menuGroups: {},
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
export const registerMenuGroup = (def: MenuGroupDef) => register("menuGroups", def.id, def);
export const registerChatToolbarItem = (def: ChatToolbarItemDef) => register("chatToolbar", def.id, def);
export const registerChatOverviewSection = (def: ChatOverviewSectionDef) =>
  register("chatOverview", def.id, def);

/** Removes everything an owner (an add-on) registered. */
export function unregisterOwner(owner: string): void {
  useRegistry.setState((s) => {
    const keep = <T extends { owner?: string }>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([, v]) => v.owner !== owner));
    return {
      topbarItems: keep(s.topbarItems),
      chatToolbar: keep(s.chatToolbar),
      chatOverview: keep(s.chatOverview),
      views: keep(s.views),
      tabTypes: keep(s.tabTypes),
      actions: keep(s.actions),
      statusItems: keep(s.statusItems),
      menuGroups: keep(s.menuGroups),
    };
  });
}

export function runAction(id: string): void {
  const action = useRegistry.getState().actions[id];
  if (!action) return;
  recordUi("action", action.title, { action: id });
  void action.run();
}

export type { ReactNode };
