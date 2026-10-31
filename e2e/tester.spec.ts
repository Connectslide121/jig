import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Test something… starts a chat on the tester model, and chats get the jig-tester helper", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });

  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("test something");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("What should be tested?");
  await page.getByTestId("dialog-input").fill("Open http://localhost:5173 and add an item to the cart");
  await page.getByTestId("dialog-confirm").click();

  const transcript = page.getByTestId("transcript");
  await expect(transcript).toContainText("Test this in Claude's browser:");
  await expect(transcript).toContainText("add an item to the cart");
  // The fake engine says which model ran the chat and which subagents it had.
  await expect(transcript).toContainText("Test report (model haiku; subagents: jig-tester)", {
    timeout: 15000,
  });

  // The model is a setting.
  await hostCall(page, "config.update", { engine: { testerModel: "sonnet" } });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("test something");
  await page.keyboard.press("Enter");
  await page.getByTestId("dialog-input").fill("Check the menu");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("transcript").filter({ hasText: "Check the menu" })).toContainText(
    "Test report (model sonnet",
    { timeout: 15000 },
  );
});
