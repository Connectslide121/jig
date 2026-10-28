import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";
import { previewFolder } from "./previewFiles";

async function preview(page: Page, name: string) {
  await page.getByTestId(`git-file-untracked-${name}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Preview" }).click();
  const tab = page.locator("[data-tab-id]:not(.hidden)").getByTestId("preview");
  await expect(tab).toBeVisible();
  return tab;
}

test("Preview shows Markdown, tables, JSON, notebooks, HTML, PDF, Excel, diagrams and code", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await previewFolder(dir);
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+Shift+G");

  // Markdown: rendered, table, Mermaid diagram, a link to another file opens its preview.
  const md = await preview(page, "docs/README.md");
  await expect(md.getByRole("heading", { name: "Shop" })).toBeVisible();
  await expect(md.getByTestId("mermaid").locator("svg")).toBeVisible({ timeout: 15000 });
  await md.getByTestId("preview-mode-source").click();
  await expect(md).toContainText("flowchart LR");
  await md.getByTestId("preview-mode-preview").click();
  await md.getByRole("link", { name: "setup guide" }).click();
  await expect(
    page.locator("[data-tab-id]:not(.hidden)").getByRole("heading", { name: "Setup" }),
  ).toBeVisible();

  const csv = await preview(page, "orders.csv");
  await expect(csv.getByTestId("preview-table")).toContainText("3 rows · 3 columns");
  await expect(csv.getByTestId("preview-table")).toContainText("Ann, Ltd");
  await csv.getByLabel("Filter rows").fill("bo");
  await expect(csv.getByTestId("preview-table")).toContainText("1 of 3");

  const json = await preview(page, "config.json");
  await expect(json.getByTestId("preview-json")).toContainText("discounts");

  const nb = await preview(page, "analysis.ipynb");
  await expect(nb.getByTestId("preview-notebook")).toContainText("Sales");
  await expect(nb.getByTestId("preview-notebook")).toContainText("3");

  const html = await preview(page, "page.html");
  const frame = page.frameLocator('[data-testid="preview-html"]');
  await expect(frame.locator("h1")).toHaveText("Static page");
  await html.getByRole("button", { name: "Run scripts" }).click();
  await expect(page.frameLocator('[data-testid="preview-html"]').locator("h1")).toHaveText("Scripted page");

  const pdfTab = await preview(page, "manual.pdf");
  await expect(pdfTab.getByTestId("preview-pdf")).toBeVisible();

  const xlsx = await preview(page, "budget.xlsx");
  await expect(xlsx.getByTestId("preview-table")).toContainText("Servers");

  const mmd = await preview(page, "flow.mmd");
  await expect(mmd.getByTestId("mermaid").locator("svg")).toBeVisible({ timeout: 15000 });

  const patch = await preview(page, "fix.patch");
  await expect(patch.getByTestId("preview-diff")).toContainText("+const total = 2;");

  const code = await preview(page, "cart.ts");
  await expect(code).toContainText("items.reduce");

  // It follows edits.
  await writeFile(join(dir, "cart.ts"), "export const total = 42;\n");
  await expect(code).toContainText("total = 42", { timeout: 5000 });

  // Ask Claude opens a chat with a request about the file.
  await code.getByTestId("preview-ask").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(/cart\.ts and explain what it does/);
});
