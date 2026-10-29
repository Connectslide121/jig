import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

const screenText = (page: Page) => page.locator(".jig-xterm:visible .xterm-rows");

async function project(page: Page, jigHome: string) {
  const path = join(jigHome, "app");
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "package.json"),
    JSON.stringify({ scripts: { dev: "echo dev-running && sleep 30", lint: "echo lint-ok" } }),
  );
  await hostCall(page, "projects.add", { path });
}

test.skip(process.platform === "win32", "uses POSIX shell commands");

test("terminals: open in the bottom panel, type, see output", async ({ page, jigHome }) => {
  await project(page, jigHome);
  await page.keyboard.press("Control+`");
  await expect(page.getByTestId("terminals-view")).toBeVisible();
  await page.locator(".jig-xterm:visible").click();
  await page.keyboard.type("echo jig-$((6*7))\r");
  await expect(screenText(page)).toContainText("jig-42");
});

test("scripts: discovered, run from the Scripts panel, shown in the status bar, stopped", async ({
  page,
  jigHome,
}) => {
  await project(page, jigHome);
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Scripts" }).click();
  const view = page.getByTestId("scripts-view");
  await expect(view.getByTestId("scripts-addon-dev")).toBeVisible({ timeout: 15000 });
  await view.getByRole("button", { name: "Run dev" }).click();
  await expect(screenText(page)).toContainText("dev-running");
  await expect(page.getByTestId("running-scripts")).toContainText("1 running");
  await view.getByRole("button", { name: "Stop dev" }).first().click();
  await expect(page.getByTestId("running-scripts")).toHaveCount(0);
});
