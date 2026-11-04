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
