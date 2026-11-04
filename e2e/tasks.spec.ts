import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Two projects, "shop" active; returns their ids by name. */
async function twoProjects(page: Page, jigHome: string) {
  for (const name of ["blog", "shop"]) {
    await mkdir(join(jigHome, name), { recursive: true });
    await hostCall(page, "projects.add", { path: join(jigHome, name) });
  }
  const state = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string; name: string }> };
  };
  const ids = Object.fromEntries(state.value.projects.map((p) => [p.name, p.id]));
  await hostCall(page, "projects.setActive", { id: ids.shop });
  return ids as { shop: string; blog: string };
}

async function openTasks(page: Page) {
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");
  return page.getByTestId("tasks-view");
}

test("Tasks: a queue Claude works through, each task reporting back, with links to the chats", async ({
  page,
  jigHome,
}) => {
  await twoProjects(page, jigHome);

  // Chats → Task queue (here through the Tools search, which lists the same actions).
  const view = await openTasks(page);
  await expect(view).toContainText("No tasks queued");

  // One field per task, grouped in chats: chat 1 has one task, chat 2 two (the second continues it).
  await view.getByTestId("tasks-add").first().click();
  const add = page.getByTestId("tasks-add-dialog");
  expect((await add.boundingBox())!.width).toBeGreaterThan(800);
  const permissions = add.locator("#tasks-mode");
  expect((await permissions.boundingBox())!.y).toBeGreaterThan(
    (await add.getByTestId("tasks-add-chats").boundingBox())!.y,
  );
  const hint = add.getByTestId("tasks-add-hint");
  expect(await hint.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
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
  // A 3-row prompt; files sit in a fixed box beside it, one per line, never scrolled sideways.
  expect(rowBefore!.height).toBeLessThanOrEqual(80);
  expect(fieldBefore!.height).toBe(rowBefore!.height);
  expect(fieldBefore!.height).toBeGreaterThanOrEqual(60);
  const files = add.getByTestId("tasks-add-files-0-0");
  expect(
    await files.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight),
  ).toBe(true);
  await expect(add.getByTitle("Open cart-notes.md", { exact: true })).toHaveCount(1);
  // More files than fit: the last line is "+N more", a menu with the rest; the row keeps its size.
  await field.evaluate((el) => {
    const data = new DataTransfer();
    for (const name of ["totals.md", "taxes.md"])
      data.items.add(new File(["notes"], name, { type: "text/markdown" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(add.getByTestId("tasks-add-more-files")).toHaveText("2 more");
  await expect(add.getByTestId("chat-attachment")).toHaveCount(2);
  expect(await row.boundingBox()).toEqual(rowBefore);
  await add.getByTestId("tasks-add-more-files").click();
  await page.getByRole("menuitem", { name: "taxes.md" }).hover();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(add.getByTestId("tasks-add-more-files")).toHaveCount(0);
  await expect(add.getByTestId("chat-attachment")).toHaveCount(3);
  await add.getByRole("button", { name: "Remove totals.md" }).click();
  await expect(add.getByTestId("chat-attachment")).toHaveCount(2);
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

  // Start: the first is done; its files open from the table's Files column.
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 20000 });
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
});

test("Tasks: leave tasks out, put a task back and start the queue over", async ({ page, jigHome }) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["fail this task please", "update the readme"], newChat: true },
  });
  // Every queued task is ticked; unticking one makes Start pass it by, and it stays queued.
  await expect(view.getByTestId("task-tick-t1")).toBeChecked();
  const rowBefore = await view.getByTestId("task-t1").boundingBox();
  await view.getByTestId("task-tick-t1").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Left out");
  expect(await view.getByTestId("task-t1").boundingBox()).toEqual(rowBefore);
  await expect(view.getByTestId("tasks-tick-all")).not.toBeChecked();
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Done", { timeout: 45000 });
  await expect(view.getByTestId("task-status-t1")).toContainText("Left out");
  await expect(view.getByTestId("tasks-start")).toBeDisabled();

  // A finished task goes back in its place, as if it never ran; ticking all includes both.
  await view.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Put back in the queue" }).click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
  await expect(view.getByTestId("task-tick-t2")).toBeChecked();
  await view.getByTestId("tasks-tick-all").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");

  // The first fails and pauses the queue, its run still open. Start over: every task back to queued,
  // and that run leaves the history (the finished first one stays).
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Failed", { timeout: 45000 });
  await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
  await view.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Start over…" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");
  await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
  const runs = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "history",
    args: { projectId: ids.shop },
  })) as { value: unknown[] };
  expect(runs.value).toHaveLength(1);
});

test("Tasks: every run is kept in the history, with its results", async ({ page, jigHome }) => {
  // Two tasks run one after the other: under the full parallel suite that can take a while.
  test.setTimeout(120_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: ids.shop,
      prompts: ["fix the cart with follow-ups", "fail this task please", "update the readme"],
      newChat: true,
      permissionMode: "acceptEdits",
    },
  });
  // Start: the first is done, the second fails and pauses the queue (stop when a task fails).
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 45000 });
  await expect(view.getByTestId("task-status-t2")).toContainText("Failed", { timeout: 45000 });
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

  // The queue paused on the failure: the run is still open, with the two tasks it ran.
  await view.getByRole("tab", { name: "History" }).click();
  await expect(view.getByTestId("tasks-run-0")).toContainText("2 tasks");
  await view.getByTestId("tasks-run-0").click();
  const run = view.getByTestId("tasks-run");
  await expect(run).toContainText("still going");
  await expect(view.getByTestId("task-status-t1")).toContainText("Done");
  await expect(view.getByTestId("task-status-t2")).toContainText("Failed");
  await expect(view.getByTestId("task-t3")).toHaveCount(0);
  await expect(view.getByTestId("task-t4")).toHaveCount(0);
  await view.getByTestId("tasks-run-back").click();
  await expect(view.getByTestId("tasks-run-0")).toBeVisible();

  // Clearing finished tasks from the queue keeps them in the history.
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "clearFinished",
    args: { projectId: ids.shop },
  });
  await view.getByTestId("tasks-run-0").click();
  await expect(view.getByTestId("tasks-run")).toBeVisible();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done");
});

