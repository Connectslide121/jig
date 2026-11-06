import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Pages: Claude publishes a page with an image, it opens in Jig, updates, and the list manages it", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  // The compact view folds tool calls into one line: the page still stands in the chat.
  await hostCall(page, "config.update", { chat: { view: "compact" } });
  await page.keyboard.press("Control+N");
  const visible = page.locator("[data-tab-id]:not(.hidden)");
  await visible.getByTestId("composer-input").fill("publish a page with the sales report");
  await page.keyboard.press("Enter");
  const chat = visible.getByTestId("chat");
  await expect(chat).toContainText("Published the page.", { timeout: 20000 });

  // The card in the chat opens it in Preview: scripts off, and the image next to it came along.
  const card = chat.getByTestId("page-card");
  await expect(card).toContainText("Sales report");
  await expect(chat.getByTestId("promoted-tool")).toHaveCount(1);
  // A picture of the page, in a frame that runs nothing.
  const thumb = card.getByTestId("page-thumbnail").frameLocator("iframe");
  await expect(thumb.locator("h1")).toHaveText("Sales report", { timeout: 15000 });
  await expect(card.locator("iframe")).toHaveAttribute("sandbox", "");
  await expect(card.getByTestId("page-browser")).toBeVisible();
  await card.getByTestId("page-open").click();
  const frame = visible.frameLocator('[data-testid="preview-html"]');
  await expect(frame.locator("h1")).toHaveText("Sales report", { timeout: 15000 });
  await expect(visible.getByTestId("preview-html")).toHaveAttribute("sandbox", "");
  await expect
    .poll(() => frame.locator("#chart").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);

  // Updating the same page: one page, a new version.
  await page.keyboard.press("Control+N");
  await visible.getByTestId("composer-input").fill("update the page with this quarter");
  await page.keyboard.press("Enter");
  await expect(visible.getByTestId("chat")).toContainText("Updated the page.", { timeout: 20000 });
  await expect(visible.getByTestId("page-card")).toContainText("version 2");

  // The Pages view lists one page; the whole row opens the new version.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("Pages");
  await page.keyboard.press("Enter");
  const pages = page.getByTestId("pages");
  await expect(pages.getByTestId("page-row")).toHaveCount(1, { timeout: 15000 });
  await expect(pages.getByTestId("page-title")).toHaveText("Sales report");
  await pages.getByTestId("page-row").click();
  await expect(
    page.locator("[data-tab-id]:not(.hidden)").frameLocator('[data-testid="preview-html"]').locator("h1"),
  ).toHaveText("Sales report, updated", { timeout: 15000 });

  // Rename, then delete after asking.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("Pages");
  await page.keyboard.press("Enter");
  await pages.getByTestId("page-more").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Q4 sales");
  await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  await expect(pages.getByTestId("page-title")).toHaveText("Q4 sales", { timeout: 10000 });
  await pages.getByTestId("page-more").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(pages.getByTestId("page-row")).toHaveCount(0, { timeout: 10000 });
  await expect(pages).toContainText("No pages yet");
});
