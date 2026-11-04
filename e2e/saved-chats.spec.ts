import { expect, hostCall, test } from "./fixtures";

test("Open a saved chat: a Claude Code chat's history in No project, continued as a copy, then moved to a project", async ({
  page,
}) => {
  await page.getByTestId("view-tab-jig.sessions").click();
  await page.getByTestId("tools-group-Chats").click();
  await page.getByRole("menuitem", { name: "Open a saved chat…", exact: true }).click();
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
  await page.getByTestId("tools-group-Chats").click();
  await page.getByRole("menuitem", { name: "Open a saved chat…", exact: true }).click();
  await expect(dialog.getByTestId("saved-chat-open-Fix the cart total")).toContainText("In Jig");
  await dialog.getByTestId("saved-chat-open-Fix the cart total").click();
  const after = (await hostCall(page, "sessions.list")) as { value: Array<Record<string, unknown>> };
  expect(after.value.filter((m) => m.importedFrom === "saved-1")).toHaveLength(1);
});

// Codex's saved threads are in the same list (D-315), marked ChatGPT, and open as a Codex chat with
// their commands and file changes on the usual cards; Jig's plan-mode text is left out.
test("Open a saved chat: a Codex thread opens as a ChatGPT chat", async ({ page }) => {
  await page.getByTestId("view-tab-jig.sessions").click();
  await page.getByTestId("tools-group-Chats").click();
  await page.getByRole("menuitem", { name: "Open a saved chat…", exact: true }).click();
  const dialog = page.getByTestId("saved-chats");
  const row = dialog.getByTestId("saved-chat-Tidy the README");
  await expect(row.getByTestId("provider-mark-chatgpt")).toBeVisible();
  await expect(
    dialog.getByTestId("saved-chat-Fix the cart total").getByTestId("provider-mark-claude"),
  ).toBeVisible();
  await dialog.getByTestId("saved-chats-filter").fill("chatgpt");
  await expect(dialog.getByTestId("saved-chat-Fix the cart total")).toHaveCount(0);

  await dialog.getByTestId("saved-chat-open-Tidy the README").click();
  await expect(dialog).toHaveCount(0);
  const chat = page.locator("[data-testid=transcript]:visible");
  await expect(chat).toContainText("Tidy the README");
  await expect(chat).toContainText("I tidied the README's title.");
  await expect(chat).toContainText("Opened from Codex");
  await expect(chat).not.toContainText("Plan mode is on");
  await expect(chat.getByTestId("tool-card").first()).toContainText("cat README.md");

  const metas = (await hostCall(page, "sessions.list")) as { value: Array<Record<string, unknown>> };
  expect(metas.value.find((m) => m.importedFrom === "codex-thread-1")).toMatchObject({
    provider: "codex",
    forkPending: true,
  });
});
