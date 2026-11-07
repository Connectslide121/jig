import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";

/** A project ("shop") made active: videos belong to the active project. */
async function shop(page: Page, jigHome: string): Promise<string> {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });
  return projectId;
}

const motion = (page: Page, method: string, args: Record<string, unknown>) =>
  hostCall(page, "addons.call", { id: "motion", method, args }) as Promise<{ value: unknown }>;

test("Motion: a video from a template, its live preview, the first render installs, then renders", async ({
  page,
  jigHome,
}) => {
  await shop(page, jigHome);

  // Top bar → Motion → New video…: a template, a title, Create opens the video's tab.
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-new").click();
  const dialog = page.getByTestId("motion-new");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("motion-new-template").selectOption("whats-new");
  await dialog.getByTestId("motion-new-title").fill("Shop 2.4");
  await dialog.getByTestId("motion-new-create").click();
  const tab = page.getByTestId("motion-video-tab");
  await expect(tab).toBeVisible({ timeout: 15000 });
  await expect(tab.getByTestId("motion-scene").first()).toBeVisible();

  // The preview plays the composition in a sandboxed frame and reports its clock.
  const frame = tab.getByTestId("motion-preview-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(tab.getByTestId("motion-time")).toContainText(/0:0\d \/ 0:\d\d/, { timeout: 15000 });
  const inner = frame.contentFrame();
  await expect(inner.locator("#root[data-composition-id=main]")).toBeAttached();
  await expect(inner.locator("section.clip").first()).toBeAttached();

  // Render: nothing installed yet → the install modal; Install, then the render runs to a version.
  await tab.getByTestId("motion-render").click();
  const install = page.getByTestId("motion-install");
  await expect(install).toBeVisible();
  await install.getByTestId("motion-install-go").click();
  await expect(install).toBeHidden({ timeout: 15000 });
  await tab.getByTestId("motion-render").click();
  await expect(tab.getByTestId("motion-render-row")).toHaveCount(1, { timeout: 20000 });
  await expect(tab.getByTestId("motion-render")).toBeEnabled();

  // Videos: the card shows it rendered.
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-videos").click();
  const card = page.getByTestId("motion-video-card").filter({ hasText: "Shop 2.4" });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "rendered");
});

test("Motion: a render can be cancelled, and a cancelled one leaves no version", async ({
  page,
  jigHome,
}) => {
  const projectId = await shop(page, jigHome);
  await motion(page, "install", {});
  const made = (await motion(page, "create", {
    projectId,
    template: "teaser",
    title: "Hold [hold]",
  })) as { value: { id: string } };
  await hostCall(page, "addons.call", {
    id: "motion",
    method: "render",
    args: { projectId, id: made.value.id },
  });
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-videos").click();
  await page.getByTestId("motion-video-card").filter({ hasText: "Hold" }).click();
  const tab = page.getByTestId("motion-video-tab");
  await expect(tab.getByTestId("motion-cancel")).toBeVisible({ timeout: 10000 });
  await tab.getByTestId("motion-cancel").click();
  await expect(tab.getByTestId("motion-render")).toBeEnabled({ timeout: 10000 });
  await expect(tab.getByTestId("motion-render-row")).toHaveCount(0);
});

test("Motion at sidebar, panel and tab widths, Dark and Light (JIG_UI_SHOTS=1)", async ({
  page,
  app,
  jigHome,
}) => {
  test.skip(!process.env.JIG_UI_SHOTS, "set JIG_UI_SHOTS=1 to take the design-check screenshots");
  test.setTimeout(240_000);
  const projectId = await shop(page, jigHome);
  await motion(page, "install", {});
  for (const [template, title] of [
    ["teaser", "Shift swap"],
    ["whats-new", "Shop 2.4"],
    ["walkthrough", "Getting started"],
  ])
    await motion(page, "create", { projectId, template, title });
  const size = (width: number, height: number) =>
    app.evaluate(
      ({ BrowserWindow }, [w, h]) => {
        BrowserWindow.getAllWindows()
          .find((x) => x.webContents.getURL().startsWith("jig-app:"))!
          .setContentSize(w!, h!);
      },
      [width, height],
    );
  for (const theme of ["jig-dark", "jig-light"]) {
    await hostCall(page, "config.update", { appearance: { themeId: theme } });
    await size(1600, 900);
    await shootView(page, "addon.motion.videos", `motion-videos-${theme}`, {
      ready: (panel) => expect(panel.getByTestId("motion-video-card").first()).toBeVisible(),
    });
    const main = page.getByTestId("main-area");
    for (const [width, label] of [
      [1600, "wide"],
      [820, "narrow"],
    ] as const) {
      await size(width, 900);
      await page.getByTestId("motion-topbar").click();
      await page.getByTestId("motion-menu-videos").click();
      await page.getByTestId("motion-video-card").filter({ hasText: "Shop 2.4" }).first().click();
      await expect(main.getByTestId("motion-video-tab")).toBeVisible();
      await expect(main.getByTestId("motion-time")).toContainText("/", { timeout: 15000 });
      await page.waitForTimeout(1200);
      await main.screenshot({
        path: join(SHOTS_DIR, `motion-tab-${label}-${theme}.png`),
        animations: "disabled",
      });
    }
    await size(1600, 900);
    await main.getByTestId("motion-scene").nth(1).click();
    await expect(page.getByTestId("motion-scene-sheet")).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId("motion-scene-sheet")).toBeVisible();
    await page.screenshot({ path: join(SHOTS_DIR, `motion-scene-${theme}.png`) });
    await page.keyboard.press("Escape");
  }
});
