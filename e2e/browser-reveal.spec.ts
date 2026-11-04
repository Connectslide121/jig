import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { browserPageChat, expect, hostCall, test } from "./fixtures";

const DONE = "I opened the page in my browser and took a screenshot.";

// D-349: Claude's browser shows itself when a chat uses it, unless you work on another tab of its panel.
test("Claude's browser badges its tab instead of switching while you work in its panel", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "index.html");
  await writeFile(file, "<!doctype html><title>Cart</title><h1>Cart</h1>");
  await hostCall(page, "projects.add", { path: dir });
  const browse = `browse ${pathToFileURL(file).href}`;

  // Typing in a chat isn't working in a panel: the view shows itself.
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill(browse);
  await page.keyboard.press("Enter");
  const chat = page.getByTestId("chat");
  await expect(chat.getByText(DONE)).toHaveCount(1, { timeout: 20000 });
  const view = page.getByTestId("browser-view");
  await expect(view).toBeVisible();
  const chatId = await browserPageChat(page);

  // You switch to another tab of the same sidebar: the next use badges the browser's tab, no switch.
  const other = page
    .getByTestId("view-tabs-right")
    .locator("[data-view-id]:not([data-view-id='jig.browser'])")
    .first();
  await other.click();
  await expect(view).toHaveCount(0);
  await hostCall(page, "sessions.send", { id: chatId, text: browse });
  await expect(chat.getByText(DONE)).toHaveCount(2, { timeout: 20000 });
  const badge = page.getByTestId("view-badge-jig.browser");
  await expect(badge).toHaveText("1");
  await expect(view).toHaveCount(0);
  await expect(other).toHaveClass(/bg-active/);

  // You work in another panel: the next use switches to the browser, and the badge clears.
  await page.getByTestId("view-tabs-left").locator("[data-view-id]").first().click();
  await hostCall(page, "sessions.send", { id: chatId, text: browse });
  await expect(chat.getByText(DONE)).toHaveCount(3, { timeout: 20000 });
  await expect(view).toBeVisible();
  await expect(badge).toHaveCount(0);
});
