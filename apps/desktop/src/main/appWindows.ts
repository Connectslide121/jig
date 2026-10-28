import { BrowserWindow } from "electron";

/** Hidden windows Jig owns for itself (Claude's browser): never shown, never sent Jig's events. */
const helpers = new WeakSet<BrowserWindow>();

export function markHelperWindow(window: BrowserWindow): void {
  helpers.add(window);
}

/** Jig's own visible windows: what "all windows" means for events, focus and quitting. */
export function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !helpers.has(w) && !w.isDestroyed());
}

/** When the last app window closes, the helpers go too, so the app can quit. */
export function closeHelpersIfAlone(): void {
  if (appWindows().length > 0) return;
  for (const w of BrowserWindow.getAllWindows()) if (helpers.has(w) && !w.isDestroyed()) w.destroy();
}
