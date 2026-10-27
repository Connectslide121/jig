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
