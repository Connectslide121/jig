import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("the terminal split button opens one terminal in another shell; Settings picks the default", async ({
  page,
}) => {
  const { value: choices } = (await hostCall(page, "terminals.shells")) as {
    value: { options: Array<{ name: string; path: string }>; defaultShell: { name: string } };
  };

  expect(choices.options.length).toBeGreaterThan(0);

  await page.keyboard.press("Control+`");
  await expect(page.getByTestId("terminals-view")).toBeVisible();
  await expect(page.getByTestId("terminal-shell").first()).toBeVisible();

  // The chevron lists the installed shells with the default marked, then "Change default shell…".
  await page.getByTestId("new-terminal-in").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(choices.options.length + 1);
  await expect(menu).toContainText("Default");
  await expect(menu).toContainText("Change default shell…");
  await page.mouse.move(700, 300);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(process.env.JIG_SHOT_DIR ?? tmpdir(), "terminal-shell-menu.png") });
  const before = await page.getByTestId("terminal-shell").count();
  await menu.getByRole("menuitem").first().click();
  await expect(page.getByTestId("terminal-shell")).toHaveCount(before + 1);

  // Settings → Terminal: a picker instead of a text field, with the path muted below.
  await page.keyboard.press("Control+,");
  await page.getByTestId("settings-nav-terminal").click();
  await page.getByTestId("settings-shell").click();
  await expect(page.getByRole("menu")).toContainText("Custom path…");
  await page.mouse.move(700, 300);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(process.env.JIG_SHOT_DIR ?? tmpdir(), "settings-shell-picker.png") });
});
