import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

async function chat(page: import("@playwright/test").Page, jigHome: string) {
  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  return page.getByTestId("composer-input");
}

test("Claude Code's next-message suggestion shows above the composer; Tab or a click uses it", async ({
  page,
  jigHome,
}) => {
  const input = await chat(page, jigHome);
  await input.fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat-status")).toHaveText("Idle", { timeout: 15000 });
  // Like Claude Code, no suggestion after the first turn.
  await expect(page.getByTestId("suggestion")).toHaveCount(0);

  await input.fill("add a test for the cart");
  await page.keyboard.press("Enter");
  const suggestion = page.getByTestId("suggestion");
  await expect(suggestion).toContainText("Commit these changes", { timeout: 15000 });
  await expect(input).toHaveAttribute("placeholder", /Commit these changes/);
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(input).toHaveValue("Commit these changes");

  // Sending clears it; the next one arrives after the turn.
  await page.keyboard.press("Enter");
  await expect(suggestion).toHaveCount(0);
  await expect(suggestion).toContainText("Now write tests for this", { timeout: 15000 });
  await suggestion.getByTestId("suggestion-send").click();
  await expect(page.getByTestId("chat")).toContainText("Now write tests for this");
});

test("Restore files to before a message puts back what Claude changed", async ({ page, jigHome }) => {
  const input = await chat(page, jigHome);
  const notes = join(jigHome, "demo", "notes.txt");
  await writeFile(notes, "my own notes\n");
  await input.fill("please write notes.txt");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat")).toContainText("I wrote notes.txt.", { timeout: 15000 });
  expect(await readFile(notes, "utf8")).toContain("Written by the fake engine.");

  const message = page.getByTestId("user-message").first();
  await message.hover();
  await message.getByTestId("user-message-menu").click();
  await page.getByTestId("restore-files").click();
  await expect(page.getByRole("dialog")).toContainText("Restore 1 file?");
  await expect(page.getByRole("dialog")).toContainText("notes.txt");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("chat")).toContainText("Restored 1 file to how they were before");
  expect(await readFile(notes, "utf8")).toBe("my own notes\n");
});

test("Fork chat continues a chat as a separate branch", async ({ page, jigHome }) => {
  const input = await chat(page, jigHome);
  await input.fill("first idea");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat-status")).toHaveText("Idle", { timeout: 15000 });

  await page.getByRole("button", { name: "Session options" }).click();
  await page.getByTestId("session-fork").click();
  const fork = page.locator("[data-tab-id]:not(.hidden)").getByTestId("chat");
  await expect(fork).toContainText("Forked from “first idea”");
  await expect(fork).toContainText("first idea");
  await expect(page.getByTestId("tab-jig.chat")).toHaveCount(2);

  await fork.getByTestId("composer-input").fill("second idea, only in the fork");
  await page.keyboard.press("Enter");
  await expect(fork).toContainText("You said: second idea", { timeout: 15000 });
  type Meta = { id: string; title: string; forkPending?: boolean };
  const sessions = ((await hostCall(page, "sessions.list")) as { value: Meta[] }).value;
  expect(sessions.find((s) => s.title === "first idea (fork)")?.forkPending).toBeUndefined();
  const original = sessions.find((s) => s.title === "first idea")!;
  const snap = (
    (await hostCall(page, "sessions.get", { id: original.id })) as {
      value: { items: Array<{ text?: string }> };
    }
  ).value;
  expect(snap.items.some((i) => i.text?.includes("second idea"))).toBe(false);
});

test("Git: Claude writes the commit message, and explains a change in a new chat", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Ann Demo");
  git("config", "user.email", "ann@example.com");
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "Add cart");
  await writeFile(join(dir, "cart.ts"), "export const total = 2;\n");
  await hostCall(page, "projects.add", { path: dir });

  await page.keyboard.press("Control+Shift+G");
  await expect(page.getByTestId("git-file-unstaged-cart.ts")).toBeVisible();
  await page.getByTestId("git-write-message").click();
  await expect(page.getByTestId("git-commit-message")).toHaveValue(
    /^Apply the discount in the cart total\n\n/,
  );

  await page.getByTestId("git-file-unstaged-cart.ts").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Explain this change with Claude" }).click();
  await expect(page.getByTestId("composer-input")).toHaveValue(
    /^Explain the changes in cart\.ts \(git diff\)/,
  );
});

test("A failed script offers Ask Claude, with its output in a new chat", async ({ page, jigHome }) => {
  const dir = join(jigHome, "app");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "app",
      scripts: { check: `node -e "console.error('Error: the cart total is wrong'); process.exit(3)"` },
    }),
  );
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("project-app").dblclick();
  await page.getByTestId("script-run-check").click();

  const toast = page.getByTestId("toast").filter({ hasText: "failed" });
  await expect(toast).toContainText("Exit code 3", { timeout: 15000 });
  await toast.getByRole("button", { name: "Ask Claude" }).click();
  const input = page.getByTestId("composer-input");
  await expect(input).toHaveValue(/failed with exit code 3/);
  await expect(input).toHaveValue(/Error: the cart total is wrong/);
  await expect(page.getByTestId("terminal-ask-claude")).toBeVisible();
});

test("Try several ways: parallel attempts in worktrees, Claude judges, keep one", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Ann Demo");
  git("config", "user.email", "ann@example.com");
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "Add cart");
  await hostCall(page, "projects.add", { path: dir });

  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("Try a task several ways");
  await page.keyboard.press("Enter");
  await page.getByTestId("attempts-task").fill("please write feature.txt");
  await page.getByTestId("attempts-start").click();

  const attempts = page.getByTestId("attempts");
  for (const n of [1, 2, 3])
    await expect(attempts.getByTestId(`attempt-${n}`)).toContainText("1 file ·", { timeout: 20000 });
  await attempts.getByTestId("attempt-1").getByText("feature.txt").click();
  await expect(attempts.getByTestId("attempts-diff")).toContainText("+Written by the fake engine.");

  await attempts.getByTestId("attempts-judge").click();
  await expect(attempts.getByTestId("attempts-verdict")).toContainText("Claude recommends attempt 2");
  await expect(attempts.getByTestId("attempt-2")).toContainText("Claude's pick");

  await attempts.getByTestId("attempt-keep-2").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(attempts).toContainText("Kept attempt 2");
  expect(await readFile(join(dir, "feature.txt"), "utf8")).toContain("Written by the fake engine.");
  expect(git("worktree", "list").trim().split("\n")).toHaveLength(1);
  expect(git("branch", "--list", "jig/*").trim()).toBe("");
});
