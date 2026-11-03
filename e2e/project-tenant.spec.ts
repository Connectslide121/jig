import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

/** An `az` that signs in to Northwind in a folder named `northwind…`, else to Contoso (D-282). */
const FAKE_AZ = `
const args = process.argv.slice(2);
const dir = require("node:path").basename(process.env.AZURE_CONFIG_DIR || "");
const who = dir.startsWith("northwind")
  ? { id: "22222222-2222-4222-8222-222222222222", name: "Northwind", domain: "northwind.example.com", user: "ann@northwind.example.com" }
  : { id: "11111111-1111-4111-8111-111111111111", name: "Contoso", domain: "contoso.example.com", user: "ann@contoso.example.com" };
if (args[0] === "login") process.exit(0);
else if (args[0] === "account") console.log(JSON.stringify({ tenantId: who.id, tenantDisplayName: who.name, user: { name: who.user, type: "user" } }));
else if (args[0] === "rest") console.log(JSON.stringify({ value: [{ tenantId: who.id, displayName: who.name, defaultDomain: who.domain }] }));
else { console.error("ERROR: Please run 'az login' to setup account."); process.exit(1); }
`;

type Tenants = { value: { active: string } };
const activeTenant = async (page: Parameters<typeof hostCall>[0]) =>
  ((await hostCall(page, "azure.tenants")) as Tenants).value.active;

test("Tenants: a project's pinned tenant becomes active with the project; a removed one is Default", async ({
  page,
  jigHome,
}) => {
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), FAKE_AZ);
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${FAKE_AZ}`);
  await hostCall(page, "azure.addTenant", { tenant: "northwind.example.com" });
  await hostCall(page, "azure.setActiveTenant", { key: "default" });

  for (const name of ["shop", "web"]) await mkdir(join(jigHome, name), { recursive: true });
  const web = (await hostCall(page, "projects.create", { name: "Web", path: join(jigHome, "web") })) as {
    value: { id: string };
  };
  // Pinning the tenant of the active project switches to it, like the top bar.
  await hostCall(page, "projects.create", {
    name: "Shop",
    path: join(jigHome, "shop"),
    azureTenant: "northwind",
  });
  const chip = page.getByTestId("tenant-switcher");
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Northwind");

  // A project on Default keeps the tenant in use; the top bar switch still works.
  await hostCall(page, "projects.setActive", { id: web.value.id });
  await expect.poll(() => activeTenant(page)).toBe("northwind");
  await chip.click();
  await page.getByTestId("tenant-item-default").click();
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Your az login");

  // The project dialog picks the tenant; saving it on the active project switches.
  await page.getByTestId("home-project-settings").first().click();
  const dialog = page.getByTestId("project-dialog");
  await dialog.getByTestId("project-tenant").selectOption("northwind");
  await dialog.getByTestId("project-save").click();
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Northwind");

  // Removing the tenant: the project falls back to Default and its dialog says so.
  await hostCall(page, "azure.removeTenant", { key: "northwind" });
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Your az login");
  await page.getByTestId("home-project-settings").first().click();
  await expect(dialog.getByTestId("project-tenant")).toHaveValue("");
  await expect(dialog.getByTestId("project-tenant-removed")).toContainText("was removed from Jig");
});
