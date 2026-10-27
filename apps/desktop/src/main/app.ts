import { app, shell } from "electron";
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
  }));
  handle("app.openExternal", async ({ url }) => {
    if (!/^(https?|mailto):/.test(url))
      throw new JigError("invalid_url", "Only http(s) and mailto links can be opened");
    await shell.openExternal(url);
  });
  handle("app.showItemInFolder", ({ path }) => shell.showItemInFolder(path));
}
