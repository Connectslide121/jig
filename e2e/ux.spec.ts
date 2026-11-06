import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Home: New chat opens a chat; New chat in the top bar; tab dots; Ctrl+K", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "notes.txt"), "one\ntwo\n");
  await hostCall(page, "projects.add", { path: dir });

  // With a project and no tab open, the main area is the project's Home.
  const home = page.getByTestId("home");
  await expect(home).toBeVisible();
  await expect(home.getByTestId("home-input")).toHaveCount(0);
  await home.getByTestId("home-new-chat").click();
  const chat = page.locator("[data-tab-id]:not(.hidden)").getByTestId("chat");
  await chat.getByTestId("composer-input").fill("edit notes.txt");
  await page.keyboard.press("Enter");
  await expect(chat.getByTestId("turn-result")).toHaveCount(1, { timeout: 15000 });

  // Whole-chat changes, with Undo (restores the files after confirming).
  const changes = chat.getByTestId("chat-changes");
  await expect(changes).toContainText("1 file changed");
  await changes.getByTestId("chat-changes-undo").click();
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

  // A working chat shows its mark on its tab and in the Chats list while you look at another one;
  // once done, both say it finished and you haven't seen it (D-416).
  await fresh.getByTestId("composer-input").fill("answer, hold until released");
  await page.keyboard.press("Enter");
  await page.getByRole("tab").first().click();
  const tabMark = page.getByRole("tab").nth(1).getByTestId("status-mark");
  await expect(tabMark).toHaveAttribute("data-status", "working");
  await expect
    .poll(async () => ((await hostCall(page, "fake.release", {})) as { value: number }).value)
    .toBeGreaterThan(0);
  await expect(tabMark).toHaveAttribute("data-status", "unread", { timeout: 15000 });

  // Ctrl+K opens the shared search.
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("goto-input")).toBeVisible();
});
