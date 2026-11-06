import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { Queue } from "../addons/tasks/lib/tasks";
import { expect, hostCall, launchJig, settledBox, test } from "./fixtures";

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
  // Measured once the dialog has finished opening.
  const rowBefore = await settledBox(row);
  const fieldBefore = await settledBox(field);
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
  // Who runs each chat (D-330): the queue's choice by default; chat 2 on ChatGPT's Sol. The control
  // keeps its width, so the project picker beside it doesn't move.
  const runsOn = add.getByTestId("tasks-add-runs-on-1");
  await expect(runsOn).toContainText("Queue's choice");
  const projectBefore = await add.getByTestId("tasks-add-project-1").boundingBox();
  await runsOn.click();
  await page.getByTestId("tasks-runs-on-chatgpt").hover();
  await page.getByTestId("tasks-model-sol").click();
  await expect(runsOn).toContainText("ChatGPT · Sol (latest)");
  expect(await add.getByTestId("tasks-add-project-1").boundingBox()).toEqual(projectBefore);
  await add.getByTestId("tasks-add-confirm").click();
  await expect(view.getByTestId("task-t3")).toContainText("update the readme");
  await expect(view.getByTestId("task-group-1").getByTestId("task-t3")).toBeVisible();
  await expect(view.getByTestId("task-group-0").getByTestId("task-t2")).toHaveCount(0);
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");
  // Every row shows who runs it, in one column: the queue's default for t1, chat 2's ChatGPT for t2
  // and for t3, which continues t2's chat.
  await expect(view.getByTestId("task-provider-t1").getByTestId("provider-mark-claude")).toBeVisible();
  await expect(view.getByTestId("task-provider-t2").getByTestId("provider-mark-chatgpt")).toBeVisible();
  await expect(view.getByTestId("task-provider-t3").getByTestId("provider-mark-chatgpt")).toBeVisible();
  const markX = async (id: string) => (await view.getByTestId(`task-provider-${id}`).boundingBox())!.x;
  expect(await markX("t1")).toBe(await markX("t3"));
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

test("Tasks: a chat reports its ended task again after a follow-up, and the row changes (D-353)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["do this only partly", "update the readme"], newChat: true },
  });
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Partly done", { timeout: 45000 });
  await expect(view.getByTestId("task-status-t2")).toContainText("Done", { timeout: 45000 });
  const before = (await view.getByTestId("task-status-t2").boundingBox())!;
  const list = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "list",
    args: { projectId: ids.shop },
  })) as { value: { tasks: Array<{ id: string; sessionId: string }> } };
  const chat = list.value.tasks.find((t) => t.id === "t1")!.sessionId;

  // You follow up in t1's chat; it reports again: Done, with a quiet mark, and the queue stays put.
  await hostCall(page, "sessions.send", { id: chat, text: "report the task as done" });
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 20000 });
  await expect(view.getByTestId("task-status-t1")).not.toContainText("Partly");
  await expect(view.getByTestId("task-revised-t1")).toBeVisible();
  await expect(view.getByTestId("task-revised-t2")).toHaveCount(0);
  expect(await view.getByTestId("task-status-t2").boundingBox()).toEqual(before);
  await expect(view.getByTestId("tasks-start")).toBeVisible();
  await view.getByTestId("task-t1").click();
  await expect(page.getByTestId("task-revised")).toContainText("was Partly done");
  await expect(page.getByTestId("task-summary")).toContainText("Reported again: done");
  await page.keyboard.press("Escape");

  // Another chat's task can't be reported from here.
  await view.getByTestId("task-group-chat-0").click();
  await expect(page.getByText("Reported again.").first()).toBeVisible();
  await hostCall(page, "sessions.send", { id: chat, text: "report task t2 as failed" });
  await expect(page.getByText(/didn't run in this chat/).first()).toBeVisible({ timeout: 20000 });
  const after = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "list",
    args: { projectId: ids.shop },
  })) as { value: { tasks: Array<{ id: string; status: string }> } };
  expect(after.value.tasks.find((t) => t.id === "t2")!.status).toBe("done");
});

