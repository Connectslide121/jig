import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("project links: grouped, typed, added by hand, shown on Home, and by Claude with Undo", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await openLinks(page);
  const links = page.getByTestId("links-view");
  await expect(links).toBeVisible();
  // Kept beside the chats: its tab moves to the left sidebar.
  await page.getByTestId("tab-jig.view").click({ button: "right" });
  await page.getByTestId("move-view-left").click();
  await expect(page.getByTestId("region-left").getByTestId("links-view")).toBeVisible();

  // Add a link by hand: type and label come from the address.
  await links.getByTestId("links-add").click();
  const dialog = page.getByTestId("link-dialog");
  await dialog
    .getByTestId("link-url")
    .fill(
      "https://portal.azure.com/#@/resource/subscriptions/abc/resourceGroups/shop-prod/providers/Microsoft.Web/sites/shop-web",
    );
  await expect(dialog.getByTestId("link-label")).toHaveAttribute("placeholder", "shop-web");
  await dialog.getByTestId("link-group").fill("Prod");
  await dialog.getByTestId("link-save").click();
  await expect(links.getByTestId("link-group-Prod")).toContainText("shop-web");

  // On the project's Home.
  await expect(page.getByTestId("home-links")).toContainText("shop-web");

  // Claude adds links from a chat; Undo takes them away.
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("add the stage links");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat")).toContainText("Stage links", { timeout: 15000 });
  await expect(links.getByTestId("link-group-Stage")).toContainText("stage.shop.se");
  await expect(links.getByTestId("link-group-Stage")).toContainText("shop-stage");
  await page.getByTestId("change-card").last().getByTestId("change-undo").click();
  await expect(links.getByTestId("link-group-Stage")).toHaveCount(0);
  await expect(links.getByTestId("link-group-Prod")).toContainText("shop-web");
});

test("project links: add from Azure through your az login", async () => {
  const home = await mkdtemp(join(tmpdir(), "jig-e2e-az-"));
  const bin = join(home, "bin");
  await mkdir(bin, { recursive: true });
  // Three subscriptions in two tenants; the third one's tenant needs its own sign-in.
  const contoso = "11111111-1111-1111-1111-111111111111";
  const fabrikam = "22222222-2222-2222-2222-222222222222";
  const locked = "33333333-3333-3333-3333-333333333333";
  const rg = `/subscriptions/${contoso}/resourceGroups/shop-stage`;
  await writeFile(
    join(bin, "az"),
    `#!/usr/bin/env node
const a = process.argv.slice(2);
const sub = a[a.indexOf("--subscription") + 1];
if (a[0] === "account") console.log(JSON.stringify([
  { id: "${contoso}", name: "Contoso Dev", tenantId: "t1", state: "Enabled" },
  { id: "${fabrikam}", name: "Fabrikam Prod", tenantId: "t2", state: "Enabled" },
  { id: "${locked}", name: "Fabrikam Old", tenantId: "t3", state: "Enabled" },
  { id: "${contoso}", name: "Contoso Dev", tenantId: "t1", state: "Enabled" }
]));
else if (a[0] === "group" && sub === "${locked}") { console.error("AADSTS50076: multi-factor authentication required"); process.exit(1); }
else if (a[0] === "group" && sub === "${fabrikam}") console.log(JSON.stringify([{ id: "/subscriptions/${fabrikam}/resourceGroups/fabrikam-prod", name: "fabrikam-prod" }]));
else if (a[0] === "group") console.log(JSON.stringify([{ id: "${rg}", name: "shop-stage" }]));
else if (sub !== "${contoso}") console.log("[]");
else console.log(JSON.stringify([
  { id: "${rg}/providers/Microsoft.Web/sites/shop-web", name: "shop-web", type: "Microsoft.Web/sites", resourceGroup: "shop-stage" },
  { id: "${rg}/providers/Microsoft.Sql/servers/sql/databases/shopdb", name: "shopdb", type: "Microsoft.Sql/servers/databases", resourceGroup: "shop-stage" }
]));
`,
  );
  await chmod(join(bin, "az"), 0o755);
  // Windows runs no shebang scripts: an az.cmd starts the same script with node.
  await writeFile(
    join(bin, "az.cmd"),
    `@node "%~dp0az" %*
`,
  );
  const PATH = `${bin}${delimiter}${process.env.PATH ?? process.env.Path}`;
  const app = await launchJig(home, { PATH, Path: PATH });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-testid=app-root]");
  const dir = join(home, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await openLinks(page);
  const links = page.getByTestId("links-view");
  await links.getByTestId("links-azure").click();
  const dialog = page.getByTestId("azure-dialog");
  // Every subscription's resource groups, under its name; one that can't be read is named.
  await expect(dialog.getByTestId("azure-item")).toHaveCount(2);
  await expect(dialog.getByTestId("azure-subscription")).toHaveText(["Contoso Dev", "Fabrikam Prod"]);
  await expect(dialog.getByTestId("azure-item").first()).toContainText("shop-stage");
  await expect(dialog.getByTestId("azure-problems")).toContainText("Fabrikam Old");
  // A group's resources come from its own subscription.
  await dialog.getByTestId("azure-item").first().getByRole("button", { name: "Resources…" }).click();
  await expect(dialog.getByTestId("azure-item")).toHaveCount(2);
  await dialog.getByRole("checkbox", { name: "shop-web" }).check();
  await dialog.getByRole("checkbox", { name: "shopdb" }).check();
  await dialog.getByTestId("link-group").fill("Stage");
  await dialog.getByTestId("azure-add").click();
  await expect(links.getByTestId("link-group-Stage")).toContainText("shop-web");
  await expect(links.getByTestId("link-group-Stage")).toContainText("shopdb");
  await app.close();
});

/** Opens the active project's links (a tab, from the project switcher). */
async function openLinks(page: import("@playwright/test").Page) {
  await page.getByTestId("project-switcher").click();
  await page.getByRole("menuitem", { name: "Project links", exact: true }).click();
}
