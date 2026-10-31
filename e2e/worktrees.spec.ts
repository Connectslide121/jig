import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

test("a chat in its own worktree: Claude writes there, Apply brings it back, Remove cleans up", async ({
  page,
  jigHome,
}) => {
  const repo = join(jigHome, "shop");
  await mkdir(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "a@b.c");
  git(repo, "config", "user.name", "A");
  await writeFile(join(repo, "notes.md"), "hello\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  await hostCall(page, "projects.add", { path: repo });

  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("New chat in a worktree");
  await page.keyboard.press("Enter");
  await page.getByTestId("dialog-input").fill("Try a new readme");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15000 });

  // Claude writes in the worktree; the repository is untouched.
  await page.getByTestId("composer-input").fill("write notes.md");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat")).toContainText("I wrote notes.md.", { timeout: 15000 });
  expect(await readFile(join(repo, "notes.md"), "utf8")).toBe("hello\n");
  const list = async () =>
    ((await hostCall(page, "worktrees.list")) as { value: Array<{ path: string; branch: string }> }).value;
  const [chat] = await list();
  expect(chat!.branch).toMatch(/^jig\/try-a-new-readme-/);
  expect(await readFile(join(chat!.path, "notes.md"), "utf8")).toContain("Written by the fake engine.");

  // Apply: the change lands in the working copy, uncommitted.
  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByTestId("worktree-apply").click();
  await expect.poll(() => readFile(join(repo, "notes.md"), "utf8")).toContain("Written by the fake engine.");
  expect(git(repo, "status", "--porcelain").trim()).toBe("M notes.md");

  // Remove: the copy and its branch go, the chat stays.
  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByTestId("worktree-remove").click();
  await page.getByTestId("dialog-confirm").click();
  await expect.poll(async () => (await list()).length).toBe(0);
  await expect(stat(chat!.path)).rejects.toThrow();
  expect(git(repo, "branch", "--list", chat!.branch).trim()).toBe("");
});
