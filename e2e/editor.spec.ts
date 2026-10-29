import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Preview edits code and text files: save with Ctrl+S, and a change on disk asks first", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "cart.ts");
  await writeFile(file, "export const total = 1;\r\n");
  await hostCall(page, "projects.add", { path: dir });
  // Open it from Files (as a click in Git or on a chat card does).
  await page.keyboard.press("Control+Shift+E");
  await page.getByTestId("files-view").getByTestId("files-entry-cart.ts").click();
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  const editor = tab.getByTestId("code-editor");
  await expect(editor).toContainText("export const total = 1;");

  // Type and save: the file keeps its Windows line endings.
  await editor.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("// edited");
  await expect(tab.getByTestId("preview-save")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(tab.getByTestId("preview-save")).toHaveCount(0);
  expect(await readFile(file, "utf8")).toBe("export const total = 1;\r\n// edited");

  // Edit again, then the file changes on disk: a bar asks; the diff shows both; keep mine.
  await page.keyboard.type(" again");
  await writeFile(file, "export const total = 2;\r\n");
  await expect(tab.getByTestId("preview-conflict")).toBeVisible({ timeout: 10000 });
  await tab.getByTestId("conflict-diff").click();
  await expect(tab.getByTestId("conflict-diff-view")).toContainText("total = 2");
  await tab.getByTestId("conflict-keep").click();
  await expect(tab.getByTestId("preview-conflict")).toHaveCount(0);
  expect(await readFile(file, "utf8")).toBe("export const total = 1;\r\n// edited again");
});

test("Closing a Preview tab with unsaved changes asks first", async ({ page, jigHome }) => {
  const dir = join(jigHome, "notes");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "todo.txt"), "Todo\n");
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+Shift+E");
  await page.getByTestId("files-view").getByTestId("files-entry-todo.txt").click();
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  const editor = tab.getByTestId("code-editor");
  await expect(editor).toContainText("Todo");
  await editor.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("- milk");
  await expect(page.getByTestId("tab-dirty")).toBeVisible();

  // Cancel keeps the tab and the edit; Discard closes it.
  await page.keyboard.press("Control+w");
  const dialog = page.getByTestId("dialog");
  await expect(dialog).toContainText("Discard your changes to todo.txt?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toContainText("- milk");
  await page.keyboard.press("Control+w");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("tab-dirty")).toHaveCount(0);
  await expect(editor).toHaveCount(0);
});
