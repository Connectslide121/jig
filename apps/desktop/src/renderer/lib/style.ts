import type { JigConfig } from "../../shared/config";

/**
 * Style settings → CSS variables. Pure so it can be unit-tested; `lib/theme.ts` applies the result.
 * Themes set colours only; these set density, corner radius, fonts and size (docs/reference/design-tokens.md).
 */
export type StyleSettings = Pick<
  JigConfig["appearance"],
  "density" | "radius" | "uiFont" | "monoFont" | "fontSize"
>;

const RADII = {
  sharp: [2, 3, 4, 6],
  soft: [4, 6, 10, 14],
  round: [6, 9, 14, 20],
} as const;

const quote = (font: string) => (/^[\w-]+$/.test(font) ? font : `"${font.replaceAll('"', "")}"`);

export function styleVariables(style: StyleSettings): Record<string, string> {
  const [sm, md, lg, xl] = RADII[style.radius];
  return {
    "--jig-spacing": style.density === "compact" ? "0.2rem" : "0.25rem",
    "--jig-radius-sm": `${sm}px`,
    "--jig-radius-md": `${md}px`,
    "--jig-radius-lg": `${lg}px`,
    "--jig-radius-xl": `${xl}px`,
    "--jig-font-ui": quote(style.uiFont || "Inter Variable"),
    "--jig-font-mono": quote(style.monoFont || "JetBrains Mono Variable"),
    "--jig-font-size": `${style.fontSize}px`,
  };
}

/** Which theme id applies, given the settings and whether the OS is in dark mode. */
export function activeThemeId(appearance: JigConfig["appearance"], systemDark: boolean): string {
  if (!appearance.followSystem) return appearance.themeId;
  return systemDark ? appearance.darkThemeId : appearance.lightThemeId;
}
