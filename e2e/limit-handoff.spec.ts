import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

// A chat that hits its plan's limit carries on with the other provider in the same chat (D-338). The
// fake engine stands in for both; "hit the limit" makes the chat's provider report its limit.

async function shopProject(page: Page, jigHome: string): Promise<string> {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  const state = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  return state.value.projects[0]!.id;
}

test("the limit card: continue with ChatGPT, a divider, and ChatGPT picks up the handoff", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(60_000);
  await shopProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("Fix the cart total, then hit the limit");
  await page.keyboard.press("Enter");

  const card = page.getByTestId("limit-card");
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText("Claude's limit is reached");
  await expect(card.getByTestId("limit-resets")).toContainText("Resets");
  await expect(card.getByTestId("limit-wait")).toContainText("Wait and resume at");
  // The turn's "Failed" line would only repeat the card.
  await expect(page.getByTestId("turn-result")).toHaveCount(0);
  // ChatGPT's meter has room: the primary action is there (once the meter has been read).
  const go = card.getByTestId("limit-continue");
  await expect(go).toContainText("Continue with ChatGPT", { timeout: 15000 });
  const box = await card.boundingBox();
  await go.click();

  // The card stays put and says what happened; a divider, then ChatGPT carries on.
  await expect(card).toHaveAttribute("data-status", "continued");
  await expect(card.getByTestId("limit-outcome")).toContainText("Continued with ChatGPT");
  expect((await card.boundingBox())?.height).toBe(box?.height);
  const divider = page.getByTestId("handoff-divider");
  await expect(divider).toContainText("Continued with");
  await expect(divider.getByTestId("provider-mark-chatgpt")).toBeVisible();
  await expect(divider).toContainText("Claude's limit reached");
  await expect(page.getByTestId("jig-message").last()).toContainText("Continued with ChatGPT");
  await expect(
    page.getByText("Picked up from the handoff: “Fix the cart total, then hit the limit”."),
  ).toBeVisible({
    timeout: 15000,
  });
  // The chat's header and composer say who runs it now.
  await expect(page.getByTestId("chat").locator("header").getByTestId("provider-mark-chatgpt")).toBeVisible();
  const { value: list } = (await hostCall(page, "sessions.list")) as {
    value: Array<{ provider?: string; providers?: Array<{ provider: string; reason: string }> }>;
  };
  expect(list[0]?.provider).toBe("codex");
  expect(list[0]?.providers?.[0]).toMatchObject({ provider: "claude", reason: "limit" });
});

test("the limit card: wait for the reset, then don't wait", async ({ page, jigHome }) => {
  await shopProject(page, jigHome);
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("hit the limit");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("limit-card");
  await expect(card).toBeVisible({ timeout: 15000 });
  const box = await card.boundingBox();
  await card.getByTestId("limit-wait").click();
  await expect(card).toHaveAttribute("data-status", "waiting");
  await expect(card.getByTestId("limit-waiting")).toContainText("Resumes by itself at");
  expect((await card.boundingBox())?.height).toBe(box?.height);
  await card.getByTestId("limit-cancel").click();
  await expect(card).toHaveAttribute("data-status", "open");
  await card.getByTestId("limit-dismiss").click();
  await expect(card.getByTestId("limit-outcome")).toContainText("Dismissed");
});

test("Tasks: with 'continue with the other provider', a task that hits Claude's limit finishes on ChatGPT", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const projectId = await shopProject(page, jigHome);
  await hostCall(page, "config.update", { engine: { onLimit: "switch" } });
  // The usage meter must know ChatGPT has room before the limit comes.
  await expect
    .poll(
      async () =>
        ((await hostCall(page, "usage.get")) as { value: { chatgpt: { state: string } } }).value.chatgpt
          .state,
      {
        timeout: 15000,
      },
    )
    .toBe("ok");
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("tasks-view");
  await hostCall(page, "addons.call", {
    id: "tasks",
    method: "add",
    args: { projectId, prompts: ["update the readme and hit the limit"], newChat: true },
  });
  await view.getByTestId("tasks-start").click();
  await expect(view.getByTestId("task-status-t1")).toContainText("Done", { timeout: 60000 });
  await expect(view.getByTestId("task-provider-t1").getByTestId("provider-mark-chatgpt")).toBeVisible();
  await view.getByTestId("task-t1").click();
  await expect(page.getByTestId("task-runs-on")).toContainText("ChatGPT");
  await expect(page.getByTestId("task-runs-on")).toContainText("started on Claude");
  await page.getByTestId("task-open-chat").click();
  await expect(page.getByTestId("handoff-divider")).toBeVisible();
  await expect(page.getByText("Reported from ChatGPT.").first()).toBeVisible();
});
