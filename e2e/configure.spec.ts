import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Claude configures Jig from a chat; each change has a card with Undo", async ({ page, jigHome }) => {
  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-appearance", "dark");

  await page.getByTestId("composer-input").fill("switch Jig to the light theme please");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("change-card").first();
  await expect(card).toContainText("Changed Jig's settings", { timeout: 15000 });
  await expect(card).toContainText('appearance.themeId: "jig-dark" → "jig-light"');
  await expect(card).toContainText('appearance.density: "comfortable" → "compact"');
  await expect(html).toHaveAttribute("data-appearance", "light");
  expect(
    ((await hostCall(page, "config.get")) as { value: { appearance: { density: string } } }).value.appearance
      .density,
  ).toBe("compact");

  await card.getByTestId("change-undo").click();
  await expect(card).toContainText("Undone");
  await expect(html).toHaveAttribute("data-appearance", "dark");
  expect(
    ((await hostCall(page, "config.get")) as { value: { appearance: { density: string } } }).value.appearance
      .density,
  ).toBe("comfortable");

  // Layout from the chat.
  await page.getByTestId("composer-input").fill("move the terminals to the right");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("change-card").nth(1)).toContainText("Changed Jig's layout", {
    timeout: 15000,
  });
  await expect(page.getByTestId("region-right").getByTestId("view-tab-jig.terminals")).toBeVisible();
  await page.getByTestId("change-card").nth(1).getByTestId("change-undo").click();
  await expect(page.getByTestId("region-right")).toHaveCount(0);
});
