import { app, BrowserWindow, dialog, shell } from "electron";
import type { AppInfo } from "../shared/ipc";
import { JigError } from "../shared/ipc";
import { handle } from "./ipc/router";
import { jigHome } from "./state/paths";

export function engineKind(): AppInfo["engine"] {
  return process.env.JIG_ENGINE === "fake" ? "fake" : "claude";
}

export function registerAppHandlers(): void {
  handle("app.info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    jigHome: jigHome(),
    dev: Boolean(process.env.JIG_DEV),
    engine: engineKind(),
    safeMode: process.env.JIG_SAFE_MODE === "1",
    startedAfterFailure: process.env.JIG_STARTED_AFTER_FAILURE === "1",
    preview: process.env.JIG_PREVIEW || undefined,
  }));
  handle("app.openExternal", async ({ url }) => {
    if (!/^(https?|mailto):/.test(url))
      throw new JigError("invalid_url", "Only http(s) and mailto links can be opened");
    await shell.openExternal(url);
  });
  handle("app.showItemInFolder", ({ path }) => shell.showItemInFolder(path));
  handle("app.openPath", async ({ path }) => {
    const error = await shell.openPath(path);
    if (error) throw new JigError("open_failed", error);
  });
  handle("app.pickFolder", async ({ title }, ctx) => {
    const window = BrowserWindow.fromWebContents(ctx.sender);
    const options = { title: title ?? "Choose a folder", properties: ["openDirectory" as const] };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  });
  handle("app.pickFiles", async ({ title, defaultPath }, ctx) => {
    const window = BrowserWindow.fromWebContents(ctx.sender);
    const options = {
      title: title ?? "Choose files",
      defaultPath,
      properties: ["openFile" as const, "multiSelections" as const],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });
  handle("app.toggleDevTools", (_args, ctx) => ctx.sender.toggleDevTools());
  handle("app.reload", (_args, ctx) => ctx.sender.reloadIgnoringCache());
  handle("window.minimize", (_args, ctx) => BrowserWindow.fromWebContents(ctx.sender)?.minimize());
  handle("window.toggleMaximize", (_args, ctx) => {
    const window = BrowserWindow.fromWebContents(ctx.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  handle("window.close", (_args, ctx) => BrowserWindow.fromWebContents(ctx.sender)?.close());
}
