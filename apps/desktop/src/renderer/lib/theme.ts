import { type JigTheme, jigDark, jigLight, themeCssVariables } from "@jig/themes";
import { useEffect, useRef } from "react";
import type { JigConfig } from "../../shared/config";
import { useAppearance } from "../stores/appearance";
import { loadFileIcons } from "../stores/fileIcons";
import { setHighlightTheme } from "./highlight";
import { call, errorMessage, useHostEvent } from "./host";
import { activeThemeId, styleVariables } from "./style";

/** Writes a theme's colour tokens and the style settings onto `<html>`. */
export function applyTheme(theme: JigTheme, style: JigConfig["appearance"]): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries({ ...themeCssVariables(theme), ...styleVariables(style) })) {
    root.style.setProperty(name, value);
  }
  root.dataset.appearance = theme.appearance;
  root.dataset.theme = theme.id;
  void call("window.setTitleBarColors", { symbolColor: theme.colors.muted }).catch(() => {});
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/**
 * Keeps the applied theme in sync with the settings, the OS light/dark mode and theme files on disk.
 * Mounted once at the root of the app.
 */
export function useThemeController(): void {
  // Refreshes overlap (a theme file and the setting change together); only the latest one applies,
  // so a slower one that read the old setting can't put the old theme back.
  const latest = useRef(0);
  const refresh = async (config?: JigConfig) => {
    const run = ++latest.current;
    const settings = config ?? (await call("config.get"));
    const id = activeThemeId(settings.appearance, systemDark());
    let theme: JigTheme;
    let themeError: string | undefined;
    try {
      theme = await call("themes.get", { id });
    } catch (error) {
      themeError = errorMessage(error);
      theme = systemDark() ? jigDark : jigLight;
    }
    if (run !== latest.current) return;
    applyTheme(theme, settings.appearance);
    useAppearance.setState({ theme, themeError });
    await setHighlightTheme(theme).catch(() => {});
    useAppearance.setState((s) => ({ highlightVersion: s.highlightVersion + 1 }));
  };
  const refreshList = async () => {
    useAppearance.setState({ themes: await call("themes.list").catch(() => []) });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount once.
  useEffect(() => {
    void refresh();
    void refreshList();
    void call("config.get").then((c) => loadFileIcons(c.appearance.fileIconTheme));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => void refresh();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useHostEvent("config.changed", (config) => {
    void refresh(config);
    void loadFileIcons(config.appearance.fileIconTheme);
  });
  useHostEvent("themes.changed", () => {
    void refresh();
    void refreshList();
    void call("config.get").then((c) => loadFileIcons(c.appearance.fileIconTheme, true));
  });
}
