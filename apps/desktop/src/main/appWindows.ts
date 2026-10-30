import { app, BrowserWindow } from "electron";

/** Hidden windows Jig owns for itself (Claude's browser): never shown, never sent Jig's events. */
const helpers = new WeakSet<BrowserWindow>();

export function markHelperWindow(window: BrowserWindow): void {
  helpers.add(window);
}

/** Jig's own visible windows: what "all windows" means for events, focus and quitting. */
export function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !helpers.has(w) && !w.isDestroyed());
}

/**
 * Brings Jig to the front, from a clicked notification or a second launch. Windows refuses focus to a
 * process that isn't in the foreground, so the window is briefly put on top to take it.
 */
export function focusJig(): void {
  const window = appWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  if (process.platform === "win32") {
    window.setAlwaysOnTop(true);
    window.focus();
    window.setAlwaysOnTop(false);
  } else {
    app.focus({ steal: true });
    window.focus();
  }
  window.moveTop();
}

/** When the last app window closes, the helpers go too, so the app can quit. */
export function closeHelpersIfAlone(): void {
  if (appWindows().length > 0) return;
  for (const w of BrowserWindow.getAllWindows()) if (helpers.has(w) && !w.isDestroyed()) w.destroy();
}
