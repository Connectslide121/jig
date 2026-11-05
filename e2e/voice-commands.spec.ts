import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test('voice commands: "Hey Jig" opens a chat in Talk mode and answers from Jig\'s own state', async ({
  page,
  jigHome,
}) => {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  // Always in the status bar (D-387): off and dimmed until a click turns it on.
  const status = page.getByTestId("wake-status");
  await expect(status).toHaveAttribute("data-phase", "off");
  await expect(status).toHaveAttribute("title", /^Hey Jig is off · Click to listen/);
  const box = await status.boundingBox();
  await status.click();
  await expect(status).toHaveAttribute("data-phase", "listening");
  expect((await status.boundingBox())?.width).toBe(box?.width);
  await status.click();
  await expect(status).toHaveAttribute("data-phase", "off");
  // Settings → Speech → Hey Jig turns it on too.
  await page.keyboard.press("Control+,");
  await page.getByTestId("settings-nav-speech").click();
  await page.getByRole("switch", { name: "Listen for Hey Jig" }).click();
  await expect(status).toHaveAttribute("data-phase", "listening");
  await page.keyboard.press("Escape");
  // The fake engine "hears" what the test says (no microphone in tests).
  const say = (text: string) =>
    page.evaluate((detail) => window.dispatchEvent(new CustomEvent("jig-fake-wake", { detail })), text);

  // Not for Jig: nothing happens.
  await say("I was talking about the jig saw");
  await say("Hey Jig, what's happening?");
  await expect(status).toHaveAttribute("data-said", "All quiet. No chat is working.");
  await say("Hey Jig, make me a sandwich");
  await expect(status).toHaveAttribute("data-said", /I didn't get that/);
  await say("Hey Jig, repeat that");
  await expect(status).toHaveAttribute("data-said", /I didn't get that/);

  // A new chat opens in Talk mode.
  await say("Hey Jig, open a new chat in Shop");
  await expect(status).toHaveAttribute("data-said", "New chat in shop. Talk to Claude now.");
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

  // The page lists the commands; the status bar's right-click menu opens it.
  await status.click({ button: "right" });
  await expect(page.getByTestId("wake-menu-train")).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("wake-menu-commands").click();
  await expect(page.getByTestId("voice-commands")).toBeVisible();
  await expect(page.getByTestId("voice-commands")).toContainText("Asks for a yes");

  // "Stop listening" turns it off.
  await say("Hey Jig, stop listening");
  await expect(status).toHaveAttribute("data-phase", "off");
  expect(
    ((await hostCall(page, "config.get")) as { value: { speech: { wake: boolean } } }).value.speech.wake,
  ).toBe(false);
});