test("Tasks: a stop line ends a run, the next Start runs the next block, and a task goes back (D-398)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: ids.shop,
      prompts: ["update the readme", "fail this task please", "tidy the styles"],
      newChat: true,
    },
  });
  // No ticks any more: a stop line from the task's menu ends the block after it.
  await expect(view.getByTestId("task-tick-t1")).toHaveCount(0);
  await expect(view.getByTestId("tasks-tick-all")).toHaveCount(0);
  await expect(view.getByTestId("tasks-start")).toHaveAttribute("title", /Starts the queued tasks/);
  const rowBefore = await view.getByTestId("task-t1").boundingBox();
  await view.getByTestId("task-t1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Stop after this task" }).click();
  const line = view.getByTestId("tasks-stop-t1");
  await expect(line).toContainText("Stop here");
  // The line sits between the chats; the rows above it stay where they were.
  expect(await view.getByTestId("task-t1").boundingBox()).toEqual(rowBefore);
  const above = (await view.getByTestId("task-group-0").boundingBox())!;
  const lineBox = (await line.boundingBox())!;
  const below = (await view.getByTestId("task-group-1").boundingBox())!;
  expect(lineBox.y).toBeGreaterThan(above.y + above.height);
  expect(lineBox.y + lineBox.height).toBeLessThan(below.y);
  await expect(view.getByTestId("tasks-count-toRun")).toContainText("1");
  await expect(view.getByTestId("tasks-count-later")).toContainText("2");
  await expect(view.getByTestId("tasks-start")).toHaveAttribute("title", /Runs 1 task, then stops/);

  // Start runs the block above the line; the line is used up and the queue pauses with the rest queued.
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 45000 });
  await expect(line).toHaveCount(0);
  await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
  await expect(view.getByTestId("tasks-start")).toBeVisible();
  await expect(view.getByTestId("tasks-count-later")).toContainText("0");

  // A finished task goes back in its place, as if it never ran.
  await view.getByTestId("task-t1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Put back in the queue" }).click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");

  // The next Start: the first of these fails and pauses the queue, its run still open. Start over:
  // every task back to queued, and that run leaves the history (the finished first run stays).
  await view.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to top" }).click();
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Failed", { timeout: 45000 });
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");
  await view.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Start over…" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
  await expect(view.getByTestId("task-status-t1")).toContainText("Queued");
  const runs = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "history",
    args: { projectId: ids.shop },
  })) as { value: unknown[] };
  expect(runs.value).toHaveLength(1);
});

