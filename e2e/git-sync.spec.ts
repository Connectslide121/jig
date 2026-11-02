import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

test("Git: the sync button says what it does — Push pushes, a new branch is published", async ({
  page,
  jigHome,
}) => {
  // A local "remote" (a bare repository) and a clone of it with one commit to push.
  const origin = join(jigHome, "origin.git");
  await mkdir(origin, { recursive: true });
  git(origin, "init", "-q", "--bare", "-b", "main");
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  git(dir, "remote", "add", "origin", origin);
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Add cart");
  git(dir, "push", "-q", "-u", "origin", "main");
  await writeFile(join(dir, "cart.ts"), "export const total = 2;\n");
  git(dir, "commit", "-q", "-am", "Fix total");
  await hostCall(page, "projects.add", { path: dir });

  await page.keyboard.press("Control+Shift+G");
  await expect(page.getByTestId("git-view")).toBeVisible({ timeout: 15000 });
  // Nothing to commit: the commit box makes way for Push, and the header shows the count.
  await expect(page.getByTestId("git-sync")).toContainText("↑1");
  const full = page.getByTestId("git-sync-full");
  await expect(full).toContainText("Push ↑1");
  await expect(full).toHaveAttribute("title", /Push 1 commit to origin\/main/);
  await full.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Pushed 1 commit to origin/main" })).toBeVisible();
  await expect(full).toHaveCount(0);
  await expect(page.getByTestId("git-sync")).toContainText("Up to date");
  expect(git(origin, "--git-dir=.", "log", "--format=%s", "-1", "main").trim()).toBe("Fix total");

  // A branch without an upstream is published.
  git(dir, "switch", "-q", "-c", "feature/pay");
  await page.getByTestId("git-view").getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(full).toContainText("Publish Branch");
  await full.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Published feature/pay" })).toBeVisible();
  expect(git(origin, "--git-dir=.", "branch", "--list", "feature/pay").trim()).toContain("feature/pay");
});
