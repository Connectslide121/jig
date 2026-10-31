import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("Tasks: a queue Claude works through, each task reporting back, with links to the chats", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });

  // Chats → Task queue (here through the Tools search, which lists the same actions).
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("tasks-view");
  await expect(view).toContainText("No tasks queued");

  // One field per task, grouped in chats: chat 1 has one task, chat 2 two (the second continues it).
  await view.getByTestId("tasks-add").first().click();
  const add = page.getByTestId("tasks-add-dialog");
  await add.getByTestId("tasks-add-text-0-0").fill("fix the cart with follow-ups");
  // A task takes files like the chat: a pasted screenshot and a dropped document.
  const field = add.getByTestId("tasks-add-text-0-0");
  const row = add.getByTestId("tasks-add-row-0-0");
  const rowBefore = await row.boundingBox();
  const fieldBefore = await field.boundingBox();
  await field.evaluate((el, b64) => {
    const data = new DataTransfer();
    data.items.add(
      new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "cart.png", { type: "image/png" }),
    );
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, TINY_PNG);
  await field.evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["# Cart\nTotals are off."], "cart-notes.md", { type: "text/markdown" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(add.getByTestId("chat-attachment")).toHaveCount(2);
  expect(await row.boundingBox()).toEqual(rowBefore);
  expect(await field.boundingBox()).toEqual(fieldBefore);
  expect(rowBefore!.height).toBeLessThanOrEqual(36);
  await expect(add.getByTitle("Open cart-notes.md", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: "test-results/tasks-add-compact.png" });
  await expect(field).toHaveValue("fix the cart with follow-ups");
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
  await expect(view.getByTestId("task-files-t1")).toHaveText("2");
  await expect(view.getByTestId("task-files-t2")).toHaveCount(0);

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
  // Its files stay with it after it ran, and open from here (and from the table's Files column).
  await expect(details.getByTestId("task-files").getByTestId("chat-attachment")).toHaveCount(2);
  await details.getByTestId("task-followup-0").click();
  await expect(view.getByTestId("task-t4")).toContainText("Follow up on");
  await page.keyboard.press("Escape");

  await view.getByTestId("task-files-t1").click();
  await page.getByRole("menuitem", { name: "cart.png" }).click();
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("1 × 1 px");
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");

  // Each task links to its chat.
  await view.getByTestId("task-group-chat-0").click();
  await expect(page.getByText("Reported.").first()).toBeVisible();
  // The files went with the prompt.
  await expect(page.getByTestId("user-message").first().getByTestId("chat-attachment")).toHaveCount(2);

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