test("Tasks: park ideas below the queue, where no run includes them, and unpark one (D-369)", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  // The header's progress line shows only with tasks in the queue (D-352).
  await expect(view.getByTestId("tasks-progress-line")).toHaveCount(0);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: ids.shop,
      prompts: ["update the readme", "an idea", "tidy the styles"],
      newChat: true,
    },
  });
  await expect(view.getByTestId("tasks-progress-line")).toBeVisible();
  const pool = view.getByTestId("tasks-pool");
  await expect(pool.getByTestId("tasks-pool-empty")).toBeVisible();
  await expect(view.getByTestId("tasks-count-parked")).toContainText("0");

  // Park from the task's menu: it goes into the pool, faded.
  await view.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Park/ }).click();
  await expect(pool.getByTestId("task-status-t2")).toContainText("Parked");
  await expect(view.getByTestId("tasks-count-parked")).toContainText("1");
  await expect(view.getByTestId("tasks-count-toRun")).toContainText("2");

  // A stop line after the last queued task doesn't take the parked idea into the run either.
  await view.getByTestId("task-t3").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Stop after this task" }).click();
  await expect(view.getByTestId("tasks-stop-t3")).toBeVisible();
  await expect(view.getByTestId("task-status-t2")).toContainText("Parked");

  // A new idea goes straight into the pool; tasks added later still land above it.
  await pool.getByTestId("tasks-add-idea").click();
  await page.getByTestId("tasks-idea-text").fill("rename the cart");
  await page.getByTestId("tasks-idea-save").click();
  await expect(pool.getByTestId("task-t4")).toContainText("rename the cart");
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["write the changelog"], newChat: true },
  });
  await expect(view.getByTestId("task-t5")).toBeVisible();
  await expect(pool.getByTestId("task-t5")).toHaveCount(0);
  await expect(view.getByTestId("tasks-count-parked")).toContainText("2");

  // Unpark: back as the last queued task, after the stop line, before the pool.
  await pool.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Unpark/ }).click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
  await expect(pool.getByTestId("task-t2")).toHaveCount(0);
  const list = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "list",
    args: { projectId: ids.shop },
  })) as { value: { tasks: Array<{ id: string }> } };
  expect(list.value.tasks.map((t) => t.id)).toEqual(["t1", "t3", "t5", "t2", "t4"]);
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
  await expect(view.getByTestId("tasks-count-done")).toContainText("1/3");
  await expect(view.getByTestId("tasks-count-notDone")).toContainText("1");

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
  // What its tasks ran on, from the tasks themselves: both on Claude.
  await expect(view.getByTestId("tasks-run-provider-0")).toHaveAttribute("title", "Ran on Claude · 2 tasks");
  await expect(view.getByTestId("tasks-run-provider-0").getByTestId("provider-mark-claude")).toBeVisible();
  await view.getByTestId("tasks-run-0").click();
  const run = view.getByTestId("tasks-run");
  await expect(run).toContainText("still going");
  await expect(view.getByTestId("tasks-run-provider")).toHaveAttribute("title", "Ran on Claude · 2 tasks");
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

  /** The rows' order on screen, which follows the saved order a moment later. */
  const shown = () =>
    view
      .locator("[data-drop-task]")
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.dropTask));
  /** Drags one element onto another, `y` px below its top or (negative) above its bottom, by mouse. */
  const drag = async (from: string, to: string, at: number) => {
    const saved = (await order()).toLowerCase().split(" ");
    await expect.poll(shown).toEqual(saved);
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

test("Tasks: Claude deletes a queued task after you approve the card that names it", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  await openTasks(page);
  // One chat, t1 with t2 continuing it, then t3 on its own.
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
  await page.keyboard.press("Control+N");
  await page.locator("[data-testid=composer-input]:focus").fill("delete the queued task t1");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("tasks-delete");
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.getByTestId("tasks-delete-title")).toHaveText("Delete a queued task from shop's queue");
  await expect(card.getByTestId("tasks-delete-t1")).toContainText("write the spec");
  await card.getByTestId("tasks-delete-allow").click();
  await expect(page.getByText("Deleted the queued task.").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("tasks-delete-done")).toContainText("deleted");
  // The next task of its chat now starts that chat, as Remove in the Queue tab does.
  const queue = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "list",
    args: { projectId: ids.shop },
  })) as { value: { tasks: Array<{ id: string; newChat: boolean }> } };
  expect(queue.value.tasks.map((t) => [t.id, t.newChat])).toEqual([
    ["t2", true],
    ["t3", true],
  ]);
});

