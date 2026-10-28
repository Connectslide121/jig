import { expect, test } from "./fixtures";

test("Check your setup… lists the tools Jig uses and checks for updates", async ({ page }) => {
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("check your setup");
  await page.keyboard.press("Enter");
  const tab = page.getByTestId("setup-tab");
  await expect(tab).toBeVisible();
  // git is installed in the test environment; the shipped Claude Code binary answers --version.
  await expect(page.getByTestId("setup-git")).toContainText("git version", { timeout: 20000 });
  await expect(page.getByTestId("setup-claude")).toContainText("Claude Code");
  await expect(page.getByTestId("setup-az-devops")).toContainText("Azure DevOps extension");
  // Running from this clone, updates come from git.
  await page.getByTestId("updates-check").click();
  await expect(page.getByTestId("updates-card")).not.toContainText("Running from a git clone", {
    timeout: 20000,
  });
  // Dev runs don't open Get started by themselves; Done closes it.
  await page.getByTestId("setup-done").click();
  await expect(tab).toHaveCount(0);
});
