import { BrowserWindow } from "electron";
import { emit, handle } from "../ipc/router";
import { paths } from "../state/paths";
import { setTitleBarColours } from "../window";
import { ThemeService } from "./service";
import { type ThemeEntry, vscodeExtensionDirs } from "./sources";

let service: ThemeService | undefined;

export function themeService(): ThemeService {
  if (!service) throw new Error("Theme service not started");
  return service;
}

export async function startThemes(extra?: () => Promise<ThemeEntry[]>): Promise<void> {
  service = new ThemeService({ themesDir: paths.themes(), extensionDirs: vscodeExtensionDirs(), extra });
  service.onChange(() => emit("themes.changed", undefined));
  await service.watch();

  handle("themes.list", () => themeService().list());
  handle("themes.get", ({ id }) => themeService().get(id));
  handle("themes.searchOpenVsx", ({ query }) => themeService().searchOpenVsx(query));
  handle("themes.installOpenVsx", ({ namespace, name }) => themeService().installOpenVsx(namespace, name));
  handle("themes.remove", ({ id }) => themeService().remove(id));
  handle("themes.rescan", async () => {
    themeService().invalidate();
    return themeService().list();
  });
  handle("window.setTitleBarColors", ({ symbolColor }, ctx) => {
    const window = BrowserWindow.fromWebContents(ctx.sender);
    if (window) setTitleBarColours(window, symbolColor);
  });
}