test("Tasks: a task you set to Don't ask runs its chat without asking (D-363)", async ({ page, jigHome }) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["tidy up"], newChat: true },
  });
  // Edit → Permissions ends with Don't ask, in red; the select keeps its size.
  await view.getByTestId("task-t1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit…" }).click();
  const edit = page.getByTestId("tasks-edit-dialog");
  const select = edit.locator("#tasks-edit-mode");
  await expect(select.locator("option").last()).toHaveText("Don't ask");
  const before = await settledBox(select);
  const color = () => select.evaluate((el) => getComputedStyle(el).color);
  const plain = await color();
  await select.selectOption("bypassPermissions");
  await expect(select).toHaveAttribute("data-tone", "danger");
  expect(await color()).not.toBe(plain);
  expect(await select.boundingBox()).toEqual(before);
  await edit.getByTestId("tasks-edit-confirm").click();
  await expect(edit).toHaveCount(0);
  await expect(view.getByTestId("task-t1")).toContainText("don't ask");
  // Its chat starts in Don't ask.
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 30000 });
  const chats = (await hostCall(page, "sessions.list")) as {
    value: Array<{ title: string; permissionMode: string }>;
  };
  expect(chats.value.find((c) => c.title === "tidy up")?.permissionMode).toBe("bypassPermissions");
});

test("Tasks: the wheel scrolls the queue while a task is dragged, and the drop follows", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  const prompts = Array.from({ length: 14 }, (_, i) => `step ${i + 1}`);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts, newChat: true },
  });
  await expect(view.getByTestId("task-t14")).toBeAttached();
  const order = async () => {
    const q = (await hostCall(page, "addons.call", {
      id: "tasks",
      method: "list",
      args: { projectId: ids.shop },
    })) as { value: { tasks: Array<{ id: string }> } };
    return q.value.tasks.map((t) => t.id).join(" ");
  };

  // Pick up the first task and aim at the third one's top half (the second's is where it is now).
  const a = (await view.getByTestId("task-t1").boundingBox())!;
  const b = (await view.getByTestId("task-t3").boundingBox())!;
  await page.mouse.move(a.x + 200, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 200, b.y + 8, { steps: 6 });
  await expect(view.getByTestId("tasks-drop-line")).toHaveCount(1);
  await expect(page.getByTestId("drag-ghost")).toContainText("step 1");

  // The wheel scrolls the list mid-drag; without moving, the line follows to what's under the pointer.
  await page.mouse.wheel(0, 4000);
  await expect(view.getByTestId("task-t14")).toBeInViewport();
  await expect
    .poll(async () => Math.abs((await view.getByTestId("tasks-drop-line").boundingBox())!.y - (b.y + 8)))
    .toBeLessThan(120);

  // Dropped on the top half of the last chat's row: the task lands just before that chat.
  const last = (await view.getByTestId("task-t14").boundingBox())!;
  await page.mouse.move(a.x + 200, last.y + 8, { steps: 4 });
  await page.mouse.up();
  await expect.poll(order).toBe(
    `${prompts
      .map((_, i) => `t${i + 1}`)
      .slice(1, 13)
      .join(" ")} t1 t14`,
  );
  await expect(page.getByTestId("drag-ghost")).toHaveCount(0);
});

test("Tasks: a turn without a report is asked once for it, and a chat reports late when asked", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: ids.shop,
      prompts: ["skip the report while the server starts", "skip two reports for the screenshot"],
      newChat: true,
    },
  });
  await view.getByTestId("tasks-start").click();
  // The first ends its turn without a report: the queue asks once, and the chat reports.
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 30000 });
  // The second ignores that request too: No report, and the row keeps its place and size.
  await expect(view.getByTestId("task-status-t2")).toContainText("No report", { timeout: 30000 });
  const row = await view.getByTestId("task-t2").boundingBox();
  await view.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Ask for a report" }).click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Done", { timeout: 30000 });
  await expect(view.getByTestId("task-t2")).toContainText("reported late");
  expect(await view.getByTestId("task-t2").boundingBox()).toEqual(row);
  await view.getByTestId("task-t2").click();
  await expect(page.getByTestId("task-details")).toContainText("Reported late");
  await expect(page.getByTestId("task-ask-report")).toHaveCount(0);
  // The chat shows the requests as the task queue's, not as yours.
  await page.getByTestId("task-open-chat").click();
  await expect(page.getByTestId("jig-message").first()).toContainText(
    "Task queue: asked for the report of task 2",
  );
  await expect(page.getByTestId("jig-message")).toHaveCount(2);
});

