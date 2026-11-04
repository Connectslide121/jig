import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AZ_ARGV, expect, hostCall, settledBox, test } from "./fixtures";

/**
 * An `az` that answers per Azure CLI folder (D-282): your own az login is Ann at Contoso, a folder
 * named `northwind…` signs in to Northwind, `slow…` keeps the browser sign-in waiting until cancelled,
 * and `--use-device-code` prints a code to enter (as the Azure CLI does) and waits until cancelled.
 */
const FAKE_AZ = `
const args = ${AZ_ARGV};
const dir = require("node:path").basename(process.env.AZURE_CONFIG_DIR || "");
const who = dir.startsWith("northwind")
  ? { id: "22222222-2222-4222-8222-222222222222", name: "Northwind", domain: "northwind.example.com", user: "ann@northwind.example.com" }
  : { id: "11111111-1111-4111-8111-111111111111", name: "Contoso", domain: "contoso.example.com", user: "ann@contoso.example.com" };
if (args[0] === "login") {
  if (args.includes("--use-device-code")) {
    console.error("To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code FAKE2CODE to authenticate.");
    setInterval(() => {}, 1000);
  } else if (args.includes("slow.example.com")) { console.error("Opening the browser"); setInterval(() => {}, 1000); }
  else { console.error("Signed in"); process.exit(0); }
} else if (args[0] === "account") {
  console.log(JSON.stringify({ tenantId: who.id, tenantDisplayName: who.name, user: { name: who.user, type: "user" } }));
} else if (args[0] === "rest") {
  console.log(JSON.stringify({ value: [{ tenantId: who.id, displayName: who.name, defaultDomain: who.domain }] }));
} else {
  console.error("ERROR: Please run 'az login' to setup account.");
  process.exit(1);
}
`;

test("Tenants: add, cancel, switch and remove from the top bar chip without moving it", async ({
  page,
  jigHome,
}) => {
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), FAKE_AZ);
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${FAKE_AZ}`);

  const chip = page.getByTestId("tenant-switcher");
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Your az login");
  const before = await settledBox(chip);

  // Cancel stops a sign-in that waits in the browser, and leaves no tenant behind.
  await chip.click();
  await page.getByTestId("tenant-add").click();
  const add = page.getByTestId("tenant-add-dialog");
  await add.getByTestId("tenant-input").fill("not a tenant");
  await expect(add.getByTestId("tenant-signin")).toBeDisabled();
  await add.getByTestId("tenant-input").fill("slow.example.com");
  await add.getByTestId("tenant-signin").click();
  await expect(add.getByTestId("tenant-signin-log")).toContainText("Waiting for the sign-in");
  await add.getByRole("button", { name: "Cancel" }).click();
  await expect(add).toBeHidden();
  await expect
    .poll(
      async () =>
        ((await hostCall(page, "azure.tenants")) as { value: { tenants: unknown[] } }).value.tenants,
    )
    .toHaveLength(1);

  // A finished sign-in adds the tenant, named after it, and switches to it.
  await chip.click();
  await page.getByTestId("tenant-add").click();
  await add.getByTestId("tenant-input").fill("northwind.example.com");
  await add.getByTestId("tenant-signin").click();
  await expect(add).toBeHidden({ timeout: 15000 });
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Northwind");
  expect(await settledBox(chip)).toEqual(before);

  // The menu lists both with their users; the whole row switches.
  await chip.click();
  await expect(page.getByTestId("tenant-item-northwind")).toContainText("ann@northwind.example.com");
  await page.getByTestId("tenant-item-default").click();
  await expect(chip).toHaveAttribute("aria-label", "Azure tenant: Your az login");

  // Settings → Azure opens the same manage modal: remove asks first.
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-azure").click();
  await page.getByTestId("settings-tenant-manage").click();
  const manage = page.getByTestId("tenant-manage-dialog");
  const row = manage.getByTestId("tenant-row-northwind");
  await expect(row).toContainText("Northwind");
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByTestId("dialog-confirm").click();
  await expect(row).toBeHidden();
});

test("Tenants: Claude lists the tenants and switches after you approve", async ({ page, jigHome }) => {
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), FAKE_AZ);
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${FAKE_AZ}`);
  await hostCall(page, "azure.addTenant", { tenant: "northwind.example.com" });

  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("switch the azure tenant to Northwind");
  await page.keyboard.press("Enter");
  await page.getByTestId("permission-allow").click({ timeout: 15000 });
  await expect(page.getByText("Jig now uses the Azure tenant Northwind").first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("tenant-switcher")).toHaveAttribute("aria-label", "Azure tenant: Northwind");
});

test("Tenants: sign in with a code shows the code, in Add and in Sign in again", async ({
  page,
  jigHome,
}) => {
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), FAKE_AZ);
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${FAKE_AZ}`);

  // Add: "With a code" shows the code in the fixed log box, with Copy and Open page.
  await page.getByTestId("tenant-switcher").click();
  await page.getByTestId("tenant-add").click();
  const add = page.getByTestId("tenant-add-dialog");
  const log = add.getByTestId("tenant-signin-log");
  await add.getByTestId("tenant-method-code").click();
  const box = await settledBox(log);
  await add.getByTestId("tenant-signin").click();
  await expect(add.getByTestId("tenant-device-code")).toHaveText("FAKE2CODE");
  await expect(add.getByRole("button", { name: "Open page" })).toBeVisible();
  expect(await settledBox(log)).toEqual(box);
  await add.getByRole("button", { name: "Cancel" }).click();
  await expect(add).toBeHidden();

  // Sign in again: the row's button offers both ways; the code opens in a small modal.
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-azure").click();
  await page.getByTestId("settings-tenant-manage").click();
  const manage = page.getByTestId("tenant-manage-dialog");
  await manage
    .getByTestId("tenant-row-default")
    .getByRole("button", { name: /Sign in again/ })
    .click();
  await page.getByRole("menuitem", { name: "With a code…" }).click();
  const code = page.getByTestId("tenant-code-dialog");
  await expect(code.getByTestId("tenant-device-code")).toHaveText("FAKE2CODE");
  await code.getByRole("button", { name: "Cancel" }).click();
  await expect(code).toBeHidden();
  await expect(manage).toBeVisible();
  await expect(manage).toContainText("Click a tenant to use it");
});
