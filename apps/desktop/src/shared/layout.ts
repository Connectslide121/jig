import { z } from "zod";

/**
 * The workbench layout as data (`~/.jig/layout.json`). Views (by id) live in side regions; the main
 * area holds tabs. Every change is a pure function here, so the renderer, the host and the builder
 * (level 1: "move pipelines to the right") share the same rules. Documented in docs/reference/layout.md.
 */
export const SIDE_REGIONS = ["left", "right", "bottom"] as const;
export type SideRegion = (typeof SIDE_REGIONS)[number];

const RegionSchema = (size: number, collapsed: boolean) =>
  z
    .object({
      views: z.array(z.string()).default([]),
      /** The view shown in the region (one at a time; the others are tabs in its header). */
      active: z.string().optional(),
      /** Width (left/right) or height (bottom) in px. */
      size: z.number().min(120).max(2000).default(size),
      collapsed: z.boolean().default(collapsed),
    })
    .prefault({});

export const TabSchema = z.object({
  id: z.string(),
  type: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  /** Pinned tabs are not replaced by the next preview-style open (reserved for later use). */
  pinned: z.boolean().optional(),
});
export type LayoutTab = z.infer<typeof TabSchema>;

export const LayoutSchema = z.object({
  version: z.literal(1).default(1),
  left: RegionSchema(280, false),
  right: RegionSchema(320, true),
  bottom: RegionSchema(260, true),
  /** Views the user hid; they come back from the Views menu. */
  hidden: z.array(z.string()).default([]),
  main: z
    .object({
      tabs: z.array(TabSchema).default([]),
      active: z.string().optional(),
    })
    .prefault({}),
});
export type Layout = z.infer<typeof LayoutSchema>;

export const defaultLayout = (): Layout => LayoutSchema.parse({});

/** What the layout needs to know about a registered view. */
export interface ViewPlacement {
  id: string;
  defaultRegion: SideRegion;
  /** Expand the region when the view is placed for the first time (new add-on views). */
  reveal?: boolean;
}

export const MAX_TABS = 50;

function clone(layout: Layout): Layout {
  return structuredClone(layout);
}

function regionOf(layout: Layout, viewId: string): SideRegion | undefined {
  return SIDE_REGIONS.find((r) => layout[r].views.includes(viewId));
}

export function findView(layout: Layout, viewId: string): SideRegion | "hidden" | undefined {
  return regionOf(layout, viewId) ?? (layout.hidden.includes(viewId) ? "hidden" : undefined);
}

function removeEverywhere(layout: Layout, viewId: string) {
  for (const r of SIDE_REGIONS) {
    const region = layout[r];
    const index = region.views.indexOf(viewId);
    if (index < 0) continue;
    region.views.splice(index, 1);
    if (region.active === viewId) region.active = region.views[Math.max(0, index - 1)];
  }
  layout.hidden = layout.hidden.filter((v) => v !== viewId);
}

/**
 * Makes the layout consistent with the views that exist: views nobody placed yet (a new add-on) go to
 * their default region; unknown views are kept (an add-on may be reloading) but never active;
 * duplicates are removed; every non-empty region has an active view.
 */
export function normalizeLayout(input: Layout, views: ViewPlacement[]): Layout {
  const layout = clone(input);
  const known = new Set(views.map((v) => v.id));
  const seen = new Set<string>();
  for (const r of SIDE_REGIONS) {
    layout[r].views = layout[r].views.filter((v) => !seen.has(v) && seen.add(v));
  }
  layout.hidden = layout.hidden.filter((v) => !seen.has(v) && seen.add(v));
  for (const view of views) {
    if (seen.has(view.id)) continue;
    layout[view.defaultRegion].views.push(view.id);
    if (view.reveal) {
      layout[view.defaultRegion].collapsed = false;
      layout[view.defaultRegion].active = view.id;
    }
  }
  for (const r of SIDE_REGIONS) {
    const region = layout[r];
    const visible = region.views.filter((v) => known.has(v));
    if (!region.active || !visible.includes(region.active)) region.active = visible[0];
  }
  if (layout.main.active && !layout.main.tabs.some((t) => t.id === layout.main.active))
    layout.main.active = layout.main.tabs[0]?.id;
  return layout;
}

/** Moves a view to a region (at the end) and shows it there. */
export function moveView(input: Layout, viewId: string, to: SideRegion): Layout {
  const layout = clone(input);
  removeEverywhere(layout, viewId);
  layout[to].views.push(viewId);
  layout[to].active = viewId;
  layout[to].collapsed = false;
  return layout;
}

export function hideView(input: Layout, viewId: string): Layout {
  const layout = clone(input);
  removeEverywhere(layout, viewId);
  layout.hidden.push(viewId);
  return layout;
}

/** Shows a view: un-hides it (into `fallback`) if needed, activates it and expands its region. */
export function showView(input: Layout, viewId: string, fallback: SideRegion): Layout {
  const region = regionOf(input, viewId);
  if (!region) return moveView(input, viewId, fallback);
  const layout = clone(input);
  layout[region].active = viewId;
  layout[region].collapsed = false;
  return layout;
}