test("Tasks: a task that ended without a report is marked done by hand, with a note (D-356)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["skip two reports for the screenshot"], newChat: true },
  });
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("No report", { timeout: 30000 });
  const row = await view.getByTestId("task-t1").boundingBox();
  // Its menu offers it; a dialog takes an optional note.
  await view.getByTestId("task-t1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark as done…" }).click();
  const dialog = page.getByTestId("tasks-mark-done");
  await dialog.getByTestId("tasks-mark-done-note").fill("Committed on main");
  await dialog.getByTestId("tasks-mark-done-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(view.getByTestId("task-status-t1")).toContainText("Done");
  await expect(view.getByTestId("task-marked-done-t1")).toBeVisible();
  await expect(view.getByTestId("task-t1")).toContainText("Committed on main");
  expect(await view.getByTestId("task-t1").boundingBox()).toEqual(row);
  // The details say it was you; the menu no longer offers it.
  await view.getByTestId("task-t1").click();
  await expect(page.getByTestId("task-marked-done")).toContainText("Marked done by you");
  await expect(page.getByTestId("task-details-mark-done")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await view.getByTestId("task-t1").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Mark as done…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // History counts it as done.
  await view.getByRole("tab", { name: "History" }).click();
  await expect(view.getByTestId("tasks-run-0")).toContainText("Finished");
});

test("Tasks: a Partly done task is marked done by hand and keeps its chat's report (D-391)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["do the cart only partly, with follow-ups"], newChat: true },
  });
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Partly done", { timeout: 30000 });
  const row = await view.getByTestId("task-t1").boundingBox();
  // From the details' footer this time; the dialog shows what its chat said.
  await view.getByTestId("task-t1").click();
  await page.getByTestId("task-details-mark-done").click();
  const dialog = page.getByTestId("tasks-mark-done");
  await expect(dialog).toContainText("Did it: do the cart only partly");
  await dialog.getByTestId("tasks-mark-done-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("task-details")).toHaveCount(0);
  await expect(view.getByTestId("task-status-t1")).toContainText("Done");
  await expect(view.getByTestId("task-marked-done-t1")).toBeVisible();
  expect(await view.getByTestId("task-t1").boundingBox()).toEqual(row);
  // The details: your mark, then its chat's report under it, its follow-up still queueable.
  await view.getByTestId("task-t1").click();
  const details = page.getByTestId("task-details");
  await expect(page.getByTestId("task-marked-done")).toContainText("was Partly done");
  await expect(page.getByTestId("task-summary")).toContainText("Marked as done by you.");
  await expect(page.getByTestId("task-chat-report")).toContainText("Did it: do the cart only partly");
  await expect(page.getByTestId("task-chat-report")).toContainText("A fake note to know");
  await expect(details.getByTestId("task-followup-0")).toBeVisible();
  await expect(page.getByTestId("task-details-mark-done")).toHaveCount(0);
  await details.screenshot({ path: test.info().outputPath("marked-partial-details.png") });
});

