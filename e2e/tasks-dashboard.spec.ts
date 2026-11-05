import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Tasks: the all-queues dashboard shows every project's queue, needing you first", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  for (const name of ["shop", "contoso", "fabrikam"]) {
    await mkdir(join(jigHome, name), { recursive: true });
    await hostCall(page, "projects.add", { path: join(jigHome, name) });
  }
  const state = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string; name: string }> };
  };
  const ids = Object.fromEntries(state.value.projects.map((p) => [p.name, p.id])) as Record<string, string>;
  await hostCall(page, "projects.setActive", { id: ids.shop });

  // Opened from the Tasks view's header; with no queue anywhere, one message and Add tasks.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");
  await page.getByTestId("tasks-all-queues").click();
  await expect(page.getByTestId("tab-addon.tasks.dashboard")).toHaveCount(1);
  await expect(page.getByText("No task queues yet")).toBeVisible();
  await page.getByTestId("tasks-dashboard-add").click();
  await expect(page.getByTestId("tasks-add-dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // Shop runs its queue to the end; Contoso has tasks queued but isn't started.
  const tasks = (method: string, args: unknown) =>
    hostCall(page, "addons.call", { id: "tasks", method, args });
  await tasks("add", { projectId: ids.shop, prompts: ["update the readme"], newChat: true });
  await tasks("add", {
    projectId: ids.contoso,
    prompts: ["write the specs", "check the api"],
    newChat: true,
  });
  await tasks("start", { projectId: ids.shop });
  const dashboard = page.getByTestId("tasks-dashboard");
  await expect(dashboard.getByTestId("tasks-dashboard-state-shop")).toHaveText("Finished", {
    timeout: 45000,
  });
  await expect(dashboard.getByTestId("tasks-dashboard-counts-shop")).toContainText(
    "All 1 done · 1 task in 1 chat",
  );
  await expect(dashboard.getByTestId("tasks-dashboard-last-shop")).toContainText("update the readme");
  await expect(dashboard.getByTestId("tasks-dashboard-last-shop")).toContainText("Done");
  await expect(dashboard.getByTestId("tasks-dashboard-state-contoso")).toHaveText("Paused");
  await expect(dashboard.getByTestId("tasks-dashboard-summary")).toContainText("2");
  // Paused with tasks queued comes before finished; a project without tasks gets no card.
  const cards = dashboard.locator("[data-testid^=tasks-dashboard-card-]");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-testid", "tasks-dashboard-card-contoso");
  await expect(dashboard.getByTestId("tasks-dashboard-empty-count")).toHaveText("1 project has no queue");

  // The card's ⋯ menu; a click on the card opens the Tasks view on that project's queue.
  await cards.first().hover();
  await cards.first().getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: "Open current chat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await cards.first().click();
  const view = page.getByTestId("tasks-view");
  await expect(view.getByTestId("tasks-project")).toContainText("contoso");
  await expect(view.getByTestId("task-t2")).toContainText("check the api");

  // The project picker's first item opens the same tab again: still one.
  await view.getByTestId("tasks-project").click();
  await page.getByTestId("tasks-project-all").click();
  await expect(page.getByTestId("tab-addon.tasks.dashboard")).toHaveCount(1);
  await expect(dashboard).toBeVisible();
});

test("Tasks: Claude lists another project's queue, or every queue compactly", async ({ page, jigHome }) => {
  for (const name of ["shop", "contoso"]) {
    await mkdir(join(jigHome, name), { recursive: true });
    await hostCall(page, "projects.add", { path: join(jigHome, name) });
  }
  const state = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string; name: string }> };
  };
  const ids = Object.fromEntries(state.value.projects.map((p) => [p.name, p.id])) as Record<string, string>;
  const call = (method: string, args: unknown) =>
    hostCall(page, "addons.call", { id: "tasks", method, args });
  await call("add", { projectId: ids.contoso, prompts: ["write the specs"], newChat: true });
  const chat = { sessionId: "s-none", projectId: ids.shop };
  const other = (await call("toolList", { chat, project: "contoso" })) as { value: string };
  expect(other.value).toContain("contoso: The task queue is paused.");
  expect(other.value).toContain("1. [Queued] write the specs (id t1, on Claude, the project's)");
  const all = (await call("toolList", { chat, all: true })) as { value: string };
  expect(all.value).toBe(
    `contoso (project id ${ids.contoso}): 1 task, paused. New chats run on the project's default.\n- t1 [Queued] write the specs`,
  );
});
