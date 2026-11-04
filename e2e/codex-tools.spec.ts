import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

// Codex chats reach Jig's tools over the chat's local MCP server (D-313). The fake engine's
// "call <tool> over mcp" goes the same way: real HTTP on 127.0.0.1 with the chat's token.
test("a Codex chat calls Jig's tools over its local MCP server, asking only before changes", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await hostCall(page, "config.update", { engine: { provider: "codex" } });
  await page.keyboard.press("Control+N");

  // A read-only tool runs without a permission card.
  await page.getByTestId("composer-input").fill("call jig_get_settings over mcp");
  await page.keyboard.press("Enter");
  await expect(page.getByText("I called jig_get_settings over Jig's MCP server.")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("tool-card").first()).toContainText("jig_get_settings");
  await expect(page.getByTestId("permission-card")).toHaveCount(0);

  // A tool that changes something asks first, under the same name as in Claude chats.
  await page.getByTestId("composer-input").fill('call jig_update_settings over mcp with {"patch":{}}');
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("permission-card")).toContainText("jig_update_settings", { timeout: 15000 });
  await page.getByTestId("permission-allow").click();
  await expect(page.getByText("I called jig_update_settings over Jig's MCP server.")).toBeVisible({
    timeout: 15000,
  });
});

// Plan only in a Codex chat (D-315): Codex presents the plan with Jig's exit_plan tool over MCP, which
// raises the same plan card as Claude's ExitPlanMode; approving switches the mode first.
test("a Codex chat in Plan only presents its plan on the plan card", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await hostCall(page, "config.update", { engine: { provider: "codex", defaultPermissionMode: "plan" } });
  await page.keyboard.press("Control+N");
  await expect(page.getByTestId("permission-menu")).toContainText("Plan");

  await page.getByTestId("composer-input").fill("make a plan for discounts");
  await page.keyboard.press("Enter");
  const plan = page.getByTestId("plan-card");
  await expect(plan).toContainText("Apply it in total()", { timeout: 15000 });
  await plan.getByTestId("plan-approve-auto").click();
  await expect(page.getByText("Starting on the plan (mode: acceptEdits)")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("permission-menu")).toContainText("Accept edits");
});

// Questions in a Codex chat (D-315): Jig's ask_user tool over MCP raises the same question card as
// Claude's AskUserQuestion, and Codex gets the answer back.
test("a Codex chat asks with the question card", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await hostCall(page, "config.update", { engine: { provider: "codex" } });
  await page.keyboard.press("Control+N");

  await page.getByTestId("composer-input").fill("ask me a question");
  await page.keyboard.press("Enter");
  await page.getByTestId("option-Neutral").click({ timeout: 15000 });
  await page.getByTestId("question-submit").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("Neutral it is", {
    timeout: 15000,
  });
});
