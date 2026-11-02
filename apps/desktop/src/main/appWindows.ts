import { app, BrowserWindow, shell } from "electron";

/**
 * Jig runs hidden (`JIG_HIDDEN`, as the e2e tests run it): no window is ever shown, focused or brought
 * to the front, and no system notification pops up, so tests never take the user's screen.
 */
export function hiddenMode(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.JIG_HIDDEN);
}

/** Opens a link in the user's browser; nothing opens while Jig runs hidden (tests). */
export async function openExternal(url: string): Promise<void> {
  if (!hiddenMode()) await shell.openExternal(url);
}

/** Shows a file in Explorer/Finder; nothing opens while Jig runs hidden. */
export function showInFolder(path: string): void {
  if (!hiddenMode()) shell.showItemInFolder(path);
}

/** Opens a file with its app: an error message, or "" (also "" while Jig runs hidden). */
export function openPath(path: string): Promise<string> {
  return hiddenMode() ? Promise.resolve("") : shell.openPath(path);
}

/** Shows a window and gives it focus, unless Jig runs hidden. */
export function revealWindow(window: BrowserWindow): void {
  if (hiddenMode() || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

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
  if (!window || hiddenMode()) return;
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
