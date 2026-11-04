import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

// Handing a chat over to the other provider by hand, between turns (D-339): from the composer's
// provider picker or the chat's ⋯ menu, always through the confirmation dialog. The fake engine
// stands in for both providers and reports ChatGPT as signed in.

test("hand a chat over to ChatGPT mid-chat: a dialog, a divider, and ChatGPT picks up", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(60_000);
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("Fix the cart total");
  await page.keyboard.press("Enter");
  await expect(page.getByText("You said:")).toBeVisible({ timeout: 15000 });

  // The picker hands over now; Cancel leaves everything as it was.
  const picker = page.getByTestId("provider-menu");
  await picker.click();
  await page.getByTestId("provider-codex").click();
  const dialog = page.getByTestId("handover-dialog");
  await expect(dialog).toContainText("Hand this chat over to ChatGPT");
  await expect(dialog.getByTestId("handover-route").getByTestId("provider-mark-chatgpt")).toBeVisible();
  await expect(dialog).toContainText("Carries over");
  await expect(dialog).toContainText("Doesn't carry over");
  // What a ChatGPT chat can't do, and whose plan pays.
  await expect(dialog).toContainText("no subagents, rewinding to an earlier message, forking the chat");
  await expect(dialog).toContainText("It uses your ChatGPT plan instead of Claude's");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(picker).toContainText("Claude");

  // The ⋯ menu opens the same dialog; Hand over.
  await page.getByTestId("chat").locator("header").getByRole("button", { name: "Chat options" }).click();
  await page.getByTestId("session-handover").click();
  await expect(dialog).toBeVisible();
  const before = await page.getByTestId("user-message").first().boundingBox();
  await dialog.getByTestId("handover-confirm").click();
  await expect(dialog).toHaveCount(0);

  // A divider from Claude to ChatGPT; nothing above it moved.
  const divider = page.getByTestId("handoff-divider");
  await expect(divider).toHaveAttribute("data-reason", "manual");
  await expect(divider.getByTestId("provider-mark-claude")).toBeVisible();
  await expect(divider.getByTestId("provider-mark-chatgpt")).toBeVisible();
  await expect(divider).toContainText("handed over by you");
  expect(await page.getByTestId("user-message").first().boundingBox()).toEqual(before);
  await expect(picker).toContainText("ChatGPT");
  await expect(page.getByTestId("model-menu")).toContainText("Sol");

  // Nothing was sent; your next message brings the handoff.
  await page.getByTestId("composer-input").fill("Carry on");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Picked up from the handoff: “Fix the cart total”.")).toBeVisible({
    timeout: 15000,
  });
  const { value: list } = (await hostCall(page, "sessions.list")) as {
    value: Array<{ provider?: string; providers?: Array<{ provider: string; reason: string }> }>;
  };
  expect(list[0]?.provider).toBe("codex");
  expect(list[0]?.providers?.[0]).toMatchObject({ provider: "claude", reason: "manual" });
});
