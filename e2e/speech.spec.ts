import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("speech: download the dictation model, dictate into the composer, read a reply aloud", async ({
  page,
  jigHome,
}) => {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  await page.keyboard.press("Control+N");
  const mic = page.locator("[data-tab-id]:not(.hidden)").getByTestId("composer-dictate");

  // The first time, the model is downloaded (the fake transcriber pretends), then you click again.
  await mic.click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("toast")).toContainText("Dictation is ready");
  await expect(mic).toHaveAttribute("data-phase", "idle");

  const input = page.getByTestId("composer-input");
  await input.fill("Note: ");
  await mic.click();
  await expect(mic).toHaveAttribute("data-phase", "recording");
  // The words appear while you speak, before you stop.
  await expect(input).toHaveValue("Note: Hello Claude, this came from the microphone.");
  await expect(mic).toHaveAttribute("data-phase", "recording");
  await mic.click();
  await expect(input).toHaveValue("Note: Hello Claude, this came from the microphone.");
  await expect(mic).toHaveAttribute("data-phase", "idle");

  // The shortcut starts it, Esc throws the recording away.
  await input.focus();
  await page.keyboard.press("Control+Shift+Space");
  await expect(mic).toHaveAttribute("data-phase", "recording");
  await page.keyboard.press("Escape");
  await expect(mic).toHaveAttribute("data-phase", "idle");
  await expect(input).toHaveValue("Note: Hello Claude, this came from the microphone.");

  await page.keyboard.press("Enter");
  const reply = page.getByTestId("assistant-message").first();
  await expect(reply).toContainText("You said");
  await expect(reply.getByTestId("assistant-read-aloud")).toHaveCount(1);
});

test("speech: settings choose the model and language; only Jig's models can be removed", async ({ page }) => {
  await page.keyboard.press("Control+,");
  await page.getByTestId("settings-nav-speech").click();
  await page.getByTestId("settings-speech-model").selectOption("small");
  await page.getByTestId("settings-speech-language").selectOption("sv");
  await expect(page.getByTestId("settings-speech-how-to-talk")).toContainText("yes, go ahead");
  await expect(page.getByTestId("settings-speech-more-voices")).toContainText("Restart Jig");
  // The natural voice is the default; the system voice list is for the system engine.
  await expect(page.getByTestId("settings-speech-engine")).toHaveValue("natural");
  await expect(page.getByTestId("settings-speech-voice")).toBeDisabled();
  await page.getByTestId("settings-speech-natural-voice").selectOption("ef_dora");
  await expect(page.getByTestId("settings-speech-download-voice")).toBeVisible();
  await page.getByTestId("settings-speech-try").click();
  await expect
    .poll(async () => ((await hostCall(page, "config.get")) as { value: { speech: unknown } }).value.speech)
    .toMatchObject({ model: "small", language: "sv", engine: "natural", naturalVoice: "ef_dora" });
  await page.getByTestId("settings-speech-engine").selectOption("system");
  await expect(page.getByTestId("settings-speech-natural-voice")).toBeDisabled();
  expect(await hostCall(page, "speech.voiceModel")).toMatchObject({ value: { downloaded: false, bytes: 0 } });
  expect(await hostCall(page, "speech.say", { text: "Hi", voice: "../x", speed: 1 })).toMatchObject({
    ok: false,
  });
  expect(
    await hostCall(page, "speech.sayParts", { id: 1, text: "Hi", voice: "../x", speed: 1 }),
  ).toMatchObject({ ok: false });
  const models = (await hostCall(page, "speech.models")) as { value: Array<{ downloaded: boolean }> };
  expect(models.value.map((m) => m.downloaded)).toEqual([false, false, false]);
  expect(await hostCall(page, "speech.removeModel", { model: "../../etc" })).toMatchObject({ ok: false });
});

async function talkingChat(page: import("@playwright/test").Page, jigHome: string, mode?: string) {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  await page.keyboard.press("Control+N");
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  const voice = tab.getByTestId("composer-voice");
  const meta = async () =>
    (
      (await hostCall(page, "sessions.list")) as {
        value: Array<{ id: string; voice?: boolean; permissionMode: string; status: string }>;
      }
    ).value[0];
  // The fake engine hears what the test says (no microphone in tests).
  const say = (text: string) =>
    page.evaluate((detail) => window.dispatchEvent(new CustomEvent("jig-fake-speech", { detail })), text);
  if (mode) {
    const id = (await meta())!.id;
    await hostCall(page, "sessions.setPermissionMode", { id, mode });
    await expect.poll(async () => (await meta())?.permissionMode).toBe(mode);
  }
  await voice.click();
  const dialog = page.getByTestId("voice-dialog");
  await expect(dialog).toBeVisible();
  await expect(voice).toHaveAttribute("data-phase", "listening");
  await expect.poll(meta).toMatchObject({ voice: true, permissionMode: "plan" });
  return { tab, voice, dialog, meta, say };
}

