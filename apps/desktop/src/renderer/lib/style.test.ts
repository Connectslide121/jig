import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../shared/config";
import { activeThemeId, styleVariables } from "./style";

describe("styleVariables", () => {
  it("maps density, radius, fonts and size", () => {
    const vars = styleVariables({
      density: "compact",
      radius: "sharp",
      uiFont: "Segoe UI",
      monoFont: "Consolas",
      fontSize: 14,
    });
    expect(vars).toMatchObject({
      "--jig-spacing": "0.2rem",
      "--jig-radius-md": "3px",
      "--jig-font-ui": '"Segoe UI"',
      "--jig-font-mono": "Consolas",
      "--jig-font-size": "14px",
    });
  });

  it("uses the defaults for empty font names", () => {
    const vars = styleVariables({ ...defaultConfig().appearance, uiFont: "", monoFont: "" });
    expect(vars["--jig-font-ui"]).toBe('"Inter Variable"');
    expect(vars["--jig-spacing"]).toBe("0.25rem");
  });
});

describe("activeThemeId", () => {
  it("follows the system only when asked to", () => {
    const appearance = { ...defaultConfig().appearance, themeId: "x" };
    expect(activeThemeId(appearance, true)).toBe("x");
    expect(activeThemeId({ ...appearance, followSystem: true }, true)).toBe("jig-dark");
    expect(activeThemeId({ ...appearance, followSystem: true }, false)).toBe("jig-light");
  });
});
