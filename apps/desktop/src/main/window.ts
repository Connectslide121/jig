import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, screen, shell } from "electron";
import { z } from "zod";
import { logger } from "./log";
import { readJson, writeJson } from "./state/jsonStore";
import { paths } from "./state/paths";

const log = logger("window");
const here = fileURLToPath(new URL(".", import.meta.url));

const WindowStateSchema = z.object({
  width: z.number().default(1440),
  height: z.number().default(900),
  x: z.number().optional(),
  y: z.number().optional(),
  maximized: z.boolean().default(false),
});

export const TITLEBAR_HEIGHT = 40;

/** Creates the main window, restoring its last size and position. */
export async function createMainWindow(): Promise<BrowserWindow> {
  const state = await readJson(paths.windowState(), WindowStateSchema);
  const onScreen =
    state.x !== undefined &&
    state.y !== undefined &&
    screen
      .getAllDisplays()
      .some(
        ({ workArea: a }) =>
          state.x! >= a.x - 50 &&
          state.y! >= a.y - 50 &&
          state.x! < a.x + a.width &&
          state.y! < a.y + a.height,
      );

  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: onScreen ? state.x : undefined,
    y: onScreen ? state.y : undefined,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: "Jig",
    // Taskbar/window icon when Jig runs from a clone (packaged builds have it in the executable too).
    icon: join(here, "../../build/icon.png"),
    backgroundColor: "#1e1f22", // jig-tokens-ignore-line — first paint before the theme loads
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay:
      process.platform === "darwin"
        ? undefined
        : { color: "#00000000", symbolColor: "#a0a0a0", height: TITLEBAR_HEIGHT }, // jig-tokens-ignore-line
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      // Chromium's own PDF viewer, for PDF previews (a PDF can't run code in Jig).
      plugins: true,
    },
  });

  if (state.maximized) window.maximize();
  window.once("ready-to-show", () => {
    if (!process.env.JIG_HIDDEN) window.show();
  });

  let saveTimer: NodeJS.Timeout | undefined;
  const saveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (window.isDestroyed()) return;
      const bounds = window.getNormalBounds();
      void writeJson(paths.windowState(), { ...bounds, maximized: window.isMaximized() });
    }, 400);
  };
  window.on("resize", saveState);
  window.on("move", saveState);
  window.on("maximize", saveState);
  window.on("unmaximize", saveState);

  // Links open in the user's browser, never inside Jig.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  const devUrl = process.env.JIG_RENDERER_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadURL("jig-app://app/index.html");
  log.info(`Main window loaded (${devUrl ? "dev server" : "bundled renderer"})`);
  return window;
}

/** Updates the native window-control colours to match the theme (Windows/Linux). */
export function setTitleBarColours(window: BrowserWindow, symbolColor: string): void {
  if (process.platform === "darwin" || window.isDestroyed()) return;
  try {
    window.setTitleBarOverlay({ color: "#00000000", symbolColor, height: TITLEBAR_HEIGHT }); // jig-tokens-ignore-line
  } catch {
    // Not supported on every platform/window manager.
  }
}