export function setRegion(
  input: Layout,
  region: SideRegion,
  patch: Partial<Pick<Layout["left"], "size" | "collapsed" | "active">>,
): Layout {
  const layout = clone(input);
  Object.assign(layout[region], patch);
  if (patch.size !== undefined) layout[region].size = Math.round(Math.min(2000, Math.max(120, patch.size)));
  return layout;
}

export function toggleRegion(input: Layout, region: SideRegion): Layout {
  return setRegion(input, region, { collapsed: !input[region].collapsed });
}

/** Moves a view within its region's tab strip. */
export function reorderView(input: Layout, viewId: string, toIndex: number): Layout {
  const region = regionOf(input, viewId);
  if (!region) return input;
  const layout = clone(input);
  const views = layout[region].views;
  views.splice(views.indexOf(viewId), 1);
  views.splice(Math.max(0, Math.min(toIndex, views.length)), 0, viewId);
  return layout;
}

// ---------------------------------------------------------------------------------------------
// Main-area tabs

/** Stable identity of a tab's content: opening the same thing twice focuses the existing tab. */
export function tabKey(tab: Pick<LayoutTab, "type" | "params">): string {
  const params = Object.keys(tab.params)
    .sort()
    .map((k) => `${k}=${JSON.stringify(tab.params[k])}`);
  return `${tab.type}?${params.join("&")}`;
}

let counter = 0;
export function newTabId(): string {
  counter = (counter + 1) % 1_000_000;
  return `t${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Opens a tab, or focuses the existing tab with the same content. New tabs go right of the active
 * one. When there are too many tabs, the oldest unpinned, inactive tab is closed.
 */
export function openTab(
  input: Layout,
  tab: { type: string; params?: Record<string, unknown>; id?: string },
): { layout: Layout; tabId: string } {
  const params = tab.params ?? {};
  const key = tabKey({ type: tab.type, params });
  const existing = input.main.tabs.find((t) => tabKey(t) === key);
  const layout = clone(input);
  if (existing) {
    layout.main.active = existing.id;
    return { layout, tabId: existing.id };
  }
  const id = tab.id ?? newTabId();
  const activeIndex = layout.main.tabs.findIndex((t) => t.id === layout.main.active);
  layout.main.tabs.splice(activeIndex < 0 ? layout.main.tabs.length : activeIndex + 1, 0, {
    id,
    type: tab.type,
    params,
  });
  layout.main.active = id;
  while (layout.main.tabs.length > MAX_TABS) {
    const victim = layout.main.tabs.findIndex((t) => !t.pinned && t.id !== id);
    if (victim < 0) break;
    layout.main.tabs.splice(victim, 1);
  }
  return { layout, tabId: id };
}

/** Closes a tab; the neighbour to the right (else left) becomes active. */
export function closeTab(input: Layout, tabId: string): Layout {
  const layout = clone(input);
  const index = layout.main.tabs.findIndex((t) => t.id === tabId);
  if (index < 0) return input;
  layout.main.tabs.splice(index, 1);
  if (layout.main.active === tabId) {
    layout.main.active = (layout.main.tabs[index] ?? layout.main.tabs[index - 1])?.id;
  }
  return layout;
}

export function closeOtherTabs(input: Layout, keepId: string): Layout {
  const layout = clone(input);
  layout.main.tabs = layout.main.tabs.filter((t) => t.id === keepId || t.pinned);
  layout.main.active = keepId;
  return layout;
}

/** Closes every tab matching `predicate` (e.g. all tabs of a removed project). */
export function closeTabsWhere(input: Layout, predicate: (tab: LayoutTab) => boolean): Layout {
  return input.main.tabs.filter(predicate).reduce((l, t) => closeTab(l, t.id), input);
}

export function activateTab(input: Layout, tabId: string): Layout {
  if (!input.main.tabs.some((t) => t.id === tabId)) return input;
  const layout = clone(input);
  layout.main.active = tabId;
  return layout;
}

/** Activates the next (+1) or previous (−1) tab, wrapping around. */
export function cycleTab(input: Layout, delta: 1 | -1): Layout {
  const tabs = input.main.tabs;
  if (tabs.length === 0) return input;
  const index = tabs.findIndex((t) => t.id === input.main.active);
  const next = tabs[(index + delta + tabs.length) % tabs.length]!;
  return activateTab(input, next.id);
}

export function moveTab(input: Layout, tabId: string, toIndex: number): Layout {
  const layout = clone(input);
  const tabs = layout.main.tabs;
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index < 0) return input;
  const [tab] = tabs.splice(index, 1);
  tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, tab!);
  return layout;
}

export function updateTabParams(input: Layout, tabId: string, params: Record<string, unknown>): Layout {
  const layout = clone(input);
  const tab = layout.main.tabs.find((t) => t.id === tabId);
  if (tab) tab.params = { ...tab.params, ...params };
  return layout;
}
