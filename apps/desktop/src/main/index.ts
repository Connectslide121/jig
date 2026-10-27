import { app, BrowserWindow } from "electron";
import { registerAppHandlers } from "./app";
import { loadConfig, registerConfigHandlers } from "./config";
import { installRouter } from "./ipc/router";
import { logger } from "./log";
import { installAppProtocol, registerSchemes } from "./protocols";
import { jigHome } from "./state/paths";
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
  await loadConfig();
  installRouter();
  registerAppHandlers();
  registerConfigHandlers();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
