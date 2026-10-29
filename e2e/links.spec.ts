import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("project links: grouped, typed, added by hand, shown on Home, and by Claude with Undo", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  const links = page.getByTestId("links-view");
  await expect(links).toBeVisible();

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
  const rg = "/subscriptions/abc/resourceGroups/shop-stage";
  await writeFile(
    join(bin, "az"),
    `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === "group") console.log(JSON.stringify([{ id: "${rg}", name: "shop-stage" }]));
else console.log(JSON.stringify([
  { id: "${rg}/providers/Microsoft.Web/sites/shop-web", name: "shop-web", type: "Microsoft.Web/sites", resourceGroup: "shop-stage" },
  { id: "${rg}/providers/Microsoft.Sql/servers/sql/databases/shopdb", name: "shopdb", type: "Microsoft.Sql/servers/databases", resourceGroup: "shop-stage" }
]));
`,
  );
  await chmod(join(bin, "az"), 0o755);
  const app = await launchJig(home, { PATH: `${bin}:${process.env.PATH}` });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-testid=app-root]");
  const dir = join(home, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  const links = page.getByTestId("links-view");
  await links.getByTestId("links-azure").click();
  const dialog = page.getByTestId("azure-dialog");
  await expect(dialog.getByTestId("azure-item")).toContainText("shop-stage");
  await dialog.getByRole("button", { name: "Resources…" }).click();
  await expect(dialog.getByTestId("azure-item")).toHaveCount(2);
  await dialog.getByRole("checkbox", { name: "shop-web" }).check();
  await dialog.getByRole("checkbox", { name: "shopdb" }).check();
  await dialog.getByTestId("link-group").fill("Stage");
  await dialog.getByTestId("azure-add").click();
  await expect(links.getByTestId("link-group-Stage")).toContainText("shop-web");
  await expect(links.getByTestId("link-group-Stage")).toContainText("shopdb");
  await app.close();
});
