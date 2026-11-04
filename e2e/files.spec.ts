import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

test("Files: the project's tree with git colours, a filter, Preview, other folders next to it", async ({
  page,
  jigHome,
}) => {
  const repos = join(jigHome, "repos");
  const shop = join(repos, "shop");
  const blog = join(repos, "blog");
  for (const dir of [shop, blog]) {
    await mkdir(join(dir, "src"), { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "a@x.com");
    git(dir, "config", "user.name", "Ann");
  }
  await writeFile(join(shop, "src", "cart.ts"), "export const total = 1;\n");
  await writeFile(join(shop, "README.md"), "# Shop\n");
  await writeFile(join(shop, ".gitignore"), "dist\n");
  await mkdir(join(shop, "dist"));
  git(shop, "add", ".");
  git(shop, "commit", "-q", "-m", "init");
  await writeFile(join(blog, "post.md"), "# Hello\n");
  await writeFile(join(shop, "src", "cart.ts"), "export const total = 2;\n");
  await writeFile(join(shop, "notes.md"), "notes\n");
  await hostCall(page, "projects.add", { path: repos });
  await hostCall(page, "projects.create", { name: "Shop", path: repos });
  await page.keyboard.press("Control+Shift+E");
  const view = page.getByTestId("files-view");
  await expect(view.getByTestId("files-picker")).toContainText("repos");

  // Follow one repository: its tree, changed files coloured, ignored folders dimmed.
  await view.getByTestId("files-picker").click();
  await page.getByRole("menuitem", { name: "repos/shop", exact: true }).click();
  await expect(view.getByTestId("files-root-repos/shop")).toBeVisible();
  await expect(view.getByTestId("files-entry-notes.md")).toContainText("U");
  await expect(view.getByTestId("files-entry-dist")).toHaveClass(/opacity-60/);
  await view.getByTestId("files-entry-src").click();
  await expect(view.getByTestId("files-entry-cart.ts")).toContainText("M");

  // Click a file: Preview.
  await view.getByTestId("files-entry-README.md").click();
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("preview-markdown")).toContainText(
    "Shop",
    {
      timeout: 10000,
    },
  );

  // The filter finds files by name.
  await view.getByTestId("files-filter").fill("cart");
  await expect(view.getByTestId("files-matches")).toContainText("cart.ts");
  await view.getByTestId("files-filter").fill("");

  // Another folder next to it.
  await view.getByTestId("files-shown-menu").click();
  await page.getByRole("menuitem", { name: "repos/blog" }).click();
  await expect(view.getByTestId("files-root-repos/blog")).toBeVisible();
  await expect(view.getByTestId("files-entry-post.md")).toBeVisible();

  // A file created outside Jig shows up by itself.
  await writeFile(join(shop, "todo.md"), "- x\n");
  await expect(view.getByTestId("files-entry-todo.md")).toBeVisible({ timeout: 15000 });
});

test("Files: switching away and back keeps the tree, opened folders and changes made meanwhile", async ({
  page,
  jigHome,
}) => {
  const shop = join(jigHome, "shop");
  await mkdir(join(shop, "src"), { recursive: true });
  git(shop, "init", "-q", "-b", "main");
  await writeFile(join(shop, "src", "cart.ts"), "export const total = 1;\n");
  await hostCall(page, "projects.add", { path: shop });
  await hostCall(page, "projects.create", { name: "Shop", path: shop });
  await page.keyboard.press("Control+Shift+E");
  const left = page.getByTestId("region-left");
  const view = left.getByTestId("files-view");
  await view.getByTestId("files-entry-src").click();
  await expect(view.getByTestId("files-entry-cart.ts")).toBeVisible();

  // From here on, a loading row or a view without its tree would be a blink.
  await page.evaluate(() => {
    const w = window as unknown as { filesBlinked?: string };
    new MutationObserver(() => {
      const shown = document.querySelector('[data-testid="files-view"]');
      if (shown?.querySelector('[data-testid="loading"]')) w.filesBlinked = "a loading row";
      else if (shown && !shown.querySelector('[data-testid="files-entry-cart.ts"]'))
        w.filesBlinked = "the view without its tree";
    }).observe(document.body, { childList: true, subtree: true });
  });

  // Another view in the same sidebar, a file created meanwhile, then back: there at once, still open.
  await left.getByTestId("view-tab-jig.sessions").click();
  await expect(view).toHaveCount(0);
  await writeFile(join(shop, "src", "later.ts"), "export {};\n");
  await left.getByTestId("view-tab-addon.files.files").click();
  await expect(view.getByTestId("files-entry-cart.ts")).toBeVisible();
  await expect(view.getByTestId("files-entry-later.ts")).toBeVisible({ timeout: 15000 });

  // The sidebar collapsed and opened again: the same.
  await page.keyboard.press("Control+B");
  await expect(view).toHaveCount(0);
  await page.keyboard.press("Control+B");
  await expect(view.getByTestId("files-entry-later.ts")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { filesBlinked?: string }).filesBlinked),
  ).toBeUndefined();
});
