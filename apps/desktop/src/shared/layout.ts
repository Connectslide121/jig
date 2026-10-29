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
  /**
   * Views shown as collapsible sections below another view, in the same tab (like GitLens below
   * Source Control in VS Code): host view id → section view ids, top to bottom.
   */
  sections: z.record(z.string(), z.array(z.string())).default({}),
  /** Sections that are collapsed to their header. */
  closedSections: z.array(z.string()).default([]),
  /** Views placed in a region for now because the view they go below hasn't loaded yet. */
  waitingUnder: z.array(z.string()).default([]),
  /** Sizes of resizable panes inside views and tabs (`Pane id` → px, or a 0–1 ratio for splits). */
  panes: z.record(z.string(), z.number()).default({}),
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
  /** Placed for the first time as a section below this view (`addon.git.git`), when it exists. */
  under?: string;
}

export const MAX_TABS = 50;

function clone(layout: Layout): Layout {
  return structuredClone(layout);
}

/** The view a section is shown below, if `viewId` is a section. */
export function hostOf(layout: Layout, viewId: string): string | undefined {
  return Object.keys(layout.sections).find((host) => layout.sections[host]!.includes(viewId));
}

/** The region a view is in (a section: its host's region). */
function regionOf(layout: Layout, viewId: string): SideRegion | undefined {
  const host = hostOf(layout, viewId);
  const id = host ?? viewId;
  return SIDE_REGIONS.find((r) => layout[r].views.includes(id));
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
  for (const host of Object.keys(layout.sections)) {
    const list = layout.sections[host]!.filter((v) => v !== viewId);
    if (list.length) layout.sections[host] = list;
    else delete layout.sections[host];
  }
  layout.waitingUnder = layout.waitingUnder.filter((v) => v !== viewId);
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
  // Sections: one level only, each view once, never below itself.
  for (const host of Object.keys(layout.sections)) {
    const list = layout.sections[host]!.filter((v) => v !== host && !seen.has(v) && seen.add(v));
    if (list.length) layout.sections[host] = list;
    else delete layout.sections[host];
  }
  layout.closedSections = layout.closedSections.filter((v) => hostOf(layout, v));
  const byId = new Map(views.map((v) => [v.id, v]));
  const placed = (id: string) => known.has(id) && seen.has(id) && !hostOf(layout, id);
  // New views: those that go below another view after the others, so that one is placed first.
  const fresh = views
    .filter((v) => !seen.has(v.id))
    .sort((a, b) => Number(Boolean(a.under)) - Number(Boolean(b.under)));
  for (const view of fresh) {
    seen.add(view.id);
    if (view.under && view.under !== view.id) {
      if (placed(view.under)) {
        layout.sections[view.under] = [...(layout.sections[view.under] ?? []), view.id];
        continue;
      }
      layout.waitingUnder.push(view.id);
    }
    layout[view.defaultRegion].views.push(view.id);
    if (view.reveal) {
      layout[view.defaultRegion].collapsed = false;
      layout[view.defaultRegion].active = view.id;
    }
  }
  // A view waiting for the view it goes below: move it there once that one is placed.
  layout.waitingUnder = layout.waitingUnder.filter((id) => {
    const under = byId.get(id)?.under;
    if (!under || !seen.has(id)) return false;
    if (!placed(under)) return true;
    const region = regionOf(layout, id);
    if (region) {
      const r = layout[region];
      r.views = r.views.filter((v) => v !== id);
      if (r.active === id) r.active = undefined;
      layout.sections[under] = [...(layout.sections[under] ?? []), id];
    }
    return false;
  });
  for (const r of SIDE_REGIONS) {
    const region = layout[r];
    if (!region.active || !region.views.includes(region.active))
      region.active = region.views.find((v) => known.has(v)) ?? region.views[0];
  }
  if (layout.main.active && !layout.main.tabs.some((t) => t.id === layout.main.active))
    layout.main.active = layout.main.tabs[0]?.id;
  normalizeSplit(layout);
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

/**
 * Shows a view: un-hides it (into `fallback`) if needed, activates it and expands its region. A
 * section: its host is activated and the section opened.
 */
export function showView(input: Layout, viewId: string, fallback: SideRegion): Layout {
  const region = regionOf(input, viewId);
  if (!region) return moveView(input, viewId, fallback);
  const layout = clone(input);
  layout[region].active = hostOf(layout, viewId) ?? viewId;
  layout[region].collapsed = false;
  layout.closedSections = layout.closedSections.filter((v) => v !== viewId);
  return layout;
}

/**
 * Shows `viewId` as a section below `hostId`, in the host's tab. A view that had sections of its own
 * hands them to the host (sections are one level deep). Nothing happens for a host that is itself a
 * section.
 */
export function placeBelow(input: Layout, viewId: string, hostId: string): Layout {
  if (viewId === hostId || hostOf(input, hostId)) return input;
  const layout = clone(input);
  const own = layout.sections[viewId] ?? [];
  delete layout.sections[viewId];
  removeEverywhere(layout, viewId);
  layout.sections[hostId] = [...(layout.sections[hostId] ?? []), viewId, ...own];
  layout.closedSections = layout.closedSections.filter((v) => v !== viewId);
  const region = regionOf(layout, hostId);
  if (region) {
    layout[region].active = hostId;
    layout[region].collapsed = false;
  }
  return layout;
}

/** Collapses a section to its header, or opens it again. */
export function toggleSection(input: Layout, viewId: string): Layout {
  const layout = clone(input);
  layout.closedSections = layout.closedSections.includes(viewId)
    ? layout.closedSections.filter((v) => v !== viewId)
    : [...layout.closedSections, viewId];
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
  return setRegion(input, region, { collapsed: !input[region].collapsed });
}

/** Moves a view within its region's tab strip. */
export function reorderView(input: Layout, viewId: string, toIndex: number): Layout {
  const region = regionOf(input, viewId);
  if (!region) return input;
  const layout = clone(input);
  const views = layout[region].views;
  // A section (shown below another view) isn't in the strip: dropView moves it there first.
  if (!views.includes(viewId)) return input;
  views.splice(views.indexOf(viewId), 1);
  views.splice(Math.max(0, Math.min(toIndex, views.length)), 0, viewId);
  return layout;
}

/**
 * A view dropped on a region's tab bar (drag and drop): moved there if it was elsewhere (or a section),
 * placed before `beforeId` (or at the end), and shown.
 */
export function dropView(input: Layout, viewId: string, region: SideRegion, beforeId?: string): Layout {
  if (viewId === beforeId) return input;
  const inStrip = regionOf(input, viewId) === region && !hostOf(input, viewId);
  let layout = inStrip ? input : moveView(input, viewId, region);
  if (regionOf(layout, viewId) !== region) return layout;
  const others = layout[region].views.filter((v) => v !== viewId);
  const at = beforeId && others.includes(beforeId) ? others.indexOf(beforeId) : others.length;
  layout = reorderView(layout, viewId, at);
  return { ...layout, [region]: { ...layout[region], active: viewId, collapsed: false } };
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
