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
  // The message box is empty again, ready for the next commit.
  await expect(page.getByTestId("git-commit-message")).toHaveValue("");

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
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show all repos");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("repo-sync-shop")).toContainText("2", { timeout: 15000 });
  await expect(page.getByTestId("repo-shop")).toContainText("main");
  // Its commits under the row, like the Git plugin: no remote here, so both are still to push.
  await page.getByTestId("repo-toggle-shop").click();
  const row = page.getByTestId("repo-shop");
  await expect(row).toContainText("main · no upstream");
  await expect(row).toContainText("Fix total");
  await expect(row).toContainText("Add cart");
  const fix = row.locator('[data-testid^="repo-commit-"]', { hasText: "Fix total" }).first();
  await expect(fix).toContainText("↑");
  // A commit's files with their counts, a file's diff.
  await fix.getByText("Fix total").click();
  await expect(fix.getByTestId("repo-commit-file-cart.ts")).toContainText("+1");
  await fix.getByTestId("repo-commit-file-cart.ts").click();
  await expect(fix.getByTestId("repo-commit-diff")).toContainText("+  return a + b + 1;");
  // Clicking the name again closes it.
  await page.getByTestId("repo-toggle-shop").click();
  await expect(row).not.toContainText("Fix total");
});

test("Repos: the branch is a dropdown that switches branches", async ({ page, jigHome }) => {
  const dir = await setup(page, jigHome);
  git(dir, "stash", "-u");
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show all repos");
  await page.keyboard.press("Enter");
  await page.getByTestId("repo-branch-shop").click();
  await page.getByRole("menuitem", { name: "feature/pay" }).click();
  await expect(page.getByTestId("repo-branch-shop")).toContainText("feature/pay", { timeout: 15000 });
});

test("Scripts add-on lists and runs scripts", async ({ page, jigHome }) => {
  await setup(page, jigHome);
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Scripts" }).click();
  await expect(page.getByTestId("scripts-view")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("scripts-addon-dev")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("scripts-addon-dev").getByRole("button", { name: "Run dev" }).click();
  await expect(page.locator(".jig-xterm:visible .xterm-rows")).toContainText("shop-dev");
});

test("Scripts: a group starts and stops its scripts together; hidden scripts leave the tree", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "tools");
  await mkdir(dir, { recursive: true });
  const forever = 'node -e "setInterval(() => {}, 1000)"';
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { serve: forever, api: forever, lint: "echo l" } }),
  );
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Scripts" }).click();
  const view = page.getByTestId("scripts-view");
  const tree = view.getByTestId("scripts-package-tools");
  await expect(tree.getByTestId("scripts-addon-lint")).toBeVisible({ timeout: 15000 });
  await expect(tree).toContainText("npm");

  // A group, and two scripts added to it from their menu.
  await view.getByTestId("scripts-new-group").click();
  await page.getByTestId("dialog-input").fill("Tools");
  await page.getByTestId("dialog-confirm").click();
  for (const name of ["serve", "api"]) {
    await tree.getByTestId(`scripts-addon-${name}`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to group" }).hover();
    await page.getByRole("menuitem", { name: "Tools" }).click();
  }
  // A group starts folded to its header; its chevron shows the scripts.
  const group = view.getByTestId("scripts-group-Tools");
  await expect(group).toContainText("2 scripts");
  await expect(group.getByTestId("scripts-addon-serve")).toHaveCount(0);
  await view.getByTestId("scripts-group-fold-Tools").click();
  await expect(group.getByTestId("scripts-addon-serve")).toBeVisible();
  await expect(group.getByTestId("scripts-addon-api")).toBeVisible();

  // Start and Stop act on the whole group.
  await view.getByTestId("scripts-group-start-Tools").click();
  await expect(view.getByTestId("scripts-running")).toContainText("serve", { timeout: 15000 });
  await expect(view.getByTestId("scripts-running")).toContainText("api");
  await expect(group).toContainText("2 of 2 running");
  await view.getByTestId("scripts-group-stop-Tools").click();
  await expect(view.getByTestId("scripts-running")).toHaveCount(0, { timeout: 15000 });

  // "All scripts" folds away and comes back.
  await view.getByTestId("scripts-all-fold").click();
  await expect(tree).toHaveCount(0);
  await view.getByTestId("scripts-all-fold").click();
  await expect(tree).toBeVisible();

  // Hide lint; the eye shows hidden scripts again.
  await tree.getByTestId("scripts-addon-lint").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide it" }).click();
  await expect(tree.getByTestId("scripts-addon-lint")).toHaveCount(0);
  await view.getByTestId("scripts-show-hidden").click();
  await expect(tree.getByTestId("scripts-addon-lint")).toBeVisible();

  // The filter finds a script at once, with where it lives.
  await view.getByTestId("scripts-filter").fill("lin");
  await expect(view.getByTestId("scripts-matches")).toContainText("1 found");
  await expect(view.getByTestId("scripts-matches").getByTestId("scripts-addon-lint")).toBeVisible();
});

