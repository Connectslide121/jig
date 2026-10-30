import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, Menu } from "electron";
import { registerAboutHandlers } from "./about";
import { addonNodePaths, addonThemes, installAddonProtocol, onAddonsChange, startAddons } from "./addons";
import { registerAiHandlers } from "./ai";
import { registerAppHandlers } from "./app";
import { appWindows, focusJig } from "./appWindows";
import { registerArtifactHandlers } from "./artifacts";
import { startAttempts } from "./attempts";
import { startBrowser, stopBrowser } from "./browser";
import { startBuilder } from "./builder";
import { loadConfig, registerConfigHandlers } from "./config";
import { startConfigure } from "./configure";
import { startDevRequests } from "./devRequests";
import { registerDigestHandlers } from "./digest";
import { registerFileHandlers } from "./files";
import { installRouter } from "./ipc/router";
import { registerLayoutHandlers } from "./layout";
import { startLearning } from "./learning";
import { registerLinkHandlers } from "./links";
import { logger } from "./log";
import { startProjects } from "./projects";
import { installAppProtocol, registerSchemes } from "./protocols";
import { registerRoutineHandlers } from "./routines";
import { registerScriptHandlers } from "./scripts";
import { startSessions } from "./sessions";
import { registerSetupHandlers } from "./setup";
import { jigHome } from "./state/paths";
import { startTerminals, stopTerminals } from "./terminals";
import { startThemes, themeService } from "./themes";
import { registerTourHandlers } from "./tour";
import { startUsage, stopUsage } from "./usage";
import { APP_ID, createMainWindow, DEVELOPMENT_APP_ID } from "./window";
import { startWorktrees } from "./worktrees";

const log = logger("main");

registerSchemes();

// Jig's own taskbar entry on Windows (with Jig's icon), not Electron's when it runs from a clone;
// packaged builds match electron-builder; development has its own group and icon cache.
if (process.platform === "win32") app.setAppUserModelId(app.isPackaged ? APP_ID : DEVELOPMENT_APP_ID);

// One Jig per state directory: a second launch focuses the first window. Electron locks its own
// data folder, so with JIG_HOME (tests, a throwaway home) that folder goes inside it, and such a Jig
// runs next to your usual one.
if (process.env.JIG_HOME) app.setPath("userData", join(jigHome(), "electron"));
if (!app.requestSingleInstanceLock({ jigHome: jigHome() })) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusJig();
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
  startAttempts();
  startWorktrees();
  startTerminals();
  startBrowser();
  registerRoutineHandlers();
  registerArtifactHandlers();
  registerScriptHandlers();
  registerFileHandlers();
  registerLinkHandlers();
  registerAboutHandlers();
  registerAiHandlers();
  registerTourHandlers();
  registerDigestHandlers();
  registerSetupHandlers();
  startUsage();
  await startThemes(addonThemes);
  await startAddons();
  onAddonsChange(() => themeService().refresh());
  await startBuilder(addonNodePaths());
  startDevRequests();
  startConfigure();
  await startLearning();
  await createMainWindow();
  await reportReady();

  app.on("activate", () => {
    if (appWindows().length === 0) void createMainWindow();
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
  stopBrowser();
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
