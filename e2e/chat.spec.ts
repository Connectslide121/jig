import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, launchJig, test } from "./fixtures";

async function withProject(page: Page, jigHome: string, name = "demo") {
  const path = join(jigHome, name);
  await mkdir(path, { recursive: true });
  await hostCall(page, "projects.add", { path });
}

async function say(page: Page, text: string) {
  await page.getByTestId("composer-input").fill(text);
  await page.keyboard.press("Enter");
}

test("chat: send, stream a markdown reply with highlighted code, show usage", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await say(page, "Hello Claude");
  await expect(page.getByTestId("user-message")).toHaveText("Hello Claude");
  await expect(page.getByTestId("turn-result")).toContainText("Done");
  await expect(page.getByTestId("assistant-message")).toContainText("You said: Hello Claude");
  await expect(page.locator(".jig-code .shiki")).toHaveCount(1);
  await expect(page.getByTestId("tab-jig.chat")).toContainText("Hello Claude");
  await expect(page.getByTestId("chat-status")).toHaveText("Idle");
});

test("chat: permission prompts can be allowed or denied", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await say(page, "please run the tests");
  await expect(page.getByTestId("permission-card")).toContainText("npm test");
  await expect(page.getByTestId("chat-status")).toHaveText("Needs you");
  await page.getByTestId("permission-allow").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("12 tests");
  await say(page, "run them again");
  await page.getByTestId("permission-deny").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("won't run the tests");
});

test("chat: answering Claude's question", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await say(page, "ask me a question");
  await page.getByTestId("option-Neutral").click();
  await page.getByTestId("question-submit").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("Neutral it is");
});

test("chat: follow-ups queue while Claude works; Stop interrupts", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await say(page, "slow answer please");
  await expect(page.getByTestId("composer-stop")).toBeVisible();
  await say(page, "and then this");
  await expect(page.getByTestId("queue")).toContainText("and then this");
  await page.getByTestId("composer-stop").click();
  await expect(page.getByTestId("turn-result").first()).toContainText("Interrupted");
  // The queued message is sent after the interrupted turn.
  await expect(page.getByTestId("user-message").last()).toHaveText("and then this");
  await expect(page.getByTestId("queue")).toHaveCount(0);
});

test("chat: model and permission mode menus", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  // The default model (opusplan) reads as the picker names it, before the picker was opened.
  await expect(page.getByTestId("model-menu")).toContainText("Opus Plan Mode");
  await page.getByTestId("permission-menu").click();
  await page.getByTestId("mode-plan").click();
  await expect(page.getByTestId("permission-menu")).toContainText("Plan only");
  await page.getByTestId("model-menu").click();
  await page.getByTestId("model-opus").click();
  await expect(page.getByTestId("model-menu")).toContainText("Opus");
});

test("chat: sessions list across projects and survive a restart", async ({ app, page, jigHome }) => {
  await withProject(page, jigHome, "one");
  await withProject(page, jigHome, "two");
  await page.getByTestId("view-tab-jig.sessions").click();
  await page.getByTestId("new-session").click();
  await say(page, "first in two");
  await expect(page.getByTestId("turn-result")).toBeVisible();
  await expect(page.getByTestId("session-first in two")).toBeVisible();
  await page.waitForTimeout(700);
  await app.close();
  const again = await launchJig(jigHome);
  const page2 = await again.firstWindow();
  await expect(page2.getByTestId("user-message")).toHaveText("first in two");
  await expect(page2.getByTestId("assistant-message")).toContainText("You said");
  await again.close();
});

test("chat: tells you to sign in when Claude Code isn't logged in", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await say(page, "login");
  await expect(page.getByTestId("login-banner")).toContainText("isn't signed in");
});

test("chat: compact view folds Claude's steps into one line; Detailed shows every card", async ({
  page,
  jigHome,
}) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await page.getByTestId("chat-view-compact").click();
  await say(page, "make a todo list for the release");
  await expect(page.getByTestId("turn-result")).toContainText("Done", { timeout: 15000 });
  const chat = page.locator("[data-testid=transcript]:visible");
  // The three to-do updates are one line; their cards stay folded.
  const steps = chat.getByTestId("steps-row");
  await expect(steps).toHaveCount(1);
  await expect(steps).toContainText("Updated the to-do list");
  await expect(chat.getByTestId("tool-card")).toHaveCount(0);
  await expect(chat.getByTestId("assistant-message").first()).toBeVisible();
  // Opening the line shows the cards.
  await steps.getByTestId("steps-toggle").click();
  await expect(chat.getByTestId("tool-card")).toHaveCount(3);
  await steps.getByTestId("steps-toggle").click();
  // Detailed: every card, no folded lines; the choice is kept as a setting.
  await page.getByTestId("chat-view-detailed").click();
  await expect(chat.getByTestId("steps-row")).toHaveCount(0);
  await expect(chat.getByTestId("tool-card")).toHaveCount(3);
  const config = (await hostCall(page, "config.get")) as { value: { chat: { view: string } } };
  expect(config.value.chat.view).toBe("detailed");
});

test("chat: long unbroken text never makes the transcript scroll sideways", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  const long = `${"x".repeat(240)}/${"y".repeat(240)}`;
  await say(page, `Check ${long} and \`${long}\``);
  await expect(page.getByTestId("turn-result")).toContainText("Done", { timeout: 15000 });
  const sizes = await page
    .locator("[data-testid=transcript]:visible")
    .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
});
