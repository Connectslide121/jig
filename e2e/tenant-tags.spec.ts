import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, settledBox, test } from "./fixtures";

/** An `az` that signs in to Northwind in a folder named `northwind…`, else your own (Contoso). */
const FAKE_AZ = `
const args = process.argv.slice(2);
const dir = require("node:path").basename(process.env.AZURE_CONFIG_DIR || "");
const who = dir.startsWith("northwind")
  ? { id: "22222222-2222-4222-8222-222222222222", name: "Northwind", domain: "northwind.example.com", user: "ann@northwind.example.com" }
  : { id: "11111111-1111-4111-8111-111111111111", name: "Contoso", domain: "contoso.example.com", user: "ann@contoso.example.com" };
if (args[0] === "login") process.exit(0);
else if (args[0] === "account")
  console.log(JSON.stringify({ tenantId: who.id, tenantDisplayName: who.name, user: { name: who.user, type: "user" } }));
else if (args[0] === "rest")
  console.log(JSON.stringify({ value: [{ tenantId: who.id, displayName: who.name, defaultDomain: who.domain }] }));
else { console.error("ERROR: Please run 'az login' to setup account."); process.exit(1); }
`;

test("Tenants: a chat and a terminal keep the tenant they started with and say so without moving", async ({
  page,
  jigHome,
}) => {
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), FAKE_AZ);
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${FAKE_AZ}`);
  await hostCall(page, "azure.addTenant", { tenant: "northwind.example.com" });
  await hostCall(page, "azure.setActiveTenant", { key: "default" });

  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat-status")).toHaveText("Idle", { timeout: 15000 });
  await hostCall(page, "terminals.create", { cwd: dir });
  await page.keyboard.press("Control+`");
  await expect(page.getByTestId("terminals-view")).toBeVisible();

  // Under the active tenant nothing is shown.
  await expect(page.getByTestId("tenant-tag")).toHaveCount(0);
  const status = await settledBox(page.getByTestId("chat-status"));
  const meter = await settledBox(page.getByTestId("context-meter"));

  // Switching: both keep "Your az login" and name it, in space they already had.
  await hostCall(page, "azure.setActiveTenant", { key: "northwind" });
  const chatTag = page.getByTestId("chat").getByTestId("tenant-tag");
  await expect(chatTag).toContainText("Your az login");
  await expect(page.getByTestId("terminals-view").getByTestId("tenant-tag").first()).toBeVisible();
  expect(await settledBox(page.getByTestId("chat-status"))).toEqual(status);
  expect(await settledBox(page.getByTestId("context-meter"))).toEqual(meter);
  if (process.env.JIG_SCREENSHOT_DIR)
    await page.screenshot({ path: join(process.env.JIG_SCREENSHOT_DIR, "tenant-tags.png") });

  // Back on its tenant, the label goes away again.
  await hostCall(page, "azure.setActiveTenant", { key: "default" });
  await expect(page.getByTestId("tenant-tag")).toHaveCount(0);
});
