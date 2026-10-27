import { app, BrowserWindow, Menu } from "electron";
import { registerAppHandlers } from "./app";
import { loadConfig, registerConfigHandlers } from "./config";
import { installRouter } from "./ipc/router";
import { registerLayoutHandlers } from "./layout";
import { logger } from "./log";
import { startProjects } from "./projects";
import { installAppProtocol, registerSchemes } from "./protocols";
import { registerScriptHandlers } from "./scripts";
import { startSessions } from "./sessions";
import { jigHome } from "./state/paths";
import { startTerminals, stopTerminals } from "./terminals";
import { startThemes } from "./themes";
import { createMainWindow } from "./window";

const log = logger("main");

registerSchemes();

// One Jig per state directory: a second launch focuses the first window.
if (!app.requestSingleInstanceLock({ jigHome: jigHome() })) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  void start();
}

async function start() {
  await app.whenReady();
  log.info(`Starting Jig ${app.getVersion()} (home: ${jigHome()})`);
  installAppProtocol();
  installApplicationMenu();
  await loadConfig();
  installRouter();
  registerAppHandlers();
  registerConfigHandlers();
  registerLayoutHandlers();
  startProjects();
  startSessions();
  startTerminals();
  registerScriptHandlers();
  await startThemes();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
}

app.on("will-quit", () => stopTerminals());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/**
 * No native menu bar on Windows/Linux: every menu is Jig's own (D-023). macOS keeps a minimal
 * application menu, because Cmd+C/V/X/A/Z/Q only work through menu roles there.
 */
function installApplicationMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]),
  );
}
