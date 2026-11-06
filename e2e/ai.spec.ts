import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, openViewFromMenu, test } from "./fixtures";

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
  await page.getByTestId("rewind-menu").hover();
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

  await page.getByRole("button", { name: "Chat options" }).click();
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
  await page.getByRole("menuitem", { name: "Explain this change with Jig" }).click();
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
  await openViewFromMenu(page, "Scripts");
  const view = page.getByTestId("scripts-view");
  await view.getByRole("button", { name: "Run check" }).click({ timeout: 15000 });

  const toast = page.getByTestId("toast").filter({ hasText: "failed" });
  await expect(toast).toContainText("Exit code 3", { timeout: 15000 });
  await toast.getByRole("button", { name: "Ask Jig" }).click();
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

  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("Try a task several ways");
  await page.keyboard.press("Enter");
  await page.getByTestId("attempts-task").fill("please write feature.txt");
  await page.getByTestId("attempts-start").click();

  const attempts = page.getByTestId("attempts");
  for (const n of [1, 2, 3])
    await expect(attempts.getByTestId(`attempt-${n}`)).toContainText("1 file ·", { timeout: 20000 });
  await attempts.getByTestId("attempt-1").getByText("feature.txt").click();
  await expect(attempts.getByTestId("attempts-diff")).toContainText("+Written by the fake engine.");

  await attempts.getByTestId("attempts-judge").click();
  await expect(attempts.getByTestId("attempts-verdict")).toContainText("Jig recommends attempt 2");
  await expect(attempts.getByTestId("attempt-2")).toContainText("Jig's pick");

  await attempts.getByTestId("attempt-keep-2").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(attempts).toContainText("Kept attempt 2");
  expect(await readFile(join(dir, "feature.txt"), "utf8")).toContain("Written by the fake engine.");
  expect(git("worktree", "list").trim().split("\n")).toHaveLength(1);
  expect(git("branch", "--list", "jig/*").trim()).toBe("");
});

/** A repository with a committed cart.ts, then changes: a debug line in it and a new discount.ts. */
async function changedShop(page: Page, jigHome: string) {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Ann Demo");
  git("config", "user.email", "ann@example.com");
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "Add cart");
  await writeFile(join(dir, "cart.ts"), "export const total = 2;\nconsole.log(total);\n");
  await writeFile(join(dir, "discount.ts"), "export const off = 0.1;\n");
  await hostCall(page, "projects.add", { path: dir });

  return dir;
}

// One test per feature, so they run side by side.
test("Check before committing finds debug output", async ({ page, jigHome }) => {
  await changedShop(page, jigHome);
  // Check before committing finds the debug output.
  await page.keyboard.press("Control+Shift+G");
  await page.getByTestId("git-claude-menu").click();
  await page.getByRole("menuitem", { name: "Check before committing" }).click();
  await expect(page.getByTestId("git-findings")).toContainText("A console.log is left in.");
});

test("Walk me through the changes: a guided tour, file by file", async ({ page, jigHome }) => {
  await changedShop(page, jigHome);
  await page.keyboard.press("Control+Shift+G");
  // A guided tour of the changes.
  await page.getByTestId("git-claude-menu").click();
  await page.getByRole("menuitem", { name: "Walk me through the changes" }).click();
  const tour = page.getByTestId("tour");
  await expect(tour.getByTestId("tour-current")).toContainText("Step 1 of 2", { timeout: 15000 });
  await expect(tour.getByTestId("tour-hunk")).toContainText("+export const total = 2;");
  await tour.getByTestId("tour-next").click();
  await expect(tour.getByTestId("tour-current")).toContainText("discount.ts");
  await expect(tour.getByTestId("tour-hunk")).toContainText("+export const off = 0.1;");
});

test("Write my standup from the work done", async ({ page, jigHome }) => {
  await changedShop(page, jigHome);
  // Standup.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("Write my standup");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("standup-text")).toContainText("scripted standup");
  await page.keyboard.press("Escape");
});

test("Turn a chat into a tool: the builder gets what happened, in order", async ({ page, jigHome }) => {
  await changedShop(page, jigHome);
  // Turn a chat into a tool: the builder gets what happened, in order.
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("please write notes.txt");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat")).toContainText("I wrote notes.txt.", { timeout: 15000 });
  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByTestId("session-to-tool").click();
  await expect(page.getByTestId("build-goal")).toHaveValue(
    /I asked: please write notes\.txt\n- Jig changed .*notes\.txt/,
  );
});

test("Settings → AI features: each feature picks a provider and a model from that provider", async ({
  page,
}) => {
  await page.keyboard.press("Control+Comma");
  await page.getByTestId("settings-nav-ai").click();
  const row = page.getByTestId("ai-feature-commitMessage");
  // Nothing changes for existing users: Claude, on the model the feature used before.
  await expect(row.getByLabel("Commit message: provider")).toHaveValue("claude");
  await expect(row.getByLabel("Commit message: model")).toContainText("Default (Haiku)");
  // The fake engine counts as signed in to ChatGPT, so its option is enabled.
  await expect(page.getByTestId("ai-chatgpt-status")).toContainText("ChatGPT: the fake engine");
  const before = await row.boundingBox();
  await row.getByLabel("Commit message: provider").selectOption("chatgpt");
  // Only ChatGPT's models now: the families first (D-310), the feature's own picked, then versions.
  const model = row.getByLabel("Commit message: model");
  await expect(model.locator("option").first()).toHaveText("Sol (latest) · now GPT-6.1-Sol");
  await expect(model).toHaveValue("luna");
  await expect(model.locator("option:checked")).toHaveText("Luna (latest) · now GPT-6-Luna");
  await expect(model.locator("option").nth(3)).toHaveText("GPT-6.1-Sol");
  await expect(model).not.toContainText("Haiku");
  // Switching moves nothing.
  expect(await row.boundingBox()).toEqual(before);
  await expect
    .poll(async () => {
      const r = await hostCall(page, "config.get");
      return r.ok ? (r.value as { ai: Record<string, unknown> }).ai.commitMessage : undefined;
    })
    .toEqual({ provider: "chatgpt", model: "luna" });

  // Meeting notes follow the chats' provider by default, on Sonnet (D-424); the row says what it sends.
  const notes = page.getByTestId("ai-feature-meetingNotes");
  await expect(notes).toContainText("Sends the meeting's transcript to the chosen provider");
  await expect(notes.getByLabel("Meeting notes: provider")).toHaveValue("default");
  await expect(notes.getByLabel("Meeting notes: model")).toBeDisabled();
  await expect(notes.getByLabel("Meeting notes: model")).toContainText("Default (Sonnet on Claude)");
  if (process.env.JIG_SCREENSHOTS)
    await page.getByTestId("ai-features").screenshot({ path: ".tmp/shots/ai-features-meeting-notes.png" });
  await notes.getByLabel("Meeting notes: provider").selectOption("claude");
  await expect(notes.getByLabel("Meeting notes: model")).toBeEnabled();
  await expect
    .poll(async () => {
      const r = await hostCall(page, "config.get");
      return r.ok ? (r.value as { ai: Record<string, unknown> }).ai.meetingNotes : undefined;
    })
    .toEqual({ provider: "claude", model: "" });
});
