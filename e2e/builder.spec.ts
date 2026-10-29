import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Build something… makes a new add-on, previews it, and Accept makes it live", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("Hello button");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 20000 });
  await expect(page.getByTestId("build-tab")).toContainText("New add-on");
  await expect(page.getByTestId("build-files")).toContainText("hello-button/ui.tsx");
  // The add-on is loaded as a preview right away.
  await expect(page.getByTestId("view-tab-addon.hello-button.main")).toHaveAttribute(
    "title",
    "Hello button (preview)",
    { timeout: 15000 },
  );
  await page.getByTestId("build-accept").click();
  await expect(page.getByTestId("build-tab")).toContainText("Accepted");
  await expect(page.getByTestId("view-tab-addon.hello-button.main")).toHaveAttribute(
    "title",
    "Hello button",
    { timeout: 15000 },
  );
  await page.getByTestId("view-tab-addon.hello-button.main").click();
  await expect(page.getByTestId("built-view")).toContainText("Built by the builder");
  // Its Tools-menu action works.
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("hello from hello-button");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("toast").last()).toContainText("Hello from hello-button");
});

test("a layout request is a level-1 change shown before it applies", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("move the terminals please");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Move terminals to the right sidebar", {
    timeout: 20000,
  });
  await page.getByTestId("build-accept").click();
  await expect(page.getByTestId("region-right")).toBeVisible();
  await expect(page.getByTestId("region-right").getByTestId("view-tab-jig.terminals")).toBeVisible();
});

test("the builder can show a view below another, as a collapsible section", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("put the pipelines under git");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Pipelines shows below Git", { timeout: 20000 });
  await page.getByTestId("build-accept").click();
  await page.getByTestId("view-tab-addon.git.git").click();
  const section = page.getByTestId("section-addon.pipelines.pipelines");
  await expect(section).toBeVisible();
  // Collapse it, then put it back in its own tab from its menu.
  await page.getByTestId("section-toggle-addon.pipelines.pipelines").click();
  await expect(section.getByTestId("section-toggle-addon.pipelines.pipelines")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await section.hover();
  await page.getByTestId("view-menu-addon.pipelines.pipelines").click();
  await page.getByTestId("section-own-tab").click();
  await expect(section).toHaveCount(0);
  await expect(page.getByTestId("view-tab-addon.pipelines.pipelines")).toBeVisible();
});

test("Discard leaves nothing behind", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("Throwaway gadget");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 20000 });
  await page.getByTestId("build-discard").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("build-tab")).toContainText("Discarded");
  await expect(page.getByTestId("view-tab-addon.throwaway-gadget.main")).toHaveCount(0);
});

test("a chat can ask for a build; the card follows it", async ({ page, jigHome }) => {
  const dir = join(jigHome, "proj");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("build me a pomodoro timer");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("build-card")).toContainText("Ready to review", { timeout: 20000 });
  await page.getByTestId("build-card").getByTestId("build-accept").click();
  await expect(page.getByTestId("build-card")).toContainText("Accepted");
});

test("Change this with AI on an add-on view starts a build about that add-on", async ({ page }) => {
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Repos" }).click();
  await page.getByTestId("view-menu-addon.repos.overview").click();
  await page.getByTestId("change-with-ai").click();
  await expect(page.getByTestId("build-dialog")).toBeVisible();
  await page.getByTestId("build-goal").fill("show the last commit message");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Changes an add-on", { timeout: 20000 });
  await page.getByTestId("build-accept").click();
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await expect(page.getByTestId("addon-repos")).toContainText("your copy");
});

test("when no slot can do it, the builder proposes an extension point instead of changing Jig", async ({
  page,
}) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("change jig itself: draw in the window frame");
  await page.getByTestId("build-submit").click();
  const proposal = page.getByTestId("build-proposal");
  await expect(proposal).toContainText("No extension point can do this yet", { timeout: 20000 });
  await expect(proposal).toContainText("window.decorations");
  await expect(page.getByTestId("build-accept")).toHaveCount(0);
  await page.getByTestId("build-copy-proposal").click();
  await expect(page.getByTestId("toast").last()).toContainText("Proposal copied");
});
