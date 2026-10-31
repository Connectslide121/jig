import { create } from "zustand";
import {
  activateTab,
  closeTab,
  defaultLayout,
  dropView,
  findView,
  hideView,
  type Layout,
  moveView,
  normalizeLayout,
  openTab,
  openViewTab,
  type SideRegion,
  setPaneSize,
  setRegion,
  showView,
  splitBeside,
  toggleRegion,
  updateTabParams,
} from "../../shared/layout";
import { call } from "../lib/host";
import { confirmClose, dirtyTabIds } from "./dirty";
import { useRegistry } from "./registry";

/**
 * The workbench layout in the renderer. Edits go through `updateLayout(fn)` with the pure functions
 * from shared/layout.ts; the result is normalised against the registered views and saved (debounced).
 */
interface WorkbenchState {
  layout: Layout | undefined;
}

export const useWorkbench = create<WorkbenchState>(() => ({ layout: undefined }));

/** Drag data of a view (a sidebar's view tab, or the main-area tab of a view): its id. */
export const VIEW_DRAG = "application/x-jig-view";

/** The view being dragged, so every place it can go shows a drop target (sidebars, bottom, main). */
export const useViewDrag = create<{ viewId?: string }>(() => ({}));
export const startViewDrag = (viewId: string) => useViewDrag.setState({ viewId });
// A drop can unmount the dragged tab, so its own dragend may never come: end it on any drop or dragend.
if (typeof window !== "undefined")
  for (const type of ["drop", "dragend"])
    window.addEventListener(type, () => setTimeout(() => useViewDrag.setState({ viewId: undefined })), true);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(layout: Layout) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void call("layout.set", layout).catch(() => {}), 300);
}

function placements() {
  return Object.values(useRegistry.getState().views).map((v) => ({
    id: v.id,
    defaultRegion: v.defaultRegion,
    reveal: v.reveal,
    hidden: v.startHidden,
  }));
}

export function setLayoutFromHost(layout: Layout): void {
  // The host's layout is newer than a local change still waiting to be saved: don't overwrite it.
  clearTimeout(saveTimer);
  useWorkbench.setState({ layout: normalizeLayout(layout, placements()) });
}

export function updateLayout(fn: (layout: Layout) => Layout): void {
  const current = useWorkbench.getState().layout;
  if (!current) return;
  const next = normalizeLayout(fn(current), placements());
  useWorkbench.setState({ layout: next });
  scheduleSave(next);
}

/** Re-normalise whenever views are registered or removed (add-ons loading). */
useRegistry.subscribe((state, previous) => {
  if (state.views !== previous.views && useWorkbench.getState().layout) updateLayout((l) => l);
});

export const workbench = {
  openTab(type: string, params: Record<string, unknown> = {}): string {
    const layout = useWorkbench.getState().layout;
    const existing = layout?.main.tabs.find((t) => t.type === type);
    if (existing && useRegistry.getState().tabTypes[type]?.singleton) {
      updateLayout((l) => activateTab(updateTabParams(l, existing.id, params), existing.id));
      return existing.id;
    }
    let id = "";
    updateLayout((l) => {
      const result = openTab(l, { type, params }, dirtyTabIds());
      id = result.tabId;
      return result.layout;
    });
    return id;
  },
  /** Closes a tab (asking first when it has unsaved work). */
  async closeTab(tabId: string) {
    if (await confirmClose([tabId])) updateLayout((l) => closeTab(l, tabId));
  },
  /** Closes several tabs (asking once if any has unsaved work). */
  async closeTabs(tabIds: string[]) {
    if (!tabIds.length || !(await confirmClose(tabIds))) return;
    updateLayout((l) => tabIds.reduce((acc, id) => closeTab(acc, id), l));
  },
  activateTab: (tabId: string) => updateLayout((l) => activateTab(l, tabId)),
  moveView: (viewId: string, region: SideRegion) => updateLayout((l) => moveView(l, viewId, region)),
  /** A view dragged onto a region's tab bar, before another view's tab (or at the end). */
  dropView: (viewId: string, region: SideRegion, beforeId?: string) =>
    updateLayout((l) => dropView(l, viewId, region, beforeId)),
  hideView: (viewId: string) => updateLayout((l) => hideView(l, viewId)),
  /** Shows a view in the lower half of the sidebar another view is in (a split sidebar). */
  splitBeside: (viewId: string, hostId: string) => updateLayout((l) => splitBeside(l, viewId, hostId)),
  /** Every view back where it started, every size and sidebar as new. Open tabs stay. */
  resetLayout: () => updateLayout((l) => ({ ...defaultLayout(), main: l.main })),
  /** Opens a view as a tab in the main area (out of its sidebar). */
  openViewTab: (viewId: string) => updateLayout((l) => openViewTab(l, viewId).layout),
  /** Shows a view where it is: its sidebar tab, or (not in a sidebar) a tab in the main area. */
  showView(viewId: string) {
    const layout = useWorkbench.getState().layout;
    if (layout && findView(layout, viewId) === "hidden") {
      updateLayout((l) => openViewTab(l, viewId).layout);
      return;
    }
    const fallback = useRegistry.getState().views[viewId]?.defaultRegion ?? "left";
    updateLayout((l) => showView(l, viewId, fallback));
  },
  toggleRegion: (region: SideRegion) => updateLayout((l) => toggleRegion(l, region)),
  resizeRegion: (region: SideRegion, size: number) => updateLayout((l) => setRegion(l, region, { size })),
  resizePane: (id: string, size: number) => updateLayout((l) => setPaneSize(l, id, size)),
  resetPane: (id: string) =>
    updateLayout((l) => {
      const panes = { ...l.panes };
      delete panes[id];
      return { ...l, panes };
    }),
  activeTab() {
    const layout = useWorkbench.getState().layout;
    return layout?.main.tabs.find((t) => t.id === layout.main.active);
  },
};
