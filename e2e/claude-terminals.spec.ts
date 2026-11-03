import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("a terminal Claude started tells its chat when it ends", async ({ page, jigHome }) => {
  const path = join(jigHome, "app");
  await mkdir(path, { recursive: true });
  await hostCall(page, "projects.add", { path });
  await page.keyboard.press("Control+N");
  const chat = page.getByTestId("chat");
  await page.getByTestId("composer-input").fill("build it in a jig terminal");
  await page.keyboard.press("Enter");
  await expect(chat).toContainText("I'll hear when it ends.", { timeout: 15000 });
  // The command exits by itself: Jig sends the chat one line (not a message from you), a new turn.
  const notice = chat.getByTestId("jig-message");
  await expect(notice).toContainText('Terminal "Build" finished', { timeout: 15000 });
  await expect(notice).toContainText("Jig told Claude");
  await expect(notice).toHaveAttribute("title", /build finished/);
  await expect(chat.getByTestId("user-message")).toHaveCount(1);
});
