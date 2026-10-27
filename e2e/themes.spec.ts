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
