import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("the chat header shows the context window; Compact frees it", async ({ page, jigHome }) => {
  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const input = page.getByTestId("composer-input");

  await input.fill("hello");
  await page.keyboard.press("Enter");
  const meter = page.getByTestId("context-meter");
  await expect(meter).toHaveText("14%", { timeout: 15000 });
  await expect(page.getByTestId("compact-button")).toHaveCount(0);
  await meter.hover();
  await expect(page.getByTestId("context-card")).toContainText("27k of 200k tokens");
  await expect(page.getByTestId("context-card")).toContainText("Messages");

  // Filling up shows the Compact button.
  await input.fill("now read the big file");
  await page.keyboard.press("Enter");
  await expect(meter).toHaveText("79%", { timeout: 15000 });
  await page.getByTestId("compact-button").click();
  await expect(page.getByTestId("chat")).toContainText("Conversation compacted (157k → 21k tokens).", {
    timeout: 15000,
  });
  await expect(meter).toHaveText("11%");
  await expect(page.getByTestId("compact-button")).toHaveCount(0);

  // Also from the meter's menu.
  await meter.click();
  await expect(page.getByTestId("compact-now")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the welcome screen is the What Jig can do page; the Jig menu opens it any time", async ({ page }) => {
  const welcome = page.getByTestId("main-empty");
  await expect(welcome).toContainText("Your workbench around Claude Code");
  await expect(welcome.getByTestId("about-add-project")).toBeVisible();
  await expect(welcome.getByTestId("about-slots")).toBeVisible();

  await page.getByTestId("jig-menu").click();
  await page.getByTestId("jig-menu-about").click();
  await expect(page.getByTestId("about")).toBeVisible();
  await expect(page.getByTestId("main-empty")).toHaveCount(0);
});
