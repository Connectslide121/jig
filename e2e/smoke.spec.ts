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
