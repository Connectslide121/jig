import { z } from "zod";

/**
 * The workbench layout as data (`~/.jig/layout.json`). Views (by id) live in side regions; the main
 * area holds tabs. Every change is a pure function here, so the renderer, the host and the builder
 * (level 1: "move pipelines to the right") share the same rules. Documented in docs/reference/layout.md.
 */
export const SIDE_REGIONS = ["left", "left2", "right", "right2", "bottom"] as const;
export type SideRegion = (typeof SIDE_REGIONS)[number];

/**
 * A sidebar can be split in two: `left2` / `right2` are the lower halves of the left and right
 * sidebar, each with its own tabs. The upper half owns the width and collapsed state.
 */
const COLUMN: Partial<Record<SideRegion, SideRegion>> = { left2: "left", right2: "right" };
export const LOWER_HALF: Partial<Record<SideRegion, SideRegion>> = { left: "left2", right: "right2" };
/** The region that owns the width and collapsed state: a lower half belongs to its sidebar. */
export const columnOf = (region: SideRegion): SideRegion => COLUMN[region] ?? region;

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

const SavedRegionSchema = z.object({
  views: z.array(z.string()).default([]),
  active: z.string().optional(),
  size: z.number().min(120).max(2000),
  collapsed: z.boolean(),
});
const SavedLayoutSchema = z.object({
  name: z.string().min(1).max(60),
  left: SavedRegionSchema,
  left2: SavedRegionSchema,
  right: SavedRegionSchema,
  right2: SavedRegionSchema,
  bottom: SavedRegionSchema,
  hidden: z.array(z.string()).default([]),
  panes: z.record(z.string(), z.number()).default({}),
});
export type SavedLayout = z.infer<typeof SavedLayoutSchema>;

export const MAX_SAVED_LAYOUTS = 20;

