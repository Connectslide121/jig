import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

/** A small repository: two commits on main, a feature branch, and uncommitted changes. */
async function repo(jigHome: string) {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  await writeFile(
    join(dir, "cart.ts"),
    "export function total(a: number, b: number) {\n  return a + b;\n}\n",
  );
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { dev: "echo shop-dev && sleep 20" } }),
  );
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Add cart");
  await writeFile(
    join(dir, "cart.ts"),
    "export function total(a: number, b: number) {\n  return a + b + 1;\n}\n",
  );
  git(dir, "commit", "-q", "-am", "Fix total");
  git(dir, "branch", "feature/pay");
  await writeFile(
    join(dir, "cart.ts"),
    "export function total(a: number, b: number) {\n  return (a + b) * 2;\n}\n",
  );
  await writeFile(join(dir, "notes.md"), "todo\n");
  return dir;
}

async function setup(page: Page, jigHome: string) {
  const dir = await repo(jigHome);
  await hostCall(page, "projects.add", { path: dir });
  return dir;
}

test("Git: working changes, stage, commit, history, commit detail and diffs", async ({ page, jigHome }) => {
  const dir = await setup(page, jigHome);
  await page.keyboard.press("Control+Shift+G");
  await expect(page.getByTestId("git-view")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("git-current-branch")).toContainText("main");
  await expect(page.getByTestId("git-file-unstaged-cart.ts")).toBeVisible();
  await expect(page.getByTestId("git-file-untracked-notes.md")).toBeVisible();

  // Diff of the working copy, side by side and inline, highlighted.
  await page.getByTestId("git-file-unstaged-cart.ts").click();
  await expect(page.getByTestId("git-diff-split")).toContainText("(a + b) * 2");
  await page.getByTestId("git-diff-mode-inline").click();
  await expect(page.getByTestId("git-diff-inline")).toContainText("return a + b + 1;");

  // Stage and commit.
  await page.getByTestId("git-file-unstaged-cart.ts").hover();
  await page.getByTestId("git-file-unstaged-cart.ts").getByTestId("git-stage").click();
  await expect(page.getByTestId("git-file-staged-cart.ts")).toBeVisible();
  await page.getByTestId("git-commit-message").fill("Double the total");
  await page.getByTestId("git-commit").click();
  await expect(page.getByTestId("git-file-staged-cart.ts")).toHaveCount(0);
  expect(git(dir, "log", "-1", "--format=%s").trim()).toBe("Double the total");

  // History of main, filter, commit detail, diff in a commit.
  await page.getByTestId("git-branch-main").click();
  await expect(page.getByTestId("git-history")).toContainText("Double the total");
  await expect(page.getByTestId("git-history")).toContainText("Fix total");
  await page.getByTestId("git-history-filter").fill("fix");
  await expect(page.getByTestId("git-history")).not.toContainText("Double the total");
  await page.getByText("Fix total").click();
  await expect(page.getByTestId("git-commit-detail")).toContainText("Ann Demo");
  await expect(page.getByTestId("git-commit-detail")).toContainText("1 file changed");
  await page.getByTestId("git-commit-file-cart.ts").click();
  await expect(page.locator("[data-testid=git-diff]:visible")).toContainText("a + b + 1");

  // Status bar shows the branch.
  await expect(page.getByTestId("git-status-branch")).toContainText("main");
});

test("Git: switch branch and compare", async ({ page, jigHome }) => {
  const dir = await setup(page, jigHome);
  git(dir, "stash", "-u");
  await page.keyboard.press("Control+Shift+G");
  await expect(page.getByTestId("git-branch-feature/pay")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("git-branch-feature/pay").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Switch to this branch" }).click();
  await expect(page.getByTestId("git-current-branch")).toContainText("feature/pay", { timeout: 10000 });
  await page.getByTestId("git-branch-main").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Compare with current" }).click();
  await expect(page.getByTestId("git-compare")).toContainText("Only on main");
});

test("Repos overview lists repositories with their state", async ({ page, jigHome }) => {
  await setup(page, jigHome);
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("show all repos");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("repo-shop")).toContainText("2 changed", { timeout: 15000 });
  await expect(page.getByTestId("repo-shop")).toContainText("main");
});

test("Scripts add-on lists and runs scripts", async ({ page, jigHome }) => {
  await setup(page, jigHome);
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Scripts" }).click();
  await expect(page.getByTestId("scripts-view")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("scripts-addon-dev")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("scripts-addon-dev").getByRole("button", { name: "dev" }).click();
  await expect(page.locator(".jig-xterm:visible .xterm-rows")).toContainText("shop-dev");
});

test("Scripts: hide, reorder and group scripts with dividers, from the panel", async ({ page, jigHome }) => {
  const dir = join(jigHome, "tools");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { build: "echo b", dev: "echo d", lint: "echo l", test: "echo t" } }),
  );
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Scripts" }).click();
  const view = page.getByTestId("scripts-view");
  await expect(view.getByTestId("scripts-addon-lint")).toBeVisible({ timeout: 15000 });
  const order = () =>
    view
      .locator("[data-testid^=scripts-addon-], [data-testid=arrange-divider]")
      .evaluateAll((els) =>
        els.map((e) =>
          e.getAttribute("data-testid") === "arrange-divider" ? `--${e.textContent}` : e.textContent,
        ),
      );

  await view.getByTestId("scripts-arrange").click();
  // Hide lint; drag test above build; add a divider titled "Daily".
  await view.getByTestId("arrange-toggle-s:" + (await scriptId(view, "lint"))).click();
  await view
    .getByTestId(`arrange-item-s:${await scriptId(view, "test")}`)
    .dragTo(view.getByTestId(`arrange-item-s:${await scriptId(view, "build")}`));
  await view.getByTestId("arrange-add-divider").click();
  await page.getByTestId("dialog-input").fill("Daily");
  await page.getByTestId("dialog-confirm").click();
  await view.getByTestId("scripts-arrange").click();

  await expect(view.getByTestId("scripts-addon-lint")).toHaveCount(0);
  await expect.poll(order).toEqual(["test", "build", "dev"]);
  // The divider went to the end with nothing under it, so it doesn't show; move dev under it.
  await view.getByTestId("scripts-arrange").click();
  const divider = view.getByTestId("arrange-divider");
  await view
    .getByTestId(`arrange-item-s:${await scriptId(view, "dev")}`)
    .dragTo(view.getByTestId("arrange-add-divider"));
  await expect(divider).toBeVisible();
  await view.getByTestId("scripts-arrange").click();
  await expect.poll(order).toEqual(["test", "build", "--Daily", "dev"]);
});

/** The id Jig gives a script (shown in its test id while arranging). */
async function scriptId(view: import("@playwright/test").Locator, name: string): Promise<string> {
  const id = await view
    .locator(`[data-testid^="arrange-item-"]`)
    .filter({ has: view.page().getByTestId(`scripts-addon-${name}`) })
    .first()
    .getAttribute("data-testid");
  return id!.replace("arrange-item-s:", "");
}

test("Pipelines asks to be set up and has a settings page", async ({ page }) => {
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("show pipelines");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Set up Azure DevOps")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Set up" }).click();
  await expect(page.getByTestId("pipelines-settings")).toBeVisible();
  await page.getByTestId("pipelines-org").fill("contoso");
  await page.getByTestId("pipelines-projects").fill("Web, Api");
  await page.getByTestId("pipelines-save").click();
  await expect(page.getByTestId("toast")).toContainText("saved");
});
