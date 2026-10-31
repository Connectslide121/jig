import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Home: start a chat from the box; New chat in the top bar; tab dots; Ctrl+K", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "notes.txt"), "one\ntwo\n");
  await hostCall(page, "projects.add", { path: dir });

  // With a project and no tab open, the main area is the project's Home.
  const home = page.getByTestId("home");
  await expect(home).toBeVisible();
  await page.getByTestId("home-input").fill("edit notes.txt");
  await page.keyboard.press("Enter");
  const chat = page.locator("[data-tab-id]:not(.hidden)").getByTestId("chat");
  await expect(chat.getByTestId("turn-result")).toHaveCount(1, { timeout: 15000 });

  // The turn's changes, with Undo (restores the file after confirming).
  const changes = chat.getByTestId("turn-changes");
  await expect(changes).toContainText("Changed 1 file");
  await changes.getByTestId("turn-undo").click();
  await page.getByTestId("dialog-confirm").click();
  await expect.poll(() => readFile(join(dir, "notes.txt"), "utf8")).toBe("one\ntwo\n");

  // Your message: Edit is one click on hover.
  await chat.getByTestId("user-message").hover();
  await expect(chat.getByTestId("user-message-edit")).toBeVisible();

  // A new chat from the top bar, with starter prompts.
  await page.getByTestId("topbar-new-chat").click();
  const fresh = page.locator("[data-tab-id]:not(.hidden)");
  await expect(fresh.getByTestId("chat-welcome")).toBeVisible();
  await fresh.getByRole("button", { name: "Explain how this project is organised" }).click();
  await expect(fresh.getByTestId("composer-input")).toHaveValue("Explain how this project is organised");

  // A working chat shows a dot on its tab while you look at another one.
  await fresh.getByTestId("composer-input").fill("slow answer");
  await page.keyboard.press("Enter");
  await page.getByRole("tab").first().click();
  await expect(page.getByRole("tab").nth(1).getByTestId("tab-status")).toHaveAttribute(
    "data-status",
    "working",
  );

  // Ctrl+K opens the shared search.
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("goto-input")).toBeVisible();
});
