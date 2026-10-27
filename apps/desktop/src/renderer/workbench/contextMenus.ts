import type { MenuTarget } from "@jig/sdk";
import type { MenuEntry } from "../ui";

/**
 * Entries other code contributes to right-click menus (`context.*` slots). The code that shows a
 * menu calls `contributedEntries(target)` and appends them.
 */
type Contributor = (target: MenuTarget) => MenuEntry[];
const contributors = new Map<MenuTarget["slot"], Set<Contributor>>();

export function contributeMenu(slot: MenuTarget["slot"], fn: Contributor): () => void {
  const set = contributors.get(slot) ?? new Set();
  set.add(fn);
  contributors.set(slot, set);
  return () => set.delete(fn);
}

export function contributedEntries(target: MenuTarget): MenuEntry[] {
  return [...(contributors.get(target.slot) ?? [])].flatMap((fn) => {
    try {
      return fn(target);
    } catch {
      return [];
    }
  });
}
