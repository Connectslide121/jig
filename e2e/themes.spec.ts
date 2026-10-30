import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const cssVar = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test("applies the selected theme and style settings", async ({ page }) => {
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#1e1f22");
  await hostCall(page, "config.update", { appearance: { themeId: "jig-light", radius: "round" } });
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#fbfaf8");
  await expect.poll(() => cssVar(page, "--jig-radius-md")).toBe("9px");
  expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBe("light");
});

test("lists and live-reloads themes from ~/.jig/themes", async ({ page, jigHome }) => {
  const dir = join(jigHome, "themes");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "mine.json");
  await writeFile(file, JSON.stringify({ label: "Mine", appearance: "dark", colors: { canvas: "#102030" } }));
  await expect
    .poll(async () =>
      ((await hostCall(page, "themes.list")) as { value: { id: string }[] }).value.map((t) => t.id),
    )
    .toContain("user:mine");
  await hostCall(page, "config.update", { appearance: { themeId: "user:mine" } });
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#102030");
  await writeFile(file, JSON.stringify({ label: "Mine", appearance: "dark", colors: { canvas: "#203040" } }));
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#203040");
});

test("falls back to a built-in theme when the selected one is missing", async ({ page }) => {
  await hostCall(page, "config.update", { appearance: { themeId: "user:gone" } });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/^jig-/);
});

test("theme cards apply on selection, not hover", async ({ page }) => {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-appearance").click();
  const light = page.getByTestId("theme-jig-light");
  await light.hover();
  await page.getByRole("heading", { name: "Theme", exact: true }).hover();
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#1e1f22");
  await light.click();
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#fbfaf8");
  await page.getByTestId("theme-jig-dark").hover();
  await expect.poll(() => cssVar(page, "--jig-canvas")).toBe("#fbfaf8");
});

test("font pickers can reset a mistyped custom font", async ({ page }) => {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByRole("combobox", { name: "Interface font", exact: true }).selectOption("custom");
  const custom = page.getByRole("textbox", { name: "Custom interface font", exact: true });
  await custom.fill("Mistyped font");
  await custom.press("Tab");
  await page.getByRole("button", { name: "Reset interface font", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Interface font", exact: true })).toHaveValue(
    "Inter Variable",
  );
  await expect(custom).toHaveCount(0);
});

test("Open VSX searches automatically after typing pauses", async ({ page, app }) => {
  await app.evaluate(() => {
    const state = globalThis as unknown as { themeQueries: string[] };
    state.themeQueries = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (url.startsWith("https://open-vsx.org/api/-/search")) {
        state.themeQueries.push(new URL(url).searchParams.get("query") ?? "");
        return new Response(JSON.stringify({ extensions: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      return original(input, options);
    };
  });
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-appearance").click();
  const input = page.getByPlaceholder(
    "Search Open VSX themes (e.g. dracula, catppuccin, material icon theme)",
  );
  await input.fill("dr");
  await input.fill("dracula");
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { themeQueries: string[] }).themeQueries))
    .toEqual(["dracula"]);
  await expect(page.getByText("No theme extensions found.")).toBeVisible();
});

test("Settings → Claude Code: claude.ai connectors are off by default and the switch is kept", async ({
  page,
}) => {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-engine").click();
  const toggle = page.getByRole("switch", { name: "claude.ai connectors" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const config = async () =>
    ((await hostCall(page, "config.get")) as { value: { engine: { claudeAiConnectors: boolean } } }).value
      .engine.claudeAiConnectors;
  expect(await config()).toBe(false);
  await toggle.click();
  await expect.poll(config).toBe(true);
});
