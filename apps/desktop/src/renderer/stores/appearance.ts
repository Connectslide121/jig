import type { JigTheme, ThemeSummary } from "@jig/themes";
import { create } from "zustand";

interface AppearanceState {
  theme: JigTheme | undefined;
  themes: ThemeSummary[];
  /** Bumps when the highlighter's theme changes, so code blocks re-render. */
  highlightVersion: number;
  /** Error loading the selected theme (the app falls back to Jig Dark/Light). */
  themeError: string | undefined;
}

export const useAppearance = create<AppearanceState>(() => ({
  theme: undefined,
  themes: [],
  highlightVersion: 0,
  themeError: undefined,
}));
