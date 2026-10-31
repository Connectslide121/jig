import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Go to (Ctrl+P) finds views, actions, chats and the project's files", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "checkout.ts"), "export const total = 1;\n");
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("Hello there");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-result")).toContainText("Done");

  // The magnifier in the top bar, or Ctrl+P.
  await page.getByTestId("goto-button").click();
  const goto = page.getByTestId("goto");
  await expect(goto).toBeVisible();
  const height = (await goto.boundingBox())!.height;
  await page.keyboard.press("Escape");
  await expect(goto).toHaveCount(0);

  // A file of the active project: opens in a preview tab.
  await page.keyboard.press("Control+P");
  await page.getByTestId("goto-input").fill("checkout");
  await expect(goto.getByTestId(`goto-file-${join(dir, "src", "checkout.ts")}`)).toBeVisible();
  // The list keeps its height whatever it finds.
  expect((await goto.boundingBox())!.height).toBe(height);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tab-jig.preview")).toContainText("checkout.ts");

  // A view: it opens where it lives.
  await page.keyboard.press("Control+P");
  await page.getByTestId("goto-input").fill("terminals");
  await expect(goto.getByTestId("goto-view-jig.terminals")).toBeVisible();
  await goto.getByTestId("goto-view-jig.terminals").click();
  await expect(page.getByTestId("region-bottom")).toBeVisible();

  // A chat, by its title.
  await page.keyboard.press("Control+P");
  await page.getByTestId("goto-input").fill("hello there");
  await expect(goto.locator('[data-testid^="goto-chat-"]')).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tab-jig.chat")).toBeVisible();

  // An action, with its shortcut.
  await page.keyboard.press("Control+P");
  await page.getByTestId("goto-input").fill("chats board");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chats-board")).toBeVisible();
});

test("the chats board shows every chat by what it needs from you", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("please run the tests");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("permission-card")).toBeVisible({ timeout: 15000 });

  // From the Chats menu (also in Go to).
  await page.getByTestId("view-tab-jig.sessions").click();
  await page.getByTestId("tools-group-Chats").click();
  await page.getByRole("menuitem", { name: "Chats board", exact: true }).click();
  const board = page.getByTestId("chats-board");
  await expect(board.getByTestId("chats-board-needs_you")).toContainText("please run the tests");
  await expect(board.getByTestId("chats-board-summary")).toContainText("1 needs you");
  // Every column is there, empty or not.
  for (const key of ["working", "unread", "error", "recent"])
    await expect(board.getByTestId(`chats-board-${key}`)).toBeVisible();

  // Answer it from the chat: it moves to Recent.
  await board.getByTestId("chats-board-needs_you").getByRole("button").first().click();
  await page.getByTestId("permission-allow").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("12 tests");
  await page.getByTestId("tab-jig.chatsBoard").click();
  await expect(board.getByTestId("chats-board-recent")).toContainText("please run the tests");
  await expect(board.getByTestId("chats-board-summary")).toContainText("Nothing needs you");
});

test("named layouts: save one, change things, switch back", async ({ page }) => {
  const left = page.getByTestId("region-left");
  await expect(left.getByTestId("view-tab-jig.sessions")).toBeVisible();
  await page.getByTestId("layout-button").click();
  await page.getByTestId("layouts-menu").click();
  await page.getByTestId("save-layout").click();
  await page.getByTestId("dialog-input").fill("Coding");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("toast")).toContainText("Coding");

  // Move Chats to the right sidebar.
  await left.getByTestId("view-tab-jig.sessions").click({ button: "right" });
  await page.getByTestId("move-view-right").click();
  await expect(page.getByTestId("region-right").getByTestId("view-tab-jig.sessions")).toBeVisible();

  await page.getByTestId("layout-button").click();
  await page.getByTestId("layouts-menu").click();
  await page.getByRole("menuitem", { name: "Coding" }).click();
  await expect(left.getByTestId("view-tab-jig.sessions")).toBeVisible();
  await expect(page.getByTestId("region-right").getByTestId("view-tab-jig.sessions")).toHaveCount(0);

  // Settings → Layout lists it.
  await page.getByTestId("layout-button").click();
  await page.getByTestId("layouts-menu").click();
  await page.getByRole("menuitem", { name: "Manage layouts…" }).click();
  await expect(page.getByTestId("saved-layout-Coding")).toBeVisible();
});

test("Chats: ten per project including pins, more by tens, and view choices in options", async ({
  page,
  jigHome,
}) => {
  const projects: Array<{ id: string; title: string; pinned: number; count: number }> = [];
  for (const [title, pinned, count] of [
    ["One", 2, 25],
    ["Two", 12, 24],
  ] as const) {
    const path = join(jigHome, title);
    await mkdir(path, { recursive: true });
    const added = (await hostCall(page, "projects.add", { path })) as { value: { id: string } };
    projects.push({ id: added.value.id, title, pinned, count });
    for (let i = 0; i < count; i++) {
      const created = (await hostCall(page, "sessions.create", {
        projectId: added.value.id,
        title: `${title} ${String(i).padStart(2, "0")}`,
      })) as { value: { id: string } };
      if (i < pinned) await hostCall(page, "sessions.setPinned", { id: created.value.id, pinned: true });
    }
  }
  await page.getByTestId("view-tab-jig.sessions").click();
  const view = page.getByTestId("sessions-view");
  const one = view.getByTestId("chat-group-One");
  await one.getByRole("button").first().click();
  await expect(one.locator('[data-testid^="session-One "]')).toHaveCount(10);
  await one.getByTestId(`chat-show-more-${projects[0]!.id}`).click();
  await expect(one.locator('[data-testid^="session-One "]')).toHaveCount(20);
  await one.getByTestId(`chat-show-more-${projects[0]!.id}`).click();
  await expect(one.locator('[data-testid^="session-One "]')).toHaveCount(25);
  await expect(one.getByTestId(`chat-show-more-${projects[0]!.id}`)).toHaveCount(0);
  const two = view.getByTestId("chat-group-Two");
  await expect(two.locator('[data-testid^="session-Two "]')).toHaveCount(12);
  await two.getByTestId(`chat-show-more-${projects[1]!.id}`).click();
  await expect(two.locator('[data-testid^="session-Two "]')).toHaveCount(22);
  await expect(page.getByTestId("open-chats-board")).toHaveCount(0);
  await expect(page.getByTestId("open-saved-chat")).toHaveCount(0);
  await expect(page.getByTestId("new-session")).toBeVisible();
  await page.getByTestId("view-menu-jig.sessions").click();
  await page.getByTestId("chat-list-view").click();
  await page.getByTestId("chat-view-status").click();
  const config = (await hostCall(page, "config.get")) as { value: { chatList: { view: string } } };
  expect(config.value.chatList.view).toBe("status");
  await page.screenshot({ path: "test-results/chats-paged.png" });
});
