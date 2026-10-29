import { create } from "zustand";
import { confirmDialog } from "../ui";

/**
 * Tabs with unsaved work (an edited file in Preview): closing one asks first, the tab bar shows a dot,
 * and they are never closed to make room for new tabs.
 */
export const useDirtyTabs = create<{ tabs: Record<string, string> }>(() => ({ tabs: {} }));

/** Marks a tab as having unsaved work (`label`: what, e.g. the file name) or clean (`undefined`). */
export function setTabDirty(tabId: string, label: string | undefined): void {
  const tabs = useDirtyTabs.getState().tabs;
  if ((tabs[tabId] ?? undefined) === label) return;
  const next = { ...tabs };
  if (label === undefined) delete next[tabId];
  else next[tabId] = label;
  useDirtyTabs.setState({ tabs: next });
}

export const dirtyTabIds = () => new Set(Object.keys(useDirtyTabs.getState().tabs));

/** True when the tabs may close: none has unsaved work, or you chose to discard it. */
export async function confirmClose(tabIds: string[]): Promise<boolean> {
  const tabs = useDirtyTabs.getState().tabs;
  const dirty = tabIds.filter((id) => tabs[id] !== undefined).map((id) => tabs[id]!);
  if (!dirty.length) return true;
  const ok = await confirmDialog({
    title:
      dirty.length === 1
        ? `Discard your changes to ${dirty[0]}?`
        : `Discard unsaved changes in ${dirty.length} files?`,
    message: dirty.length === 1 ? "They aren't saved yet." : `${dirty.join(", ")} aren't saved yet.`,
    confirmLabel: "Discard",
    danger: true,
  });
  if (ok) for (const id of tabIds) setTabDirty(id, undefined);
  return ok;
}
