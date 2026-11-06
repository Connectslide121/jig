import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";

/** A project ("shop") made active, as Jig factory works on the active project. */
async function shop(page: Page, jigHome: string): Promise<string> {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });
  return projectId;
}

const factory = (page: Page, method: string, args: Record<string, unknown>) =>
  hostCall(page, "addons.call", { id: "factory", method, args });

test("Jig factory: sample runs on the floor, a run's page and the inbox", async ({ page, jigHome }) => {
  await shop(page, jigHome);

  // Listed in View → Views; empty until the sample runs are loaded.
  await page.getByTestId("tools-group-View").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Jig factory" }).click();
  const view = page.getByTestId("factory-view");
  await expect(view).toBeVisible({ timeout: 15000 });
  await view.getByTestId("factory-load-samples").click();
  await expect(view.getByTestId("factory-view-row")).toHaveCount(6);
  // Two gates wait for you: the top bar counts them.
  await expect(page.getByTestId("factory-topbar-count")).toHaveText("2");

  // The Floor: a card per run in its lane, fixed in place once shown.
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-floor").click();
  const floor = page.getByTestId("factory-floor");
  await expect(floor).toBeVisible();
  const cards = floor.locator("[data-testid=factory-card]:visible");
  await expect(cards).toHaveCount(6);
  await expect(floor.getByTestId("factory-lane-review").getByTestId("factory-card")).toHaveCount(2);
  await expect(floor.getByTestId("factory-kpis")).toContainText("Waiting for you");
  const card = floor.locator("[data-testid=factory-card][data-run=fx-sample-3]:visible");
  const before = await card.boundingBox();
  await page.waitForTimeout(500);
  expect(await card.boundingBox()).toEqual(before);

  // The whole card opens the run: its stage graph, outputs and timeline.
  const box = before!;
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  const run = page.getByTestId("factory-run");
  await expect(run).toBeVisible();
  await expect(run.getByTestId("factory-run-title")).toHaveText("Route planner");
  await expect(run.getByTestId("factory-node-G1")).toHaveAttribute("data-status", "waiting");
  await expect(run.getByTestId("factory-node-S1")).toHaveAttribute("data-status", "done");
  await expect(run.getByTestId("factory-output").first()).toBeVisible();
  await expect(run.getByTestId("factory-timeline")).not.toBeEmpty();

  // The inbox: everything waiting for a person, a pill for yours.
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-inbox").click();
  const inbox = page.getByTestId("factory-inbox");
  await expect(inbox.getByTestId("factory-inbox-row")).toHaveCount(5);
  await expect(inbox).toContainText("G1 · Demo review");
  await expect(inbox.getByTestId("factory-inbox-row").filter({ hasText: "Route planner" })).toContainText(
    "you",
  );
});

test("Jig factory: removing the sample runs empties the views", async ({ page, jigHome }) => {
  const projectId = await shop(page, jigHome);
  expect((await factory(page, "loadSamples", { projectId })) as { value: number }).toMatchObject({
    value: 6,
  });
  expect(((await factory(page, "runs", { projectId })) as { value: unknown[] }).value).toHaveLength(6);
  await factory(page, "clearSamples", { projectId });
  expect(((await factory(page, "runs", { projectId })) as { value: unknown[] }).value).toHaveLength(0);
});

test("Jig factory at sidebar, panel and tab widths, Dark and Light (JIG_UI_SHOTS=1)", async ({
  page,
  app,
  jigHome,
}) => {
  test.skip(!process.env.JIG_UI_SHOTS, "set JIG_UI_SHOTS=1 to take the design-check screenshots");
  test.setTimeout(240_000);
  const projectId = await shop(page, jigHome);
  await factory(page, "loadSamples", { projectId });
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
    await shootView(page, "addon.factory.factory", `factory-view-${theme}`, {
      ready: (panel) => expect(panel.getByTestId("factory-view-row").first()).toBeVisible(),
    });
    const main = page.getByTestId("main-area");
    const tab = async (item: string, testId: string, name: string) => {
      await page.getByTestId("factory-topbar").click();
      await page.getByTestId(item).click();
      await expect(main.getByTestId(testId)).toBeVisible();
      await page.waitForTimeout(400);
      await main.screenshot({
        path: join(SHOTS_DIR, `factory-${name}-${theme}.png`),
        animations: "disabled",
      });
    };
    for (const [width, label] of [
      [1600, "wide"],
      [820, "narrow"],
    ] as const) {
      await size(width, 900);
      await tab("factory-menu-floor", "factory-floor", `floor-${label}`);
      await main.locator("[data-testid=factory-card][data-run=fx-sample-5]:visible").click();
      await expect(main.getByTestId("factory-run")).toBeVisible();
      await page.waitForTimeout(800);
      await main.screenshot({
        path: join(SHOTS_DIR, `factory-run-${label}-${theme}.png`),
        animations: "disabled",
      });
      await tab("factory-menu-inbox", "factory-inbox", `inbox-${label}`);
    }
  }
});
