import { type AddonTarget, addonTabType, addonViewId, type JigEventName } from "@jig/sdk";
import { create } from "zustand";
import type { AddonInfo } from "../../shared/addons";
import { call, errorMessage } from "../lib/host";
import { workbench } from "../workbench/store";
import { notify } from "../workbench/toasts";

/**
 * What add-ons share in the renderer (D-215): the add-ons other add-ons can see, the views' badges,
 * Jig's events, and where a toast button or a search result leads.
 */

/** The add-ons the host reported (set by the loader), for `ctx.addons.list()`. */
let known: AddonInfo[] = [];
export function setKnownAddons(addons: AddonInfo[]): void {
  known = addons;
}
export function knownAddons(): AddonInfo[] {
  return known;
}

/** Badges on add-on views, by full view id (`addon.<id>.<view>`). */
export const useBadges = create<{ badges: Record<string, string> }>(() => ({ badges: {} }));
export function setBadges(badges: Record<string, string>): void {
  useBadges.setState({ badges });
}

const jigListeners = new Set<(name: JigEventName, payload: unknown) => void>();
export function dispatchJigEvent(name: JigEventName, payload: unknown): void {
  for (const listener of jigListeners) listener(name, payload);
}
export function onJigEvent(listener: (name: JigEventName, payload: unknown) => void): () => void {
  jigListeners.add(listener);
  return () => jigListeners.delete(listener);
}

/** Opens what a toast button or a search result points at, on behalf of add-on `addonId`. */
export function openAddonTarget(addonId: string, target: AddonTarget): void {
  const failed = (e: unknown) => notify({ title: "Can't open", message: errorMessage(e), tone: "warning" });
  if ("run" in target)
    void call("addons.call", { id: addonId, method: target.run, args: target.args }).catch(failed);
  else if ("view" in target)
    workbench.showView(/^(addon|jig)\./.test(target.view) ? target.view : addonViewId(addonId, target.view));
  else if ("tab" in target) void workbench.openTab(addonTabType(addonId, target.tab), target.params);
  else if ("url" in target) void call("app.openExternal", { url: target.url }).catch(failed);
  else if ("file" in target) void workbench.openTab("jig.preview", { path: target.file });
}
