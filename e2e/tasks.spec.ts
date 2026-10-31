import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Tasks: a queue Claude works through, each task reporting back, with links to the chats", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });

  // Chats → Task queue (here through the Tools search, which lists the same actions).
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("task queue");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("tasks-view");
  await expect(view).toContainText("No tasks queued");

  // One field per task, grouped in chats: chat 1 has one task, chat 2 two (the second continues it).
  await view.getByTestId("tasks-add").first().click();
  const add = page.getByTestId("tasks-add-dialog");
  await add.getByTestId("tasks-add-text-0-0").fill("fix the cart with follow-ups");
  await add.getByTestId("tasks-add-chat").click();
  await add.getByTestId("tasks-add-text-1-0").fill("fail this task please");
  await add.getByTestId("tasks-add-step-1").click();
  await add.getByTestId("tasks-add-text-1-1").fill("update the readme");
  // A task can start its own chat, and a chat can join the one before.
  await add.getByTestId("tasks-add-task-menu-1-1").click();
  await page.getByRole("menuitem", { name: "Start a new chat from here" }).click();
  await expect(add.getByTestId("tasks-add-chat-2")).toBeVisible();
  await expect(add.getByTestId("tasks-add-confirm")).toHaveText("Add 3 tasks in 3 chats");
  await add.getByTestId("tasks-add-chat-menu-2").click();
  await page.getByRole("menuitem", { name: "Continue the chat before" }).click();
  await expect(add.getByTestId("tasks-add-chat-2")).toHaveCount(0);
  await expect(add.getByTestId("tasks-add-confirm")).toHaveText("Add 3 tasks in 2 chats");
  await add.getByTestId("tasks-add-confirm").click();
  await expect(view.getByTestId("task-t3")).toContainText("update the readme");
  await expect(view.getByTestId("task-group-1").getByTestId("task-t3")).toBeVisible();
  await expect(view.getByTestId("task-group-0").getByTestId("task-t2")).toHaveCount(0);
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");

  // Start: the first is done, the second fails and pauses the queue (stop when a task fails).
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 20000 });
  await expect(view.getByTestId("task-status-t2")).toContainText("Failed", { timeout: 20000 });
  await expect(view.getByTestId("tasks-start")).toBeVisible();
  await expect(view.getByTestId("task-status-t3")).toContainText("Queued");
  await expect(view.getByTestId("task-t1")).toContainText("Did it: fix the cart");
  await expect(view.getByTestId("tasks-summary")).toContainText("1done");

  // The details: summary, things to know, a follow-up that goes into the queue.
  await view.getByTestId("task-t1").click();
  const details = page.getByTestId("task-details");
  await expect(details.getByTestId("task-summary")).toContainText("Did it: fix the cart");
  await expect(details.getByTestId("task-facts")).toContainText("Accept file edits");
  await expect(details).toContainText("A fake note to know");
  await details.getByTestId("task-followup-0").click();
  await expect(view.getByTestId("task-t4")).toContainText("Follow up on");
  await page.keyboard.press("Escape");

  // Each task links to its chat.
  await view.getByTestId("task-group-chat-0").click();
  await expect(page.getByText("Reported.").first()).toBeVisible();

  // Claude can queue tasks from a chat.
  await page.keyboard.press("Control+N");
  await page.locator("[data-testid=composer-input]:focus").fill("queue tasks for the specs in docs");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Queued two tasks.").first()).toBeVisible({ timeout: 15000 });
  const queue = JSON.stringify(
    await hostCall(page, "addons.call", { id: "tasks", method: "toolList", args: {} }),
  );
  expect(queue).toContain("Fabrikam spec");
  expect(queue).toContain("Write the spec for Contoso");
});
