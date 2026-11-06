import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTokens, cssColor, cssDim, varName } from "./tokens.ts";

describe("tokens", () => {
  it("writes colours in their own colour space", () => {
    expect(cssColor({ colorSpace: "oklch", components: [0.5, 0.1, 250] })).toBe("oklch(0.5 0.1 250)");
    expect(cssColor({ colorSpace: "oklch", components: [0.5, 0.1, 250], alpha: 0.5 })).toBe("oklch(0.5 0.1 250 / 0.5)");
    expect(cssColor({ colorSpace: "hsl", components: [10, 20, 30] })).toBe("hsl(10 20% 30%)");
    expect(cssColor("#123456")).toBe("#123456");
  });

  it("writes dimensions with their unit", () => {
    expect(cssDim({ value: 0.5, unit: "rem" })).toBe("0.5rem");
    expect(cssDim(4)).toBe("4px");
  });

  it("names variables from the token path", () => {
    expect(varName(["color", "light", "primary"]).startsWith("--")).toBe(true);
  });

  it("builds light and dark variables and a Tailwind theme from the sample kit", async () => {
    const tokens = JSON.parse(readFileSync(new URL("../../kits/sample/tokens.json", import.meta.url), "utf8"));
    const built = await buildTokens(tokens);
    expect(built.variables).toContain(":root {");
    expect(built.variables).toContain(".dark {");
    expect(built.theme).toContain("@theme inline {");
    expect(built.theme).toContain("--font-sans: var(--typeface-body);");
    expect(built.families.length).toBeGreaterThan(0);
  });
});
