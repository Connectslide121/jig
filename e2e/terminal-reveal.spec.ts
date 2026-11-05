import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

// D-349: a terminal a chat starts shows itself, unless you work on another tab of its panel.
test("a chat's terminal badges the Terminals tab instead of switching while you work in its panel", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "app");
  await mkdir(dir, { recursive: true });
  const project = (await hostCall(page, "projects.add", { path: dir })) as { value: { id: string } };
  const created = (await hostCall(page, "sessions.create", { projectId: project.value.id, cwd: dir })) as {
    value: { id: string };
  };
  const chatId = created.value.id;
  const said = async () =>
    (
      JSON.stringify(await hostCall(page, "sessions.get", { id: chatId })).match(
        /I'll hear when it ends\./g,
      ) ?? []
    ).length;

  // Terminals open in the bottom panel; you switch to another of its tabs and work there.
  await page.keyboard.press("Control+`");
  const view = page.getByTestId("terminals-view");
  await expect(view).toBeVisible();
  const other = page
    .getByTestId("view-tabs-bottom")
    .locator("[data-view-id]:not([data-view-id='jig.terminals'])")
    .first();
  await other.click();
  await expect(view).toHaveCount(0);

  // The chat starts a terminal: the panel stays put, the Terminals tab gets a badge.
  await hostCall(page, "sessions.send", { id: chatId, text: "build it in a jig terminal" });
  await expect.poll(said, { timeout: 15000 }).toBe(1);
  const badge = page.getByTestId("view-badge-jig.terminals");
  await expect(badge).toHaveText("1");
  await expect(view).toHaveCount(0);
  await expect(other).toHaveClass(/bg-active/);

  // Looking at the Terminals tab clears the badge and shows the chat's terminal.
  await page.getByTestId("view-tabs-bottom").locator("[data-view-id='jig.terminals']").click();
  await expect(view).toBeVisible();
  await expect(badge).toHaveCount(0);
  await expect(page.getByTestId("terminal-tab-Claude: Build")).toHaveAttribute("aria-selected", "true");

  // You work in another panel: the next terminal switches the bottom panel to Terminals.
  await other.click();
  await expect(view).toHaveCount(0);
  await page.getByTestId("view-tabs-left").locator("[data-view-id]").first().click();
  await hostCall(page, "sessions.send", { id: chatId, text: "build it again in a jig terminal" });
  await expect.poll(said, { timeout: 15000 }).toBe(2);
  await expect(view).toBeVisible();
  await expect(badge).toHaveCount(0);
});