test("Tasks: a queue that runs on ChatGPT, and a task that runs on Claude in it (D-330)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  // The header's Runs on: the project's default until you pick one; its slot keeps its size.
  const runsOn = view.getByTestId("tasks-runs-on");
  await expect(runsOn).toContainText("Default");
  const pickerBefore = await view.getByTestId("tasks-project").boundingBox();
  await runsOn.click();
  await page.getByTestId("tasks-runs-on-chatgpt").click();
  await expect(runsOn).toContainText("ChatGPT");
  expect(await view.getByTestId("tasks-project").boundingBox()).toEqual(pickerBefore);

  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: ids.shop,
      prompts: [
        { prompt: "update the readme", newChat: true },
        { prompt: "then the changelog", newChat: false },
        { prompt: "check the cart", newChat: true, provider: "claude", model: "sonnet" },
      ],
      newChat: true,
    },
  });
  await expect(view.getByTestId("task-provider-t1").getByTestId("provider-mark-chatgpt")).toBeVisible();
  await expect(view.getByTestId("task-provider-t3").getByTestId("provider-mark-claude")).toBeVisible();

  // Editing a task that continues a chat shows that chat's provider, greyed out with the reason.
  await view.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit…" }).click();
  const edit = page.getByTestId("tasks-edit-dialog");
  await expect(edit.getByTestId("tasks-edit-runs-on")).toHaveAttribute("aria-disabled", "true");
  await expect(edit.getByTestId("tasks-edit-runs-on")).toContainText("ChatGPT");
  await expect(edit.getByTestId("tasks-edit-runs-on-hint")).toContainText("Same as the chat it continues");
  await edit.getByRole("button", { name: "Cancel" }).click();

  // The details pane names the provider and model.
  await view.getByTestId("task-t3").click();
  await expect(page.getByTestId("task-runs-on")).toContainText("Claude · Sonnet (latest)");
  await page.getByTestId("task-details").getByRole("button", { name: "Close" }).last().click();

  // The ChatGPT chat runs and reports through Jig's MCP server, like Codex.
  await view.getByTestId("task-t2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Stop after this task" }).click();
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Done", { timeout: 45000 });
  await expect(view.getByTestId("task-status-t1")).toContainText("Done");
  await view.getByTestId("task-group-chat-0").click();
  await expect(page.getByText("Reported from ChatGPT.").first()).toBeVisible();

  // History says what the run's tasks ran on (t3 was after the stop line, so ChatGPT only).
  const tasks = await openTasks(page);
  await tasks.getByRole("tab", { name: "History" }).click();
  await expect(tasks.getByTestId("tasks-run-provider-0")).toHaveAttribute(
    "title",
    "Ran on ChatGPT · 2 tasks",
  );
});

test("Tasks: a task for ChatGPT while it isn't signed in is blocked and pauses the queue", async () => {
  const home = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  const app = await launchJig(home, { JIG_FAKE_CHATGPT_USAGE: "signedout" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const ids = await twoProjects(page, home);
    const view = await openTasks(page);
    // ChatGPT can't be picked until you sign in on Get Started.
    await view.getByTestId("tasks-runs-on").click();
    await expect(page.getByTestId("tasks-runs-on-chatgpt")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("tasks-runs-on-get-started")).toBeVisible();
    await page.keyboard.press("Escape");
    // Claude asked for it anyway: the task ends blocked, and the queue stops.
    await hostCall(page, "addons.call", {
      id: "tasks",
      method: "add",
      args: {
        projectId: ids.shop,
        prompts: [{ prompt: "update the readme", newChat: true, provider: "chatgpt" }, "check the cart"],
        newChat: true,
      },
    });
    await view.getByTestId("tasks-start").click();
    await expect(view.getByTestId("task-status-t1")).toContainText("Blocked", { timeout: 20000 });
    await expect(view.getByTestId("task-status-t2")).toContainText("Queued");
    await expect(view.getByTestId("tasks-start")).toBeVisible();
    await view.getByTestId("task-t1").click();
    await expect(page.getByTestId("task-details")).toContainText("ChatGPT isn't signed in");
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("Tasks: a task Jig closed in the middle of carries on after the restart and reports (D-394)", async ({
  app,
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const ids = await twoProjects(page, jigHome);
  const tasks = (p: Page, method: string, args: unknown) =>
    hostCall(p, "addons.call", { id: "tasks", method, args });
  const task = async (p: Page) =>
    ((await tasks(p, "list", { projectId: ids.shop })) as { value: Queue }).value.tasks[0]!;
  await tasks(page, "add", { projectId: ids.shop, prompts: ["hold until released"], newChat: true });
  await tasks(page, "start", { projectId: ids.shop });
  await expect.poll(async () => (await task(page)).sawBusy, { timeout: 20000 }).toBe(true);
  // Jig closes while the chat works on it (an update's restart).
  await app.close();
  const again = await launchJig(jigHome);
  const page2 = await again.firstWindow();
  await page2.waitForSelector("[data-testid=app-root] [data-testid=main-area]");
  // The queue tells the chat once to carry on (not only to report), and it finishes the task.
  await expect
    .poll(async () => (await task(page2)).status, { timeout: 30000, intervals: [500] })
    .toBe("done");
  const done = await task(page2);
  expect(done.resumedAt).toBeTruthy();
  expect(done.nudgedAt).toBeUndefined();
  expect(done.report?.summary).toContain("Jig restarted while you were working on task 1");
  const view = await openTasks(page2);
  await view.getByTestId("task-t1").click();
  await page2.getByTestId("task-open-chat").click();
  await expect(page2.getByTestId("jig-message")).toHaveCount(1);
  await expect(page2.getByTestId("jig-message")).toContainText(
    "Task queue: Jig restarted, carry on with task 1",
  );
  await again.close();
});

test("Tasks: a task held by the fake engine stays Running until the test releases it", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["hold until released"], newChat: true },
  });
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Running", { timeout: 20000 });
  // Held: it doesn't finish on its own.
  await page.waitForTimeout(1000);
  await expect(view.getByTestId("task-status-t1")).toContainText("Running");
  expect(await hostCall(page, "fake.release", {})).toEqual({ ok: true, value: 1 });
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 20000 });
});

