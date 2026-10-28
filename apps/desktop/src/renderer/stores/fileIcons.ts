import type { FileIconTheme } from "@jig/themes";
import { create } from "zustand";
import type { FileIconThemeData } from "../../shared/themes";
import { call } from "../lib/host";

/**
 * The active file icon theme (Settings → Appearance → File icons). `null` = Jig's own icons. Font icon
 * themes (Seti) get their @font-face rules injected here.
 */
interface FileIconsState {
  data: FileIconThemeData | null;
  /** Bumps on every change, so resolved icons are recomputed. */
  version: number;
}

export const useFileIcons = create<FileIconsState>(() => ({ data: null, version: 0 }));

let loadedChoice: string | undefined;

function injectFonts(theme: FileIconTheme | undefined, id: string) {
  document.getElementById("jig-icon-fonts")?.remove();
  if (!theme?.fonts?.length) return;
  const style = document.createElement("style");
  style.id = "jig-icon-fonts";
  style.textContent = theme.fonts
    .map(
      (f) =>
        `@font-face { font-family: "${fontFamily(id, f.id)}"; src: ${f.src
          .map((s) => `url("${s.path}")${s.format ? ` format("${s.format}")` : ""}`)
          .join(", ")}; font-weight: ${f.weight ?? "normal"}; font-style: ${f.style ?? "normal"}; }`,
    )
    .join("\n");
  document.head.appendChild(style);
}

/** The CSS font family of a font icon theme's font. */
export function fontFamily(themeId: string, fontId: string): string {
  return `jig-icons-${themeId.replace(/[^\w-]/g, "_")}-${fontId.replace(/[^\w-]/g, "_")}`;
}

/** Loads the chosen icon theme (again when `force`, e.g. after a rescan). */
export async function loadFileIcons(choice: string, force = false): Promise<void> {
  if (!force && choice === loadedChoice) return;
  loadedChoice = choice;
  const data = await call("iconThemes.active").catch(() => null);
  if (loadedChoice !== choice) return;
  injectFonts(data?.theme, data?.id ?? "");
  useFileIcons.setState((s) => ({ data, version: s.version + 1 }));
}
