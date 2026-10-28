import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

async function chat(page: import("@playwright/test").Page, jigHome: string) {
  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  return page.getByTestId("composer-input");
}

test("Claude Code's next-message suggestion shows above the composer; Tab or a click uses it", async ({
  page,
  jigHome,
}) => {
  const input = await chat(page, jigHome);
  await input.fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat-status")).toHaveText("Idle", { timeout: 15000 });
  // Like Claude Code, no suggestion after the first turn.
  await expect(page.getByTestId("suggestion")).toHaveCount(0);

  await input.fill("add a test for the cart");
  await page.keyboard.press("Enter");
  const suggestion = page.getByTestId("suggestion");
  await expect(suggestion).toContainText("Commit these changes", { timeout: 15000 });
  await expect(input).toHaveAttribute("placeholder", /Commit these changes/);
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(input).toHaveValue("Commit these changes");

  // Sending clears it; the next one arrives after the turn.
  await page.keyboard.press("Enter");
  await expect(suggestion).toHaveCount(0);
  await expect(suggestion).toContainText("Now write tests for this", { timeout: 15000 });
  await suggestion.getByTestId("suggestion-send").click();
  await expect(page.getByTestId("chat")).toContainText("Now write tests for this");
});