test("Pipelines: none found, a settings page, and more pipelines from your organisations", async ({
  page,
}) => {
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show pipelines");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("pipelines-view")).toContainText("No pipelines found", { timeout: 15000 });
  await page.getByRole("button", { name: "Pipelines settings", exact: true }).click();
  await expect(page.getByTestId("pipelines-settings")).toBeVisible();
  // Every organisation of your az login by default; az here says it isn't signed in.
  await expect(page.getByTestId("pipelines-settings")).toContainText("az login");
  await page.getByTestId("pipelines-org").fill("contoso");
  await page.getByTestId("pipelines-add-org").click();
  await page.getByTestId("pipelines-projects-contoso").fill("Web, Api");
  await page.getByTestId("pipelines-save").click();
  await expect(page.getByTestId("toast")).toContainText("saved");
  expect(await hostCall(page, "addons.call", { id: "pipelines", method: "settings" })).toMatchObject({
    ok: true,
    value: { allOrgs: true, orgs: [{ org: "https://dev.azure.com/contoso", projects: ["Web", "Api"] }] },
  });
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByRole("button", { name: "Pipelines settings", exact: true }).click();
  await expect(page.getByTestId("pipelines-settings")).toBeVisible();
  await expect(page.getByTestId("tab-jig.settings")).toHaveCount(1);
  // More pipelines: projects, including empty/erroring ones, can be hidden and restored from Arrange.
  await page.getByTestId("pipelines-more").click();
  const projects = page.getByTestId("pipelines-projects-contoso");
  await expect(projects).toBeVisible({ timeout: 15000 });
  await page.getByTestId("pipelines-arrange").click();
  await projects.getByTestId("arrange-toggle-Web").click();
  await page.getByTestId("pipelines-arrange").click();
  await expect(projects.getByTestId("arrange-item-Web")).toHaveCount(0);
  await page.getByTestId("pipelines-arrange").click();
  await projects.getByTestId("arrange-toggle-Web").click();
  await page.getByTestId("pipelines-arrange").click();
  await expect(projects.getByTestId("arrange-item-Web")).toBeVisible();
});

test("Git: review comments on diff lines, sent to a chat as one message", async ({ page, jigHome }) => {
  await setup(page, jigHome);
  await page.keyboard.press("Control+Shift+G");
  await page.getByTestId("git-file-unstaged-cart.ts").click({ timeout: 15000 });
  const diff = page.locator("[data-testid=git-diff]:visible");
  await diff.getByTestId("git-diff-line-2").last().click();
  await page.getByTestId("dialog-input").fill("Doubling looks wrong here");
  await page.getByTestId("dialog-confirm").click();
  await expect(diff.getByTestId("git-review-comments")).toContainText("Doubling looks wrong here");
  await expect(diff.getByTestId("git-review")).toHaveText("Review (1)");
  // The comment stays when switching to the inline view.
  await diff.getByTestId("git-diff-mode-inline").click();
  await expect(diff.getByTestId("git-review-comments")).toContainText("Doubling looks wrong here");
  await diff.getByTestId("git-review").click();
  await page.getByRole("menuitem", { name: "Send 1 comment to a new chat" }).click();
  await expect(page.getByTestId("composer-input")).toHaveValue(
    /\*\*cart\.ts\*\*\n- line 2 `return \(a \+ b\) \* 2;`: Doubling looks wrong here/,
    { timeout: 15000 },
  );
});