test("Tasks: tasks drag across a stop line and the line drags to another place (D-398)", async ({
  page,
  jigHome,
}) => {
  const ids = await twoProjects(page, jigHome);
  const view = await openTasks(page);
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId: ids.shop, prompts: ["one", "two", "three", "four"], newChat: true },
  });
  /** The queue as a picture: ids in order, upper case where a task starts a chat, | for a stop line. */
  const order = async () => {
    const q = (await hostCall(page, "addons.call", {
      id: "tasks",
      method: "list",
      args: { projectId: ids.shop },
    })) as { value: { tasks: Array<{ id: string; newChat: boolean; stopAfter?: boolean }> } };
    return q.value.tasks
      .map((t) => `${t.newChat ? t.id.toUpperCase() : t.id}${t.stopAfter ? "|" : ""}`)
      .join(" ");
  };
  await expect(view.getByTestId("task-t4")).toBeVisible();
  // The hover affordance in the gap below a chat adds a line; the rows above it don't move.
  const before = await view.getByTestId("task-t1").boundingBox();
  await view.getByTestId("tasks-stop-add-t2").click({ force: true });
  await expect.poll(order).toBe("T1 T2| T3 T4");
  await expect(view.getByTestId("tasks-stop-t2")).toBeVisible();
  expect(await view.getByTestId("task-t1").boundingBox()).toEqual(before);

  const shown = () =>
    view
      .locator("[data-drop-task]")
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.dropTask));
  const drag = async (from: string, to: string, at: number) => {
    const saved = (await order()).replace(/\|/g, "").toLowerCase().split(" ");
    await expect.poll(shown).toEqual(saved);
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

  // Below the line (its lower half): the line stays where it was.
  await drag("task-t4", "tasks-stop-t2", -4);
  await expect.poll(order).toBe("T1 T2| T4 T3");
  // Above the line (its upper half): the line stays after the dropped task.
  await drag("task-t3", "tasks-stop-t2", 4);
  await expect.poll(order).toBe("T1 T2 T3| T4");
  // The line itself drags to the gap after another chat.
  await drag("tasks-stop-t3", "task-t1", -6);
  await expect.poll(order).toBe("T1| T2 T3 T4");
  // Its ✕ takes it away.
  await view.getByTestId("tasks-stop-t1").hover();
  await view.getByTestId("tasks-stop-remove-t1").click();
  await expect(view.getByTestId("tasks-stop-t1")).toHaveCount(0);
  await expect.poll(order).toBe("T1 T2 T3 T4");
});