export const LayoutSchema = z.object({
  version: z.literal(1).default(1),
  left: RegionSchema(280, false),
  right: RegionSchema(320, true),
  /** The lower half of the left sidebar (a split sidebar): `size` is its height. */
  left2: RegionSchema(260, false),
  /** The lower half of the right sidebar. */
  right2: RegionSchema(260, false),
  bottom: RegionSchema(260, true),
  /** Views the user hid; they come back from the Views menu. */
  hidden: z.array(z.string()).default([]),
  /** Old layouts: views shown below another view. Moved into the lower half of that sidebar on load. */
  sections: z.record(z.string(), z.array(z.string())).optional(),
  /** Sizes of resizable panes inside views and tabs (`Pane id` → px, or a 0–1 ratio for splits). */
  panes: z.record(z.string(), z.number()).default({}),
  /** Named layouts (D-175): where the views were, by name, to switch back to. Never the open tabs. */
  saved: z.array(SavedLayoutSchema).default([]),
  main: z
    .object({
      tabs: z.array(TabSchema).default([]),
      /** The active tab of the pane that has focus. */
      active: z.string().optional(),
      /**
       * Split view (two panes side by side): the tabs in the right pane (ids, in `tabs` order), which
       * pane has focus, and the active tab of the other pane. Absent = one pane.
       */
      split: z
        .object({
          right: z.array(z.string()).default([]),
          focus: z.enum(["left", "right"]).default("left"),
          other: z.string().optional(),
        })
        .optional(),
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
  /** Starts hidden: reached from a menu (top bar) instead of taking room in a sidebar. */
  hidden?: boolean;
}

export const MAX_TABS = 50;

/** Tab type of a view opened in the main area (`params.viewId`): views not in a sidebar open as one. */
export const VIEW_TAB = "jig.view";

const isViewTab = (viewId: string) => (tab: LayoutTab) =>
  tab.type === VIEW_TAB && tab.params.viewId === viewId;

function clone(layout: Layout): Layout {
  return structuredClone(layout);
}

/** The region a view is in. */
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
 * their default region; unknown views are kept (an add-on may be reloading) and stay active if they
 * were, so a hot reload doesn't switch the region to another view (the region shows the first known
 * view meanwhile); duplicates are removed; a region whose active view left it gets a new one.
 */
export function normalizeLayout(input: Layout, views: ViewPlacement[]): Layout {
  const layout = clone(input);
  const known = new Set(views.map((v) => v.id));
  const seen = new Set<string>();
  for (const r of SIDE_REGIONS) {
    layout[r].views = layout[r].views.filter((v) => !seen.has(v) && seen.add(v));
  }
  layout.hidden = layout.hidden.filter((v) => !seen.has(v) && seen.add(v));
  // Old layouts had views below another view: they go to the lower half of that view's sidebar.
  const legacy = layout.sections ?? {};
  delete layout.sections;
  for (const [host, list] of Object.entries(legacy)) {
    const side = SIDE_REGIONS.find((r) => layout[r].views.includes(host));
    if (!side) continue;
    const target = LOWER_HALF[side] ?? side;
    for (const id of list) if (!seen.has(id) && seen.add(id)) layout[target].views.push(id);
  }
  for (const view of views) {
    if (seen.has(view.id)) continue;
    seen.add(view.id);
    if (view.hidden) {
      layout.hidden.push(view.id);
      continue;
    }
    layout[view.defaultRegion].views.push(view.id);
    if (view.reveal) {
      layout[columnOf(view.defaultRegion)].collapsed = false;
      layout[view.defaultRegion].active = view.id;
    }
  }
  // A lower half needs an upper one: when the upper is empty, the lower moves up.
  for (const [upper, lower] of Object.entries(LOWER_HALF) as Array<[SideRegion, SideRegion]>) {
    if (layout[upper].views.length === 0 && layout[lower].views.length > 0) {
      layout[upper].views = layout[lower].views;
      layout[lower].views = [];
      layout[lower].active = undefined;
    }
  }
  for (const r of SIDE_REGIONS) {
    const region = layout[r];
    if (!region.active || !region.views.includes(region.active))
      region.active = region.views.find((v) => known.has(v)) ?? region.views[0];
  }
  if (layout.main.active && !layout.main.tabs.some((t) => t.id === layout.main.active))
    layout.main.active = layout.main.tabs[0]?.id;
  normalizeSplit(layout);
  // A view is in one place: in a sidebar, its main-area tab closes.
  return closeTabsWhere(
    layout,
    (t) => t.type === VIEW_TAB && regionOf(layout, String(t.params.viewId)) !== undefined,
  );
}

/** Moves a view to a region (at the end) and shows it there. A view is in one place: its main tab closes. */
export function moveView(input: Layout, viewId: string, to: SideRegion): Layout {
  const layout = clone(closeTabsWhere(input, isViewTab(viewId)));
  removeEverywhere(layout, viewId);
  layout[to].views.push(viewId);
  layout[to].active = viewId;
  layout[columnOf(to)].collapsed = false;
  return layout;
}

export function hideView(input: Layout, viewId: string): Layout {
  const layout = clone(input);
  removeEverywhere(layout, viewId);
  layout.hidden.push(viewId);
  return layout;
}

/** Shows a view: un-hides it (into `fallback`) if needed, activates it and expands its sidebar. */
export function showView(input: Layout, viewId: string, fallback: SideRegion): Layout {
  const region = regionOf(input, viewId);
  if (!region) return moveView(input, viewId, fallback);
  const layout = clone(input);
  layout[region].active = viewId;
  layout[columnOf(region)].collapsed = false;
  return layout;
}

/**
 * Opens a view as a tab in the main area (or focuses its tab); it leaves its sidebar (it is then
 * `hidden`, which means "not in a sidebar"). Dragging its tab onto a sidebar puts it back there.
 */
export function openViewTab(input: Layout, viewId: string): { layout: Layout; tabId: string } {
  const layout = clone(input);
  removeEverywhere(layout, viewId);
  layout.hidden.push(viewId);
  return openTab(layout, { type: VIEW_TAB, params: { viewId } });
}

/**
 * Shows `viewId` in the same sidebar as `hostId`, in its lower half (a split sidebar), so both are
 * visible at once. A host in the bottom panel just moves the view there.
 */
export function splitBeside(input: Layout, viewId: string, hostId: string): Layout {
  const host = regionOf(input, hostId);
  if (!host || viewId === hostId) return input;
  const target = host === "bottom" ? host : (LOWER_HALF[columnOf(host)] ?? host);
  return moveView(input, viewId, target);
}

export function setRegion(
  input: Layout,
  region: SideRegion,
  patch: Partial<Pick<Layout["left"], "size" | "collapsed" | "active">>,
): Layout {
  const layout = clone(input);
  const { collapsed, ...rest } = patch;
  Object.assign(layout[region], rest);
  if (collapsed !== undefined) layout[columnOf(region)].collapsed = collapsed;
  if (patch.size !== undefined) layout[region].size = Math.round(Math.min(2000, Math.max(120, patch.size)));
  return layout;
}

/** Remembers the size of a resizable pane (px, or a ratio between 0 and 1 for splits). */
export function setPaneSize(input: Layout, id: string, size: number): Layout {
  if (!id || !Number.isFinite(size)) return input;
  const layout = clone(input);
  layout.panes[id] =
    size <= 1
      ? Math.round(Math.max(0.1, Math.min(0.9, size)) * 1000) / 1000
      : Math.round(Math.min(4000, Math.max(48, size)));
  return layout;
}

export function toggleRegion(input: Layout, region: SideRegion): Layout {
  return setRegion(input, region, { collapsed: !input[columnOf(region)].collapsed });
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

/**
 * A view dropped on a region's tab bar (drag and drop): moved there if it was elsewhere,
 * placed before `beforeId` (or at the end), and shown.
 */
export function dropView(input: Layout, viewId: string, region: SideRegion, beforeId?: string): Layout {
  if (viewId === beforeId) return input;
  let layout = regionOf(input, viewId) === region ? input : moveView(input, viewId, region);
  if (regionOf(layout, viewId) !== region) return layout;
  const others = layout[region].views.filter((v) => v !== viewId);
  const at = beforeId && others.includes(beforeId) ? others.indexOf(beforeId) : others.length;
  layout = reorderView(layout, viewId, at);
  layout = clone(layout);
  layout[region].active = viewId;
  layout[columnOf(region)].collapsed = false;
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
  /** Tabs never closed to make room (unsaved work). */
  keep: Set<string> = new Set(),
): { layout: Layout; tabId: string } {
  const params = tab.params ?? {};
  const key = tabKey({ type: tab.type, params });
  const existing = input.main.tabs.find((t) => tabKey(t) === key);
  if (existing) return { layout: activateTab(input, existing.id), tabId: existing.id };
  const layout = clone(input);
  const id = tab.id ?? newTabId();
  const activeIndex = layout.main.tabs.findIndex((t) => t.id === layout.main.active);
  layout.main.tabs.splice(activeIndex < 0 ? layout.main.tabs.length : activeIndex + 1, 0, {
    id,
    type: tab.type,
    params,
  });
  layout.main.active = id;
  // A new tab opens in the pane that has focus.
  if (layout.main.split?.focus === "right") layout.main.split.right.push(id);
  while (layout.main.tabs.length > MAX_TABS) {
    const victim = layout.main.tabs.findIndex((t) => !t.pinned && t.id !== id && !keep.has(t.id));
    if (victim < 0) break;
    layout.main.tabs.splice(victim, 1);
  }
  normalizeSplit(layout);
  return { layout, tabId: id };
}

export type MainPane = "left" | "right";

/** The pane a tab is in (always left without a split). */
export function paneOf(layout: Layout, tabId: string): MainPane {
  return layout.main.split?.right.includes(tabId) ? "right" : "left";
}

/** The tabs of a pane, in order. */
export function paneTabs(layout: Layout, pane: MainPane): LayoutTab[] {
  return layout.main.tabs.filter((t) => paneOf(layout, t.id) === pane);
}

/** The active tab of a pane. */
export function paneActive(layout: Layout, pane: MainPane): string | undefined {
  const split = layout.main.split;
  if (!split) return pane === "left" ? layout.main.active : undefined;
  return pane === split.focus ? layout.main.active : split.other;
}

/** A neighbour of `index` in `list` after removing it: the next one, else the previous one. */
const neighbour = (list: LayoutTab[], index: number) => (list[index + 1] ?? list[index - 1])?.id;

/** Keeps a split consistent: known tabs only, both panes non-empty, actives in their panes. */
function normalizeSplit(layout: Layout): void {
  const split = layout.main.split;
  if (!split) return;
  const ids = new Set(layout.main.tabs.map((t) => t.id));
  split.right = layout.main.tabs.filter((t) => split.right.includes(t.id)).map((t) => t.id);
  const left = layout.main.tabs.filter((t) => !split.right.includes(t.id)).map((t) => t.id);
  if (!split.right.length || !left.length) {
    // One pane left: the split ends; the focused tab stays active if it still exists.
    const keep = [layout.main.active, split.other].find((id) => id && ids.has(id));
    delete layout.main.split;
    layout.main.active = keep ?? layout.main.tabs[0]?.id;
    return;
  }
  const focused = split.focus === "right" ? split.right : left;
  const other = split.focus === "right" ? left : split.right;
  if (!layout.main.active || !focused.includes(layout.main.active)) layout.main.active = focused[0];
  if (!split.other || !other.includes(split.other)) split.other = other[0];
}

/**
 * Opens a tab in the other pane ("Open to the side", or dropped on the other side): splits the main
 * area if needed. The tab's old pane keeps its own active tab. A pane's only tab can't leave a split
 * of one (nothing would be left beside it).
 */
export function moveTabToPane(input: Layout, tabId: string, pane: MainPane): Layout {
  const tabs = input.main.tabs;
  if (!tabs.some((t) => t.id === tabId)) return input;
  const from = paneOf(input, tabId);
  if (from === pane) return activateTab(input, tabId);
  const layout = clone(input);
  const fromTabs = paneTabs(layout, from);
  const fromActive = paneActive(layout, from);
  const index = fromTabs.findIndex((t) => t.id === tabId);
  const staysActive = fromActive === tabId ? neighbour(fromTabs, index) : fromActive;
  if (!layout.main.split) {
    if (fromTabs.length < 2) return input;
    layout.main.split = { right: [], focus: "left" };
  }
  const split = layout.main.split;
  if (pane === "right") split.right.push(tabId);
  else split.right = split.right.filter((id) => id !== tabId);
  split.focus = pane;
  split.other = staysActive;
  layout.main.active = tabId;
  normalizeSplit(layout);
  return layout;
}

/** Ends the split: every tab back in one pane. */
export function unsplit(input: Layout): Layout {
  if (!input.main.split) return input;
  const layout = clone(input);
  delete layout.main.split;
  return layout;
}

/** Closes a tab; the neighbour to the right (else left) becomes active. */
export function closeTab(input: Layout, tabId: string): Layout {
  const index = input.main.tabs.findIndex((t) => t.id === tabId);
  if (index < 0) return input;
  const layout = clone(input);
  const pane = paneOf(layout, tabId);
  const inPane = paneTabs(layout, pane);
  const next = neighbour(
    inPane,
    inPane.findIndex((t) => t.id === tabId),
  );
  layout.main.tabs.splice(index, 1);
  const split = layout.main.split;
  if (split) {
    split.right = split.right.filter((id) => id !== tabId);
    if (split.focus === pane && layout.main.active === tabId) layout.main.active = next;
    else if (split.focus !== pane && split.other === tabId) split.other = next;
    if (!next && split.focus === pane) {
      // Its pane is empty now: focus goes to the other pane.
      layout.main.active = split.other;
      split.focus = pane === "left" ? "right" : "left";
    }
    normalizeSplit(layout);
  } else if (layout.main.active === tabId) layout.main.active = next;
  return layout;
}

export function closeOtherTabs(input: Layout, keepId: string): Layout {
  const layout = clone(input);
  layout.main.tabs = layout.main.tabs.filter((t) => t.id === keepId || t.pinned);
  layout.main.active = keepId;
  delete layout.main.split;
  return layout;
}

/** Closes every tab matching `predicate` (e.g. all tabs of a removed project). */
export function closeTabsWhere(input: Layout, predicate: (tab: LayoutTab) => boolean): Layout {
  return input.main.tabs.filter(predicate).reduce((l, t) => closeTab(l, t.id), input);
}

/** Activates a tab; in a split, its pane gets the focus (the other pane keeps its tab). */
export function activateTab(input: Layout, tabId: string): Layout {
  if (!input.main.tabs.some((t) => t.id === tabId)) return input;
  const layout = clone(input);
  const split = layout.main.split;
  if (split) {
    const pane = paneOf(layout, tabId);
    if (pane !== split.focus) {
      split.other = layout.main.active;
      split.focus = pane;
    }
  }
  layout.main.active = tabId;
  return layout;
}

/** Activates the next (+1) or previous (−1) tab of the focused pane, wrapping around. */
export function cycleTab(input: Layout, delta: 1 | -1): Layout {
  const tabs = paneTabs(input, input.main.split?.focus ?? "left");
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

/** Saves where every view is under a name (replacing one with the same name). Open tabs aren't saved. */
export function saveNamedLayout(input: Layout, name: string): Layout {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new Error("A layout needs a name");
  const layout = clone(input);
  const snapshot: SavedLayout = {
    name: trimmed,
    left: structuredClone(layout.left),
    left2: structuredClone(layout.left2),
    right: structuredClone(layout.right),
    right2: structuredClone(layout.right2),
    bottom: structuredClone(layout.bottom),
    hidden: [...layout.hidden],
    panes: { ...layout.panes },
  };
  const others = layout.saved.filter((l) => l.name.toLowerCase() !== trimmed.toLowerCase());
  layout.saved = [...others, snapshot].slice(-MAX_SAVED_LAYOUTS);
  return layout;
}

/**
 * Switches to a named layout: its regions, hidden views and pane sizes. Open tabs and the other named
 * layouts stay; `normalizeLayout` then places views that are new since and closes view tabs whose
 * view is now in a region.
 */
export function applyNamedLayout(input: Layout, name: string): Layout {
  const saved = input.saved.find((l) => l.name === name);
  if (!saved) throw new Error(`No layout named "${name}"`);
  const layout = clone(input);
  for (const r of SIDE_REGIONS) layout[r] = structuredClone(saved[r]);
  layout.hidden = [...saved.hidden];
  layout.panes = { ...saved.panes };
  return layout;
}

export function deleteNamedLayout(input: Layout, name: string): Layout {
  const layout = clone(input);
  layout.saved = layout.saved.filter((l) => l.name !== name);
  return layout;
}
