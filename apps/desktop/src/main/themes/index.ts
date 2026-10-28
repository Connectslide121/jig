import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { BrowserWindow, protocol } from "electron";
import { getConfig } from "../config";
import { emit, handle } from "../ipc/router";
import { paths } from "../state/paths";
import { setTitleBarColours } from "../window";
import { FileIconService, ICON_FILE_TYPES, vscodeSettingsFiles } from "./fileIcons";
import { ThemeService } from "./service";
import { type ThemeEntry, vscodeExtensionDirs } from "./sources";

let service: ThemeService | undefined;

export function themeService(): ThemeService {
  if (!service) throw new Error("Theme service not started");
  return service;
}

let icons: FileIconService | undefined;

export async function startThemes(extra?: () => Promise<ThemeEntry[]>): Promise<void> {
  service = new ThemeService({ themesDir: paths.themes(), extensionDirs: vscodeExtensionDirs(), extra });
  const fileIcons = new FileIconService({
    extensionDirs: vscodeExtensionDirs(),
    openVsxDir: service.openVsxDir,
    settingsFiles: vscodeSettingsFiles(),
  });
  icons = fileIcons;
  service.onChange(() => {
    fileIcons.invalidate();
    emit("themes.changed", undefined);
  });
  await service.watch();

  protocol.handle("jig-icons", async (request) => {
    const file = fileIcons.resolveUrl(request.url);
    if (!file) return new Response("Not found", { status: 404 });
    try {
      return new Response(await readFile(file), {
        headers: {
          "content-type": ICON_FILE_TYPES[extname(file).toLowerCase()]!,
          "cache-control": "max-age=3600",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  handle("iconThemes.list", () => fileIcons.list());
  handle("iconThemes.get", ({ id }) => fileIcons.get(id));
  handle("iconThemes.active", () => fileIcons.active(getConfig().appearance.fileIconTheme));
  handle("iconThemes.rescan", async () => {
    fileIcons.invalidate();
    return fileIcons.list();
  });

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
