import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("starts, renders the UI and reaches the host through the bridge", async ({ page }) => {
  await expect(page).toHaveTitle("Jig");
  const info = await hostCall(page, "app.info");
  expect(info).toMatchObject({ ok: true, value: { engine: "fake" } });
});

test("persists settings through config.update", async ({ page, jigHome }) => {
  await hostCall(page, "config.update", { appearance: { fontSize: 15 } });
  const saved = JSON.parse(await readFile(join(jigHome, "config.json"), "utf8"));
  expect(saved.appearance.fontSize).toBe(15);
});

test("rejects unknown methods with a stable error code", async ({ page }) => {
  const response = await hostCall(page, "nope.nothing");
  expect(response).toMatchObject({ ok: false, error: { code: "unknown_method" } });
});

test("the top bar is as tall as the window controls, whatever the font size", async ({ page }) => {
  const heights = () =>
    page.evaluate(() => {
      const overlay = (
        navigator as { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } }
      ).windowControlsOverlay;
      return {
        bar: document.querySelector("header.topbar-insets")?.getBoundingClientRect().height,
        controls: overlay?.visible ? overlay.getTitlebarAreaRect().height : undefined,
      };
    });
  test.skip(!(await heights()).controls, "no window controls overlay (macOS)");
  for (const fontSize of [11, 13, 16]) {
    await hostCall(page, "config.update", { appearance: { fontSize } });
    await page.waitForTimeout(100);
    const h = await heights();
    expect(h.bar).toBe(h.controls);
  }
});
