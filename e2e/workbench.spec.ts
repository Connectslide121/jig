import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("shows the shell with Jig's own top bar and the projects view", async ({ page }) => {
  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await expect(page.getByTestId("region-left")).toBeVisible();
  await expect(page.getByTestId("main-empty")).toBeVisible();
  await expect(page.getByTestId("statusbar")).toContainText("fake engine");
});

test("the Tools menu lists actions, filters them and runs them", async ({ page }) => {
  await page.getByTestId("tools-button").click();
  await expect(page.getByTestId("tools-menu")).toBeVisible();
  await page.getByTestId("tools-filter").fill("settings");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("settings")).toBeVisible();
  // Opening settings again reuses the same tab.
  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("tab-jig.settings")).toHaveCount(1);
});

test("keyboard shortcuts run actions", async ({ page }) => {
  await page.keyboard.press("Control+B");
  await expect(page.getByTestId("region-left")).toBeHidden();
  await page.keyboard.press("Control+B");
  await expect(page.getByTestId("region-left")).toBeVisible();
});

test("views move between regions from their ⋯ menu and the layout is saved", async ({ page, jigHome }) => {
  await page.getByTestId("view-menu-jig.projects").click();
  await page.getByTestId("move-view-right").click();
  await expect(page.getByTestId("region-right")).toContainText("Projects");
  await expect(page.getByTestId("region-left").getByTestId("view-tab-jig.projects")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(join(jigHome, "layout.json"), "utf8").catch(() => "{}")).right?.views,
    )
    .toEqual(["jig.projects"]);
  await page.getByTestId("view-menu-jig.projects").click();
  await page.getByTestId("hide-view").click();
  await expect(page.getByTestId("region-right")).toBeHidden();
});

test("projects: add, switch, rename and remove", async ({ page, jigHome }) => {
  const alpha = join(jigHome, "work-alpha");
  const beta = join(jigHome, "work-beta");
  await mkdir(join(alpha, ".git"), { recursive: true });
  await mkdir(beta, { recursive: true });
  await hostCall(page, "projects.add", { path: alpha });
  await hostCall(page, "projects.add", { path: beta });
  await expect(page.getByTestId("project-switcher")).toContainText("work-beta");
  await page.getByTestId("project-work-alpha").click();
  await expect(page.getByTestId("project-switcher")).toContainText("work-alpha");

  await page.getByTestId("project-work-alpha").dblclick();
  await expect(page.getByTestId("project-dashboard")).toContainText("work-alpha");

  await page.getByTestId("project-work-alpha").click({ button: "right" });
  await page.getByTestId("project-rename").click();
  await page.getByTestId("dialog-input").fill("Alpha app");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("project-switcher")).toContainText("Alpha app");
  await expect(page.getByTestId("tab-jig.project")).toContainText("Alpha app");

  await page.getByTestId("project-Alpha app").click({ button: "right" });
  await page.getByTestId("project-remove").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("project-Alpha app")).toHaveCount(0);
  await expect(page.getByTestId("tab-jig.project")).toHaveCount(0);
  const saved = JSON.parse(await readFile(join(jigHome, "projects.json"), "utf8"));
  expect(saved.projects.map((p: { name: string }) => p.name)).toEqual(["work-beta"]);
});

test("tabs and layout survive a restart", async ({ app, page, jigHome }) => {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-learning").click();
  await page.keyboard.press("Control+J");
  await page.waitForTimeout(600); // debounced save
  await app.close();
  const again = await launchJig(jigHome);
  const page2 = await again.firstWindow();
  await expect(page2.getByTestId("settings")).toContainText("Learning");
  await again.close();
});

test("host notifications appear as toasts", async ({ app, page }) => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("jig:event", "notify", {
      title: "Hello from the host",
    });
  });
  await expect(page.getByTestId("toast")).toContainText("Hello from the host");
});
