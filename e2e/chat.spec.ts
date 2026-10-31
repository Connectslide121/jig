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

test("chat: several questions are asked one step at a time", async ({ page, jigHome }) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await say(page, "ask me several questions");
  const card = page.getByTestId("question-card");
  await expect(card.getByTestId("question-step")).toHaveText("1 of 3");
  // Nothing to go on with before an answer; the recommended option is marked.
  await expect(card.getByTestId("question-next")).toBeDisabled();
  await expect(card).toContainText("Recommended");
  await card.getByTestId("option-Capture Jenkins (Recommended)").click();
  await card.getByTestId("question-next").click();
  // Several choices at once.
  await expect(card.getByTestId("question-step")).toHaveText("2 of 3");
  await card.getByTestId("option-check-stage").click();
  await card.getByTestId("option-check-demo").click();
  await card.getByTestId("question-next").click();
  // Your own words; Back keeps what was chosen.
  await card.getByTestId("question-back").click();
  await expect(card.getByTestId("option-check-demo")).toHaveAttribute("aria-pressed", "true");
  await card.getByTestId("question-next").click();
  await expect(card.getByTestId("question-submit")).toBeDisabled();
  await card.getByTestId("option-other").click();
  await card.getByTestId("question-other").fill("I removed the accounts");
  await card.getByTestId("question-submit").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText(
    "Capture Jenkins (Recommended) | check-stage, check-demo | I removed the accounts",
  );
  // Answered: a summary of what you said.
  await expect(page.getByTestId("question-card")).toContainText("I removed the accounts");
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
  // Claude Code's own list has no opusplan: the picker still names it, and marks it as the current one.
  await expect(page.getByTestId("model-opusplan")).toContainText("Opus Plan Mode");
  await expect(page.getByRole("menu")).not.toContainText("opusplan");
  await page.getByTestId("model-opus").click();
  await expect(page.getByTestId("model-menu")).toContainText("Opus");
  await expect(page.getByTestId("model-menu")).not.toContainText("Plan");
  // And it can be chosen again.
  await page.getByTestId("model-menu").click();
  await page.getByTestId("model-opusplan").click();
  await expect(page.getByTestId("model-menu")).toContainText("Opus Plan Mode");
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

test("chat: opening a chat of another project makes that project the active one", async ({
  page,
  jigHome,
}) => {
  await withProject(page, jigHome, "one");
  await withProject(page, jigHome, "two");
  const switcher = page.getByTestId("project-switcher");
  // A chat in project "two" (the active one: the last added), then project "one" becomes active.
  await expect(switcher).toContainText("two");
  await page.keyboard.press("Control+N");
  await say(page, "first in two");
  await expect(page.getByTestId("turn-result")).toBeVisible();
  await switcher.click();
  await page.getByTestId("project-item-one").click();
  await expect(switcher).toContainText("one");
  // The chat tab is still in front: choosing a project doesn't pull it back.
  await page.waitForTimeout(500);
  await expect(switcher).toContainText("one");
  await page.getByTestId("view-tab-jig.sessions").click();
  // The other project's group is closed: open it, select the chat, and that project is active.
  await page.getByTestId("chat-group-two").getByRole("button").first().click();
  await page.getByTestId("session-first in two").click();
  await expect(switcher).toContainText("two");
});

test("chat: the overview panel counts tools, skills, subagents, add-ons and MCP; details in a modal", async ({
  page,
  jigHome,
}) => {
  await withProject(page, jigHome);
  await page.keyboard.press("Control+N");
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  await say(page, "use a skill to explain the code");
  await expect(tab.getByTestId("turn-result")).toHaveCount(1, { timeout: 15000 });
  await tab.locator("[data-testid=composer-input]").fill("ask a subagent");
  await page.keyboard.press("Enter");
  await expect(tab.getByTestId("turn-result")).toHaveCount(2, { timeout: 15000 });
  // A panel on the chat's right, part of its window.
  const card = tab.getByTestId("chat-overview");
  await expect(card.getByTestId("chat-overview-tools")).toContainText("6");
  await expect(card.getByTestId("chat-overview-skills")).toContainText("1");
  await expect(card.getByTestId("chat-overview-addons")).toContainText("1");
  await expect(card).toContainText("Releases");
  await card.getByTestId("chat-overview-details").click();
  const details = page.getByTestId("chat-details-dialog");
  await expect(details.getByTestId("chat-details-tools")).toContainText("Skill");
  await expect(details.getByTestId("chat-details-skills")).toContainText("explain-code");
  await expect(details.getByTestId("chat-details-subagents")).toContainText("Explore the cart code");
  await expect(details.getByTestId("chat-details-mcp")).toContainText("github");
  await expect(details.getByTestId("chat-details-addons")).toContainText("Releases");
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  // Also from the chat's ⋯ menu; and the top bar's chart button hides it (a setting).
  await tab.getByRole("button", { name: "Chat options" }).click();
  await page.getByTestId("session-overview").click();
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await tab.getByTestId("chat-overview-toggle").click();
  await expect(tab.getByTestId("chat-overview")).toHaveCount(0);
  const config = (await hostCall(page, "config.get")) as { value: { chat: { overview: boolean } } };
  expect(config.value.chat.overview).toBe(false);
});
