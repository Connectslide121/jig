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
  await expect
    .poll(async () => ((await hostCall(page, "config.get")) as { value: { speech: unknown } }).value.speech)
    .toMatchObject({ model: "small", language: "sv" });
  const models = (await hostCall(page, "speech.models")) as { value: Array<{ downloaded: boolean }> };
  expect(models.value.map((m) => m.downloaded)).toEqual([false, false, false]);
  expect(await hostCall(page, "speech.removeModel", { model: "../../etc" })).toMatchObject({ ok: false });
});

test("speech: talk with Claude, agree on a plan by voice and it starts working", async ({
  page,
  jigHome,
}) => {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  await page.keyboard.press("Control+N");
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  const voice = tab.getByTestId("composer-voice");
  const metas = async () =>
    ((await hostCall(page, "sessions.list")) as { value: Array<{ voice?: boolean; permissionMode: string }> })
      .value[0];

  await voice.click();
  await expect(voice).toHaveAttribute("data-phase", "listening");
  await expect.poll(metas).toMatchObject({ voice: true, permissionMode: "plan" });

  // The fake engine hears what the test says (no microphone in tests).
  const say = (text: string) =>
    page.evaluate((detail) => window.dispatchEvent(new CustomEvent("jig-fake-speech", { detail })), text);
  await say("Let's make a plan for discounts");
  await expect(tab.getByTestId("plan-card")).toBeVisible();
  await expect(voice).toHaveAttribute("data-said", /Shall I start\?/);

  await say("Yes, go ahead.");
  await expect(tab.getByTestId("assistant-message").last()).toContainText(
    "Starting on the plan (mode: acceptEdits)",
  );
  await expect(voice).toHaveAttribute("data-said", /Starting on the plan/);
  await expect(tab.getByTestId("composer-input")).toHaveValue("");

  await say("Bye!");
  await expect(voice).toHaveAttribute("data-phase", "off");
  await expect.poll(async () => (await metas())?.voice).toBeFalsy();
});
