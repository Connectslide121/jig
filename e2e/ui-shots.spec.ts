/**
 * Screenshots of a UI state for a design check, the example to copy (docs/guides/testing.md → "Put the
 * UI in a state and screenshot it"). Skipped unless JIG_UI_SHOTS=1:
 *   npm run build && JIG_UI_SHOTS=1 npx playwright test e2e/ui-shots.spec.ts
 * The pictures land in .tmp/shots/ (<name>-sidebar.png, -bottom.png, -tab.png).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";

test.skip(!process.env.JIG_UI_SHOTS, "set JIG_UI_SHOTS=1 to take the design-check screenshots");

test("Tasks queue with every kind of row and a parked pool, at all three widths", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(120_000);
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string }> };
  };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });

  // The state: done, failed, running (held by the fake engine), up next, left out and two parked ideas.
  const tasks = (method: string, args: Record<string, unknown> = {}) =>
    hostCall(page, "addons.call", { id: "tasks", method, args: { projectId, ...args } });
  await tasks("add", {
    prompts: [
      "update the readme",
      "fail this task please",
      "hold until released while the checkout is rebuilt",
      "write the changelog",
      "tidy the styles",
    ],
    newChat: true,
  });
  await tasks("add", {
    prompts: ["try a dark theme for the shop", "a search that forgives typos"],
    newChat: true,
    parked: true,
  });
  await tasks("setStopOnFailure", { on: false });
  await tasks("select", { ids: ["t5"], on: false });
  await tasks("start");
  const status = async () =>
    ((await tasks("list")) as { value: { tasks: Array<{ id: string; status: string }> } }).value.tasks.map(
      (t) => `${t.id}:${t.status}`,
    );
  await expect.poll(status, { timeout: 30_000 }).toContain("t3:running");
  expect(await status()).toEqual(expect.arrayContaining(["t1:done", "t2:failed", "t4:queued"]));

  const shots = await shootView(page, "addon.tasks.tasks", "tasks-queue", {
    ready: (panel) => expect(panel.getByTestId("task-status-t3")).toContainText("Running"),
  });
  console.log(shots.join("\n"));
  // The parked pool at the end of the queue, in the tab (the last placement), scrolled into view.
  await page.getByTestId("tasks-pool").scrollIntoViewIfNeeded();
  const pool = join(SHOTS_DIR, "tasks-queue-pool-tab.png");
  await page.screenshot({ path: pool });
  console.log(pool);

  // Let the held turn finish, so the app closes without a turn in progress.
  expect(await hostCall(page, "fake.release", { match: "hold until released" })).toEqual({
    ok: true,
    value: 1,
  });
});
