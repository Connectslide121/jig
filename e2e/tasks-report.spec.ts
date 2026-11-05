import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Tasks: a finished run's report, made on demand, kept with the run, its follow-ups queued (D-355)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const state = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string; name: string }> };
  };
  const shop = state.value.projects.find((p) => p.name === "shop")!.id;
  await hostCall(page, "projects.setActive", { id: shop });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("tasks-view");
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: {
      projectId: shop,
      prompts: ["fix the cart with follow-ups", "update the readme with follow-ups"],
      newChat: true,
    },
  });
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t2")).toContainText("Done", { timeout: 45000 });

  // From History: the row's report action makes it (the run has finished) and opens it in a tab.
  await view.getByRole("tab", { name: "History" }).click();
  // The run closes once the queue has finished (slower under load).
  await expect(view.getByTestId("tasks-run-0")).toContainText("Finished", { timeout: 30000 });
  await view.getByTestId("tasks-run-0").hover();
  await view.getByTestId("tasks-run-report-0").click();
  const report = page.getByTestId("run-report");
  await expect(report.getByTestId("run-report-summary")).toContainText("The run did 2 tasks", {
    timeout: 20000,
  });
  await expect(report.getByTestId("run-report-disclosure")).toContainText("AI-generated report");
  await expect(report.getByTestId("run-report-made")).toBeVisible();
  await expect(report.getByTestId("run-report-task-t1")).toContainText("Changed what t1 asked for.");
  await expect(report.getByTestId("run-report-aware")).toContainText("Decided alone");
  await expect(report.getByTestId("run-report-needs-you")).toContainText("Push the commits on main.");
  await expect(report.getByTestId("run-report-stuck")).toHaveCount(0);

  // The two follow-ups became one proposal; its sources open in a modal.
  await report.getByTestId("run-report-proposal-p1").click();
  const dialog = page.getByTestId("run-report-proposal");
  await expect(dialog.getByTestId("run-report-sources")).toContainText("Follow up on: fix the cart");
  await expect(dialog.getByTestId("run-report-sources")).toContainText("Follow up on: update the readme");
  await page.keyboard.press("Escape");

  // Queued: a task in the queue, and the proposal marked.
  await report.getByTestId("run-report-queue-p1").click();
  await expect(report.getByTestId("run-report-proposal-p1")).toContainText("Queued");
  const queue = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "list",
    args: { projectId: shop },
  })) as { value: { tasks: Array<{ prompt: string }> } };
  expect(queue.value.tasks.map((t) => t.prompt)).toContain(
    "Do the run's follow-ups together, and check the tests pass.",
  );

  // Kept with the run.
  const saved = (await hostCall(page, "addons.call", {
    id: "tasks",
    method: "reports",
    args: { projectId: shop },
  })) as { value: Record<string, string> };
  expect(Object.keys(saved.value)).toHaveLength(1);
});
