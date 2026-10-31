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

  // Three tasks at once, one per line.
  await view.getByTestId("tasks-add").first().click();
  const add = page.getByTestId("tasks-add-dialog");
  await add.getByRole("switch", { name: /Each line/ }).click();
  await add
    .getByTestId("tasks-add-text")
    .fill("- fix the cart with follow-ups\n- fail this task please\n- update the readme");
  await add.getByTestId("tasks-add-confirm").click();
  await expect(view.getByTestId("task-t3")).toContainText("update the readme");
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");

  // Start: the first is done, the second fails and pauses the queue (stop when a task fails).
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 20000 });
  await expect(view.getByTestId("task-status-t2")).toContainText("Failed", { timeout: 20000 });
  await expect(view.getByTestId("tasks-start")).toBeVisible();
  await expect(view.getByTestId("task-status-t3")).toContainText("Queued");
  await expect(view.getByTestId("task-t1")).toContainText("Did it: fix the cart");

  // The details: summary, things to know, a follow-up that goes into the queue.
  await view.getByTestId("task-t1").click();
  const details = page.getByTestId("task-details");
  await expect(details.getByTestId("task-summary")).toContainText("Did it: fix the cart");
  await expect(details).toContainText("A fake note to know");
  await details.getByTestId("task-followup-0").click();
  await expect(view.getByTestId("task-t4")).toContainText("Follow up on");
  await page.keyboard.press("Escape");

  // Each task links to its chat.
  await view.getByTestId("task-chat-t1").click();
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