test("Tasks: Claude's queued tasks are reviewed first, and each project has its own queue", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);

  // Claude can queue tasks from a chat: you review them first, as a list you can change.
  await page.keyboard.press("Control+N");
  await page.locator("[data-testid=composer-input]:focus").fill("queue tasks for the specs in docs");
  await page.keyboard.press("Enter");
  const review = page.getByTestId("tasks-review");
  await expect(review).toBeVisible({ timeout: 15000 });
  await expect(review.getByTestId("tasks-review-prompt-0")).toHaveValue("Write the spec for Contoso");
  await review.getByTestId("tasks-review-title-0").fill("Contoso spec");
  await review.getByTestId("tasks-review-prompt-1").fill("Write the spec for Fabrikam, short");
  await expect(review.getByTestId("tasks-review-allow")).toHaveText("Queue 2 tasks");
  await review.getByTestId("tasks-review-allow").click();
  await expect(page.getByText("Queued the tasks.").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("tasks-review-done")).toContainText("queued");
  const queue = JSON.stringify(
    await hostCall(page, "addons.call", { id: "tasks", method: "list", args: { projectId: ids.shop } }),
  );
  expect(queue).toContain("Contoso spec");
  expect(queue).toContain("Write the spec for Fabrikam, short");

  // Each project has its own queue: the view's project menu switches between them.
  await page.getByRole("tab", { name: "Task queue" }).click();
  await view.getByTestId("tasks-project").click();
  await page.getByTestId("tasks-project-blog").click();
  await expect(view.getByTestId("tasks-project")).toContainText("blog");
  await expect(view).toContainText("No tasks queued");
  await view.getByTestId("tasks-project").click();
  await expect(page.getByTestId("tasks-project-shop")).toContainText("queued");
  await page.getByTestId("tasks-project-shop").click();
  await expect(view).toContainText("Contoso spec");

  // The view's picker only overrides what it shows: changing the global project takes over again.
  await view.getByTestId("tasks-project").click();
  await page.getByTestId("tasks-project-blog").click();
  await expect(view.getByTestId("tasks-project")).toContainText("blog");
  await hostCall(page, "projects.setActive", { id: ids.blog });
  await hostCall(page, "projects.setActive", { id: ids.shop });
  await expect(view.getByTestId("tasks-project")).toContainText("shop");
  await expect(view).toContainText("Contoso spec");
});

test("Tasks: drag queued tasks and chats into a new order, or move them with Alt+arrows", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  // Two chats: t1 with t2 continuing it, then t3 on its own.
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: ids.shop,
      prompts: [
        { prompt: "write the spec" },
        { prompt: "add its tests", newChat: false },
        { prompt: "tidy up" },
      ],
      newChat: true,
    },
  });
  /** The queue as a picture: ids in order, upper case where a task starts its own chat. */
  const order = async () => {
    const q = (await hostCall(page, "addons.call", {
      id: "tasks",
      method: "list",
      args: { projectId: ids.shop },
    })) as { value: { tasks: Array<{ id: string; newChat: boolean }> } };
    return q.value.tasks.map((t) => (t.newChat ? t.id.toUpperCase() : t.id)).join(" ");
  };
  await expect(view.getByTestId("task-t3")).toBeVisible();
  expect(await order()).toBe("T1 t2 T3");

  /** Drags one element onto another, `y` px below its top or (negative) above its bottom, by mouse. */
  const drag = async (from: string, to: string, at: number) => {
    const a = (await view.getByTestId(from).boundingBox())!;
    const b = (await view.getByTestId(to).boundingBox())!;
    const y = at < 0 ? b.height + at : at;
    await page.mouse.move(a.x + 200, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 200, a.y + 4, { steps: 3 });
    await page.mouse.move(b.x + 200, b.y + y, { steps: 8 });
    await page.mouse.move(b.x + 200, b.y + y + 1, { steps: 2 });
    await page.mouse.up();
  };

  // A chat's header drags the whole chat; below the last card is the end of the queue.
  const list = (await view.getByTestId("tasks-list").boundingBox())!;
  await drag("task-group-header-0", "tasks-list", list.height + 30);
  await expect.poll(order).toBe("T3 T1 t2");
  await expect(view.getByTestId("tasks-drop-line")).toHaveCount(0);

  // A task dropped on the top half of a continuing row joins that chat.
  await drag("task-t3", "task-t2", 8);
  await expect.poll(order).toBe("T1 t3 t2");

  // A chat's first task that moves away hands the chat to its next task.
  await drag("task-t1", "task-t2", -6);
  await expect.poll(order).toBe("T3 t2 t1");

  // Alt+↑/↓ on a focused row walks the same places, and the row keeps the focus.
  await view.getByTestId("task-t1").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(order).toBe("T3 t1 t2");
  await expect(view.getByTestId("task-t1")).toBeFocused();

  // The ⋯ menu: Move to top makes it a chat of its own at the top.
  await view.getByTestId("task-t1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to top" }).click();
  await expect.poll(order).toBe("T1 T3 t2");
});
