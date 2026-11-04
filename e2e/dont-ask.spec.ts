import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

/**
 * Don't ask mode's safety checks (D-336): Claude Code still asks about some things (an rm -rf on a
 * critical path); Jig shows the card with a countdown and declines it when nobody answers in time.
 */
async function dontAskChat(page: Page, jigHome: string, waitSeconds: number) {
  const path = join(jigHome, "demo");
  await mkdir(path, { recursive: true });
  await hostCall(page, "projects.add", { path });
  await hostCall(page, "config.update", {
    engine: { defaultPermissionMode: "bypassPermissions", dontAskWaitSeconds: waitSeconds },
  });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("please do the safety check");
  await page.keyboard.press("Enter");
}

test("don't ask: an unanswered safety check is declined after the wait", async ({ page, jigHome }) => {
  await dontAskChat(page, jigHome, 2);
  await expect(page.getByTestId("permission-card")).toContainText("Dangerous rm operation on critical path");
  await expect(page.getByTestId("permission-countdown")).toContainText("Declines in 0:0");
  await expect(page.getByTestId("chat-status")).toHaveText("Needs you");
  await expect(page.getByTestId("permission-timed-out")).toContainText("no answer within 2 seconds");
  await expect(page.getByTestId("permission-card")).toHaveCount(0);
  await expect(page.getByTestId("assistant-message").last()).toContainText("skipped removing it");
  await expect(page.getByTestId("chat-status")).toHaveText("Idle");
});

test("don't ask: answering a safety check in time uses your answer", async ({ page, jigHome }) => {
  await dontAskChat(page, jigHome, 30);
  await expect(page.getByTestId("permission-countdown")).toBeVisible();
  await page.getByTestId("permission-allow").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("Removed the build folder");
  await expect(page.getByTestId("permission-timed-out")).toHaveCount(0);
});

test("don't ask: a wait of 0 declines at once", async ({ page, jigHome }) => {
  await dontAskChat(page, jigHome, 0);
  await expect(page.getByText("Declined automatically in Don't ask mode")).toBeVisible();
  await expect(page.getByTestId("assistant-message").last()).toContainText("skipped removing it");
  await expect(page.getByTestId("permission-card")).toHaveCount(0);
});
