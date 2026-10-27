import { create } from "zustand";
import {
  activateTab,
  closeTab,
  hideView,
  type Layout,
  moveView,
  normalizeLayout,
  openTab,
  type SideRegion,
  setRegion,
  showView,
  toggleRegion,
  updateTabParams,
} from "../../shared/layout";
import { call } from "../lib/host";
import { useRegistry } from "./registry";

/**
 * The workbench layout in the renderer. Edits go through `updateLayout(fn)` with the pure functions
 * from shared/layout.ts; the result is normalised against the registered views and saved (debounced).
 */
interface WorkbenchState {
  layout: Layout | undefined;
}

export const useWorkbench = create<WorkbenchState>(() => ({ layout: undefined }));

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(layout: Layout) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void call("layout.set", layout).catch(() => {}), 300);
}

function placements() {
  return Object.values(useRegistry.getState().views).map((v) => ({
    id: v.id,
    defaultRegion: v.defaultRegion,
    reveal: v.owner !== undefined && v.owner !== "core",
  }));
}

export function setLayoutFromHost(layout: Layout): void {
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
      const result = openTab(l, { type, params });
      id = result.tabId;
      return result.layout;
    });
    return id;
  },
  closeTab: (tabId: string) => updateLayout((l) => closeTab(l, tabId)),
  activateTab: (tabId: string) => updateLayout((l) => activateTab(l, tabId)),
  moveView: (viewId: string, region: SideRegion) => updateLayout((l) => moveView(l, viewId, region)),
  hideView: (viewId: string) => updateLayout((l) => hideView(l, viewId)),
  showView(viewId: string) {
    const fallback = useRegistry.getState().views[viewId]?.defaultRegion ?? "left";
    updateLayout((l) => showView(l, viewId, fallback));
  },
  toggleRegion: (region: SideRegion) => updateLayout((l) => toggleRegion(l, region)),
  resizeRegion: (region: SideRegion, size: number) => updateLayout((l) => setRegion(l, region, { size })),
  activeTab() {
    const layout = useWorkbench.getState().layout;
    return layout?.main.tabs.find((t) => t.id === layout.main.active);
  },
};
