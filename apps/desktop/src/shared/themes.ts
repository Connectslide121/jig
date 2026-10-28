/** Types shared by the theme service (main) and the Appearance settings (renderer). */
export type { JigTheme, ThemeSummary } from "@jig/themes";

export interface OpenVsxExtension {
  namespace: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  downloads: number;
  iconUrl?: string;
}

/** A file icon theme found in an editor's extensions or installed from Open VSX (docs/reference/file-icons.md). */
export interface FileIconThemeSummary {
  /** `vscode:<publisher.name>/<theme id>` or `openvsx:…`. */
  id: string;
  label: string;
  source: "vscode" | "openvsx";
  extension: string;
  /** The id VS Code knows it by (`workbench.iconTheme`), e.g. `material-icon-theme`. */
  themeId: string;
}

/** A loaded icon theme: the VS Code JSON with every icon and font path turned into a `jig-icons:` URL. */
export interface FileIconThemeData {
  id: string;
  label: string;
  theme: import("@jig/themes").FileIconTheme;
}

export interface FileIconThemeList {
  themes: FileIconThemeSummary[];
  /** VS Code's `workbench.iconTheme`, when a VS Code settings file was found. */
  vscodeSetting?: string;
  /** The theme that matches it, if it is installed. */
  vscodeMatch?: string;
}
