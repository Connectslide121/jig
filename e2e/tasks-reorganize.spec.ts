import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

type Queue = { value: { tasks: Array<{ id: string; newChat: boolean }> } };

test("Tasks: Reorganize proposes an order in a modal, applies it as one change and undoes it (D-397)", async ({
  page,
  jigHome,
}) => {
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
  const call = (method: string, args: Record<string, unknown>) =>
    hostCall(page, "addons.call", { id: "tasks", method, args: { projectId: shop, ...args } });
  const order = async () =>
    ((await call("list", {})) as Queue).value.tasks.map((t) => `${t.id}${t.newChat ? "" : "+"}`).join(" ");

  // One task alone: nothing to reorganize.
  await call("add", { prompts: ["first"], newChat: true });
  await expect(view.getByTestId("tasks-reorganize")).toBeDisabled();
  await call("add", { prompts: ["second", "third"], newChat: true });
  await expect(view.getByTestId("tasks-reorganize")).toBeEnabled();
  expect(await order()).toBe("t1 t2 t3");

  await view.getByTestId("tasks-reorganize").click();
  const dialog = page.getByTestId("tasks-reorganize-dialog");
  await expect(dialog.getByTestId("tasks-reorganize-ai")).toContainText("AI-suggested order");
  await expect(dialog.getByTestId("tasks-reorganize-row")).toHaveCount(3, { timeout: 20000 });
  await expect(dialog.getByTestId("tasks-reorganize-row").first()).toContainText("third");
  await expect(dialog.getByTestId("tasks-reorganize-row").first()).toContainText("was 3");
  await expect(dialog.getByTestId("tasks-reorganize-row").nth(1)).toContainText("Joins chat");

  // Cancel changes nothing.
  await dialog.getByTestId("tasks-reorganize-cancel").click();
  expect(await order()).toBe("t1 t2 t3");

  await view.getByTestId("tasks-reorganize").click();
  await expect(dialog.getByTestId("tasks-reorganize-row")).toHaveCount(3, { timeout: 20000 });
  await dialog.getByTestId("tasks-reorganize-apply").click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(order).toBe("t3 t2+ t1");

  // One Undo puts the order and the chats back.
  await page.getByTestId("toast").last().getByText("Undo reorganize").click();
  await expect.poll(order).toBe("t1 t2 t3");
});
