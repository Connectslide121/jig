import { writeFile } from "node:fs/promises";
import { app, BrowserWindow, Menu } from "electron";
import { addonNodePaths, addonThemes, installAddonProtocol, onAddonsChange, startAddons } from "./addons";
import { registerAppHandlers } from "./app";
import { startBuilder } from "./builder";
import { loadConfig, registerConfigHandlers } from "./config";
import { startConfigure } from "./configure";
import { registerFileHandlers } from "./files";
import { installRouter } from "./ipc/router";
import { registerLayoutHandlers } from "./layout";
import { startLearning } from "./learning";
import { logger } from "./log";
import { startProjects } from "./projects";
import { installAppProtocol, registerSchemes } from "./protocols";
import { registerScriptHandlers } from "./scripts";
import { startSessions } from "./sessions";
import { registerSetupHandlers } from "./setup";
import { jigHome } from "./state/paths";
import { startTerminals, stopTerminals } from "./terminals";
import { startThemes, themeService } from "./themes";
import { startUsage, stopUsage } from "./usage";
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
  installAddonProtocol();
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
  registerFileHandlers();
  registerSetupHandlers();
  startUsage();
  await startThemes(addonThemes);
  await startAddons();
  onAddonsChange(() => themeService().refresh());
  await startBuilder(addonNodePaths());
  startConfigure();
  await startLearning();
  await createMainWindow();
  await reportReady();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
}

/** The launcher waits for this file to know the new build started (docs/reference/setup.md → Updates). */
async function reportReady() {
  const file = process.env.JIG_READY_FILE;
  if (!file) return;
  await writeFile(file, String(process.pid)).catch((e) => log.warn("Writing the ready file failed", e));
}

app.on("will-quit", () => {
  stopTerminals();
  stopUsage();
});

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