test("speech: talk with Claude, it looks at the code, agree on a plan and it starts working", async ({
  page,
  jigHome,
}) => {
  const { tab, voice, dialog, meta, say } = await talkingChat(page, jigHome);

  // Claude looks at the code while you plan; the window says what it is doing.
  await say("Please look at the code for the cart");
  await expect(dialog.getByTestId("voice-status")).toContainText(/Searching the code|Reading cart\.ts/);
  await expect(dialog.getByTestId("voice-transcript")).toContainText("Shall the discount go there?");

  // The conversation so far, yours and Claude's, always in view; no plan card until there is a plan.
  await expect(dialog.getByTestId("voice-plan")).toHaveCount(0);
  const lines = dialog.getByTestId("voice-line");
  await expect(lines.first()).toHaveAttribute("data-who", "you");
  await expect(lines.first()).toContainText("look at the code");
  await expect(dialog.getByTestId("voice-transcript")).toContainText("worked out in cart.ts");

  // The plan shows in the window as it comes.
  await say("Let's make a plan for discounts");
  await expect(dialog.getByTestId("voice-plan")).toContainText("discount");
  await expect(dialog.getByTestId("voice-plan")).toHaveAttribute("data-kind", "plan");
  await expect(voice).toHaveAttribute("data-said", /Shall I start\?/);

  // The go-ahead: Claude starts, talking ends, and the work is followed with sounds until it's done.
  await say("Yes, go ahead.");
  await expect(dialog).toBeHidden();
  await expect(voice).toHaveAttribute("data-phase", "off");
  await expect(tab.getByTestId("assistant-message").last()).toContainText(
    "Starting on the plan (mode: acceptEdits)",
  );
  await expect(voice).toHaveAttribute("data-last-cue", "done");
  await expect(voice).not.toHaveAttribute("data-following", "true");
  await expect.poll(async () => (await meta())?.voice).toBeFalsy();
  await expect(tab.getByTestId("composer-input")).toHaveValue("");
});

test("speech: the Go ahead button asks for the plan and starts it; mute ignores you", async ({
  page,
  jigHome,
}) => {
  const { tab, voice, dialog, say } = await talkingChat(page, jigHome);

  await dialog.getByTestId("voice-mute").click();
  await expect(dialog.getByTestId("voice-status")).toContainText("Microphone muted");
  await say("Let's make a plan for discounts");
  await page.waitForTimeout(500);
  await expect(tab.getByTestId("plan-card")).toHaveCount(0);
  await dialog.getByTestId("voice-mute").click();

  await dialog.getByTestId("voice-go-ahead").click();
  await expect(dialog).toBeHidden();
  await expect(tab.getByTestId("user-message").last()).toContainText("Go ahead, start working.");
  await expect(tab.getByTestId("assistant-message").last()).toContainText(
    "Starting on the plan (mode: acceptEdits)",
  );
  await expect(voice).toHaveAttribute("data-last-cue", "done");
});

test("speech: bye ends talking, not the chat or Claude's work", async ({ page, jigHome }) => {
  const { tab, voice, dialog, meta, say } = await talkingChat(page, jigHome, "acceptEdits");

  await say("Please look at the code for the cart");
  await expect(dialog.getByTestId("voice-status")).toContainText(/Searching the code|Reading cart\.ts/);
  await say("OK, bye!");
  await expect(dialog).toBeHidden();
  await expect(voice).toHaveAttribute("data-phase", "off");
  // Claude carries on and finishes; then the chat is back in its own mode.
  await expect(tab.getByTestId("assistant-message").last()).toContainText("worked out in cart.ts");
  await expect(voice).toHaveAttribute("data-last-cue", "done");
  await expect.poll(async () => (await meta())?.permissionMode).toBe("acceptEdits");
  expect((await meta())?.voice).toBeFalsy();
});

test("speech: microphone, speaker and noise filter in Settings and while talking", async ({
  page,
  jigHome,
}) => {
  await page.keyboard.press("Control+,");
  await page.getByTestId("settings-nav-speech").click();
  // Chromium's fake devices (tests) are listed after "System default" (with the default's name).
  const mic = page.getByTestId("speech-input-device");
  await expect(mic.locator("option").first()).toHaveText(/^System default/);
  await expect.poll(() => mic.locator("option").count()).toBeGreaterThan(1);
  await expect(page.getByTestId("speech-output-device").locator("option").first()).toHaveText(
    /^System default/,
  );
  await expect(page.getByTestId("settings-speech-noise")).toHaveValue("strong");
  await page.getByTestId("settings-speech-noise").selectOption("light");
  const device = await mic.locator("option").nth(1).getAttribute("value");
  await mic.selectOption(device!);
  await expect
    .poll(async () => ((await hostCall(page, "config.get")) as { value: { speech: unknown } }).value.speech)
    .toMatchObject({ noiseFilter: "light", inputDevice: device });
  await page.keyboard.press("Escape");
  const { dialog } = await talkingChat(page, jigHome);
  await dialog.getByTestId("voice-devices").click();
  const devices = page.getByTestId("audio-devices");
  await expect(devices.getByTestId("speech-input-device")).toHaveValue(device!);
  await devices.getByTestId("speech-input-device").selectOption("");
  await page.keyboard.press("Escape");
  await expect(devices).toBeHidden();
  // Escape closed only the devices dialog: talking goes on.
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => ((await hostCall(page, "config.get")) as { value: { speech: unknown } }).value.speech)
    .toMatchObject({ inputDevice: "" });
});
