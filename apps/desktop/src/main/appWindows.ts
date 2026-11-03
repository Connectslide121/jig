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
 * Jig's main window: the first of its windows that isn't one waiting in the background (the meeting
 * window opens hidden at start to ring for calls, so it can come first in the list).
 */
export function mainWindow(): BrowserWindow | undefined {
  const windows = appWindows();
  return windows.find((w) => !background.has(w)) ?? windows[0];
}

/**
 * Brings Jig's main window to the front, from a clicked notification or a second launch. Windows
 * refuses focus to a process that isn't in the foreground, so the window is briefly put on top to take it.
 */
export function focusJig(): void {
  const window = mainWindow();
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

/**
 * Windows that may wait hidden in the background (the meeting window listening for Teams calls):
 * they are Jig's windows, but don't keep Jig running on their own while `idle()` says so.
 */
const background = new WeakMap<BrowserWindow, () => boolean>();

export function markBackgroundWindow(window: BrowserWindow, idle: () => boolean): void {
  background.set(window, idle);
}

/** When the last app window closes, the helpers (and idle background windows) go too, so the app can quit. */
export function closeHelpersIfAlone(): void {
  const left = appWindows();
  const idle = (w: BrowserWindow) => !w.isVisible() && Boolean(background.get(w)?.());
  if (!left.every(idle)) return;
  for (const w of left) w.destroy();
  for (const w of BrowserWindow.getAllWindows()) if (helpers.has(w) && !w.isDestroyed()) w.destroy();
}
