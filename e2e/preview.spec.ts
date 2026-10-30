import { execFileSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
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
  // One tab per format: more than the default minute on a busy machine.
  test.setTimeout(120_000);
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

  // A component template isn't a page: it opens as source; Preview is a click away.
  const template = await preview(page, "sidebar.component.html");
  await expect(template.getByTestId("preview-mode-source")).toHaveAttribute("aria-selected", "true");
  await expect(template).toContainText("@if (open())");
  await template.getByTestId("preview-mode-preview").click();
  await expect(template.getByTestId("preview-html")).toBeVisible();

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

test("Markdown preview renders sanitized HTML and loads relative images", async ({ page, jigHome }) => {
  const dir = join(jigHome, "readme-demo");
  await mkdir(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await copyFile(new URL("../apps/desktop/build/icon.png", import.meta.url), join(dir, "logo.png"));
  await writeFile(
    join(dir, "README.md"),
    '<p align="center"><img src="logo.png?v=2" alt="Shop logo" width="112"></p>\n\n<h1 align="center">Shop README</h1>\n\n<script>document.documentElement.dataset.attacked="yes"</script>\n\n<a href="javascript:alert(1)">unsafe</a>',
  );
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+Shift+G");
  const md = await preview(page, "README.md");
  await expect(md.getByRole("heading", { name: "Shop README" })).toBeVisible();
  const image = md.getByAltText("Shop logo");
  await expect(image).toHaveAttribute("width", "112");
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1024);
  await expect(md.locator("script, iframe")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.attacked)).toBeUndefined();
  await expect(md.locator("a").filter({ hasText: "unsafe" })).not.toHaveAttribute("href", /javascript:/);
});

test("Markdown HTML tables keep spanning rows and balanced image columns", async ({ page, jigHome }) => {
  const dir = join(jigHome, "table-demo");
  await mkdir(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await copyFile(new URL("../apps/desktop/build/icon.png", import.meta.url), join(dir, "logo.png"));
  await writeFile(
    join(dir, "README.md"),
    '<table><tr><td colspan="2" valign="top">Full width banner</td></tr><tr><td width="50%" valign="top"><img src="logo.png" alt="Left image">Left caption</td><td width="50%" valign="top"><img src="logo.png" alt="Right image">Right caption with a little more text</td></tr></table>\n\n| Left | Center | Right |\n| :--- | :---: | ---: |\n| One | Two | 3 |',
  );
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+Shift+G");
  const md = await preview(page, "README.md");
  await expect(md.getByAltText("Left image")).toBeVisible();
  await expect
    .poll(() => md.getByAltText("Left image").evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(1024);
  const table = md.locator("table").first();
  await expect(table.locator("tr").first().locator("td")).toHaveAttribute("colspan", "2");
  for (const width of [1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await table
      .locator("tr")
      .nth(1)
      .locator("td")
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
    expect(Math.abs(sizes[0]! - sizes[1]!)).toBeLessThan(2);
    const box = await table.boundingBox();
    const wrapper = await table.locator("..").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(wrapper!.width + 1);
  }
  await expect(md.locator("table").last().locator("th").nth(2)).toHaveCSS("text-align", "right");
});
