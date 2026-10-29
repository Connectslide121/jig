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

test("scripts: discovered, run from the dashboard, shown in the status bar, stopped", async ({
  page,
  jigHome,
}) => {
  await project(page, jigHome);
  await page.getByTestId("project-app").dblclick();
  await expect(page.getByTestId("script-dev")).toBeVisible();
  await page.getByTestId("script-run-dev").click();
  await expect(screenText(page)).toContainText("dev-running");
  await expect(page.getByTestId("running-scripts")).toContainText("1 running");
  await page.getByTestId("script-stop-dev").click();
  await expect(page.getByTestId("running-scripts")).toHaveCount(0);
});

test("scripts: a group starts several scripts at once", async ({ page, jigHome }) => {
  await project(page, jigHome);
  await page.getByTestId("project-app").dblclick();
  await page.getByTestId("group-new").click();
  await page.getByTestId("group-name").fill("Start local");
  await page.getByTestId("group-pick-dev").check();
  await page.getByTestId("group-pick-lint").check();
  await page.getByTestId("group-save").click();
  await page.getByTestId("group-run-Start local").click();
  await expect(page.getByTestId("terminal-tab-dev")).toBeVisible();
  await expect(page.getByTestId("terminal-tab-lint")).toBeVisible();
});
