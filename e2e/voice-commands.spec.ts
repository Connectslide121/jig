import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

/** The fake engine "hears" what the test says (no microphone in tests): a take, or something said. */
const sayTo = (page: Page) => (text: string) =>
  page.evaluate((detail) => window.dispatchEvent(new CustomEvent("jig-fake-wake", { detail })), text);

type Speech = { speech: { wake: boolean; wakeProfile: { variants: string[]; heard: string[] } | null } };
const speech = async (page: Page) => ((await hostCall(page, "config.get")) as { value: Speech }).value.speech;

test('voice commands: "Hey Jig" opens a chat in Talk mode and answers from Jig\'s own state', async ({
  page,
  jigHome,
}) => {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const say = sayTo(page);
  // Always in the status bar (D-387): off and dimmed until a click turns it on.
  const status = page.getByTestId("wake-status");
  await expect(status).toHaveAttribute("data-phase", "off");
  await expect(status).toHaveAttribute("title", /^Hey Jig is off · Click to listen/);
  const box = await status.boundingBox();

  // Never trained: turning it on asks for the training first (D-389), five takes.
  await status.click();
  const training = page.getByTestId("train-wake");
  await expect(training).toBeVisible();
  await expect(status).toHaveAttribute("data-phase", "off");
  await expect(page.getByTestId("train-take-1")).toHaveAttribute("data-state", "current");
  await say("Hey Jig.");
  await expect(page.getByTestId("train-take-1")).toHaveAttribute("data-state", "done");
  await say("");
  await expect(page.getByTestId("train-wake-prompt")).toHaveText(/Didn't catch that/);
  await expect(page.getByTestId("train-take-2")).toHaveAttribute("data-state", "again");
  await say("Hey, you.");
  await expect(page.getByTestId("train-take-2")).toContainText("learned as yours");
  await expect(page.getByTestId("train-wake-save")).toBeDisabled();
  for (const take of ["Hey Jig.", "Hey, big.", "Hey jig"]) await say(take);
  await expect(page.getByTestId("train-take-5")).toHaveAttribute("data-state", "done");
  await page.getByTestId("train-wake-save").click();
  await expect(training).toBeHidden();
  await expect(status).toHaveAttribute("data-phase", "listening");
  expect((await status.boundingBox())?.width).toBe(box?.width);
  const trained = await speech(page);
  expect(trained.wake).toBe(true);
  expect(trained.wakeProfile?.variants).toEqual(["hey you"]);
  expect(trained.wakeProfile?.heard).toHaveLength(5);

  // Trained: a click turns it off and on without asking again.
  await status.click();
  await expect(status).toHaveAttribute("data-phase", "off");
  await status.click();
  await expect(status).toHaveAttribute("data-phase", "listening");
  await expect(training).toBeHidden();

  // Not for Jig: nothing happens.
  await say("I was talking about the jig saw");
  await say("Hey Jig, what's happening?");
  await expect(status).toHaveAttribute("data-said", "All quiet. No chat is working.");
  await say("Hey Jig, make me a sandwich");
  await expect(status).toHaveAttribute("data-said", /I didn't get that/);
  await say("Hey Jig, repeat that");
  await expect(status).toHaveAttribute("data-said", /I didn't get that/);
  // Your trained start, and one that sounds like "Hey Jig".
  await say("Hey, you. What can I say?");
  await expect(status).toHaveAttribute("data-said", /^Chats: new chat/);
  await say("Hey, geek, make me a sandwich");
  await expect(status).toHaveAttribute("data-said", /I didn't get that/);

  // A new chat opens in Talk mode.
  await say("Hey Jig, open a new chat in Shop");
  await expect(status).toHaveAttribute("data-said", "New chat in shop. Talk to Jig now.");
  await expect(page.getByTestId("voice-dialog")).toBeVisible();
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("composer-voice")).not.toHaveAttribute(
    "data-phase",
    "off",
  );

  // "Hey Jig" alone wakes it; the command follows without it.
  await page.getByTestId("voice-dialog").getByRole("button", { name: "End talking" }).last().click();
  await expect(page.getByTestId("voice-dialog")).toBeHidden();
  await say("Hey Jig");
  await say("what can I say");
  await expect(status).toHaveAttribute("data-said", /^Chats: new chat/);

  // The training shows what was heard lately and why it was ignored (the readout, D-389).
  await say("Hey Jake, how are you?");
  await status.click({ button: "right" });
  await page.getByTestId("wake-menu-train").click();
  await expect(page.getByTestId("train-heard")).toContainText("“hey” then “jake”, not Jig");
  await expect(page.getByTestId("train-heard")).toContainText("“Hey Jig”");
  await say("Hey Jig");
  await expect(page.getByTestId("train-take-1")).toHaveAttribute("data-state", "done");
  await page.getByTestId("train-wake-skip").click();
  await expect(training).toBeHidden();
  expect((await speech(page)).wakeProfile?.variants).toEqual(["hey you"]);

  // The page lists the commands; the status bar's right-click menu opens it.
  await status.click({ button: "right" });
  await page.getByTestId("wake-menu-commands").click();
  await expect(page.getByTestId("voice-commands")).toBeVisible();
  await expect(page.getByTestId("voice-commands")).toContainText("Asks for a yes");

  // "Stop listening" turns it off.
  await say("Hey Jig, stop listening");
  await expect(status).toHaveAttribute("data-phase", "off");
  expect((await speech(page)).wake).toBe(false);
});

test("Hey Jig: turned on in Settings without training, skipping it still listens", async ({ page }) => {
  const status = page.getByTestId("wake-status");
  await page.keyboard.press("Control+,");
  await page.getByTestId("settings-nav-speech").click();
  await expect(page.getByTestId("settings-speech-train")).toHaveText("Train…");
  await page.getByRole("switch", { name: "Listen for Hey Jig" }).click();
  await expect(page.getByTestId("train-wake")).toBeVisible();
  await page.getByTestId("train-wake-skip").click();
  await expect(page.getByTestId("train-wake")).toBeHidden();
  await expect(status).toHaveAttribute("data-phase", "listening");
  expect((await speech(page)).wakeProfile).toBeNull();
  // Training from Settings, once done, says when.
  await page.getByTestId("settings-speech-train").click();
  const say = sayTo(page);
  for (let i = 0; i < 5; i++) await say("Hey Jig");
  await page.getByTestId("train-wake-save").click();
  await expect(page.getByTestId("settings-speech-train")).toHaveText("Train again…");
  await expect(page.getByText(/^Trained on /)).toBeVisible();
});
