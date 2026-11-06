import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { browserPageChat, expect, hostCall, test } from "./fixtures";

const DONE = "I opened the page in my browser and took a screenshot.";

// D-349, D-410: Claude's browser shows itself when a chat opens a new page (not on every use of one
// already open), unless you work on another tab of its panel.
test("Claude's browser shows itself only for a new page, and badges its tab while you work in its panel", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "index.html");
  await writeFile(file, "<!doctype html><title>Cart</title><h1>Cart</h1>");
  const project = (await hostCall(page, "projects.add", { path: dir })) as { value: { id: string } };
  const browse = `browse ${pathToFileURL(file).href}`;
  const pageCount = async () =>
    ((await hostCall(page, "browser.pages")) as { value: unknown[] }).value.length;
  const browseInNewChat = async () => {
    const created = (await hostCall(page, "sessions.create", { projectId: project.value.id, cwd: dir })) as {
      value: { id: string };
    };
    const before = await pageCount();
    await hostCall(page, "sessions.send", { id: created.value.id, text: browse });
    await expect.poll(pageCount, { timeout: 20000 }).toBe(before + 1);
  };

  // Typing in a chat isn't working in a panel: the chat's new page shows the view.
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill(browse);
  await page.keyboard.press("Enter");
  const chat = page.getByTestId("chat");
  await expect(chat.getByText(DONE)).toHaveCount(1, { timeout: 20000 });
  const view = page.getByTestId("browser-view");
  await expect(view).toBeVisible();
  const chatId = await browserPageChat(page);

  // You switch to another tab and work in another panel: using the open page again doesn't show it.
  const other = page
    .getByTestId("view-tabs-right")
    .locator("[data-view-id]:not([data-view-id='jig.browser'])")
    .first();
  await other.click();
  await expect(view).toHaveCount(0);
  const left = page.getByTestId("view-tabs-left").locator("[data-view-id]").first();
  await left.click();
  await hostCall(page, "sessions.send", { id: chatId, text: browse });
  await expect(chat.getByText(DONE)).toHaveCount(2, { timeout: 20000 });
  const badge = page.getByTestId("view-badge-jig.browser");
  await expect(view).toHaveCount(0);
  await expect(badge).toHaveCount(0);

  // Back on the other tab of the browser's sidebar: a new page badges the tab, no switch.
  await other.click();
  await browseInNewChat();
  await expect(badge).toHaveText("1");
  await expect(view).toHaveCount(0);
  await expect(other).toHaveClass(/bg-active/);

  // You're back in the chat: the next new page switches to the browser, and the badge clears.
  await page.getByTestId("composer-input").click();
  await browseInNewChat();
  await expect(view).toBeVisible();
  await expect(badge).toHaveCount(0);
});
