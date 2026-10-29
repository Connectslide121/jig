import { expect, hostCall, test } from "./fixtures";

test("Open a Claude Code chat: its history in No project, continued as a copy, then moved to a project", async ({
  page,
}) => {
  await page.getByTestId("view-tab-jig.sessions").click();
  await page.getByTestId("open-saved-chat").click();
  const dialog = page.getByTestId("saved-chats");
  await expect(dialog.getByTestId("saved-chat-Fix the cart total")).toContainText("main");
  await expect(dialog.getByTestId("saved-chat-Plan the checkout")).toBeVisible();
  // The filter narrows by title, folder or branch.
  await dialog.getByTestId("saved-chats-filter").fill("cart");
  await expect(dialog.getByTestId("saved-chat-Plan the checkout")).toHaveCount(0);

  await dialog.getByTestId("saved-chat-open-Fix the cart total").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("No project");
  // The history: what you typed, Claude's replies and tool calls; not what Claude Code added.
  const chat = page.locator("[data-testid=transcript]:visible");
  await expect(chat).toContainText("The cart total is off by one, fix it");
  await expect(chat).toContainText("Fixed: the total no longer adds one.");
  await expect(chat).toContainText("Opened from Claude Code");
  await expect(chat).not.toContainText("Context Claude Code adds");

  // It continues as a copy (Claude Code's fork) and sits in No project.
  const metas = (await hostCall(page, "sessions.list")) as { value: Array<Record<string, unknown>> };
  const opened = metas.value.find((m) => m.importedFrom === "saved-1")!;
  expect(opened).toMatchObject({
    engineSessionId: "saved-1",
    forkPending: true,
    title: "Fix the cart total",
  });
  expect(opened.projectId).toBeUndefined();

  // Opened once: the list says it's in Jig and opens that chat.
  await page.getByTestId("open-saved-chat").click();
  await expect(dialog.getByTestId("saved-chat-open-Fix the cart total")).toContainText("In Jig");
  await dialog.getByTestId("saved-chat-open-Fix the cart total").click();
  const after = (await hostCall(page, "sessions.list")) as { value: Array<Record<string, unknown>> };
  expect(after.value.filter((m) => m.importedFrom === "saved-1")).toHaveLength(1);
});
