import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

async function project(page: Page, jigHome: string) {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  return dir;
}

async function openTool(page: Page, title: string) {
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill(title);
  await page.keyboard.press("Enter");
}

test("Routines: list, switch off, run now, runs and their log; Claude makes one from a chat", async ({
  page,
  jigHome,
}) => {
  await project(page, jigHome);
  await openTool(page, "Routines");
  const tab = page.getByTestId("routines");
  await expect(tab.getByTestId("routine-row")).toHaveCount(2, { timeout: 15000 });
  await expect(tab.getByTestId("routine-row").first()).toContainText("Weekdays at 08:37 (Europe/Stockholm)");
  const detail = tab.getByTestId("routine-detail");
  await expect(detail).toContainText("Review my open pull requests");

  // Runs and a run's log.
  await expect(detail.getByTestId("routine-run-row")).toHaveCount(1);
  await detail.getByTestId("routine-run-row").locator("button").first().click();
  await expect(detail.getByTestId("routine-log")).toContainText("Two pull requests need your review");

  // Run now adds a run.
  await detail.getByTestId("routine-run").click();
  await expect(detail.getByTestId("routine-run-row")).toHaveCount(2, { timeout: 10000 });

  // Switch the second one on.
  const second = tab.getByTestId("routine-row").nth(1);
  await second.getByRole("switch").click();
  await expect(second.getByRole("switch")).toHaveAttribute("aria-checked", "true", { timeout: 10000 });

  // Claude creates a routine from a chat (after you allow it); the tab follows.
  await page.keyboard.press("Control+N");
  const input = page.locator("[data-tab-id]:not(.hidden)").getByTestId("composer-input");
  await input.fill("make a routine for my standup");
  await page.keyboard.press("Enter");
  await page.getByTestId("permission-allow").click();
  const chat = page.locator("[data-tab-id]:not(.hidden)").getByTestId("chat");
  await expect(chat).toContainText("I created the routine", { timeout: 15000 });
  await chat.getByRole("button", { name: "Open Routines" }).click();
  await expect(tab.getByTestId("routine-row")).toHaveCount(3, { timeout: 15000 });
  await expect(tab).toContainText("Daily standup notes");
});

test("Artifacts: a chat's artifact opens in Jig; claude.ai artifacts load and open too", async ({
  page,
  jigHome,
}) => {
  await project(page, jigHome);
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("publish an artifact with the release notes");
  await page.keyboard.press("Enter");
  const chat = page.getByTestId("chat");
  await expect(chat).toContainText("I published the release notes", { timeout: 15000 });
  await expect(chat.getByTestId("artifact-actions")).toContainText(
    "https://claude.ai/artifact/fakeReleaseNotes",
  );
  await chat.getByTestId("artifact-open-jig").click();
  await expect(
    page.locator("[data-tab-id]:not(.hidden)").frameLocator('[data-testid="preview-html"]').locator("h1"),
  ).toHaveText("Release notes", {
    timeout: 10000,
  });

  await openTool(page, "Artifacts");
  const tab = page.getByTestId("artifacts");
  await expect(tab.getByTestId("artifact-row")).toHaveCount(1);
  await expect(tab.getByTestId("artifact-row").first()).toContainText("release-notes");
  await tab.getByTestId("artifacts-load").click();
  await expect(tab.getByTestId("artifact-row")).toHaveCount(3, { timeout: 15000 });
  await expect(tab).toContainText("from a Jig chat");
  await tab.getByTestId("artifact-row").nth(2).getByTestId("artifact-open").click();
  await expect(
    page.locator("[data-tab-id]:not(.hidden)").frameLocator('[data-testid="preview-html"]').locator("h1"),
  ).toHaveText("Sprint dashboard", {
    timeout: 10000,
  });
});
