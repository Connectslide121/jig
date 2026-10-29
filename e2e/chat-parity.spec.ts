import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

async function openChat(page: Page, jigHome: string) {
  const dir = join(jigHome, "shop");
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "cart.ts"), "export const total = 1;\nexport const tax = 2;\n");
  await writeFile(join(dir, "README.md"), "# Shop\n");
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const input = page.getByTestId("composer-input");
  await expect(input).toBeVisible();
  return { dir, input, chat: page.getByTestId("chat") };
}

const turnDone = async (page: Page, count: number) =>
  expect(page.getByTestId("turn-result")).toHaveCount(count, { timeout: 15000 });

test("composer: / commands, @ files, ! shell, # memory, history, Shift+Tab", async ({ page, jigHome }) => {
  const { dir, input, chat } = await openChat(page, jigHome);

  // `/` lists Claude Code's commands and skills; a builtin's output shows in the chat.
  await input.fill("/us");
  const picker = page.getByTestId("composer-picker");
  await expect(picker).toContainText("/usage");
  // A command without arguments runs on Enter, like in Claude Code.
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");
  await expect(chat).toContainText("/usage (fake): Show session cost", { timeout: 15000 });
  await turnDone(page, 1);

  // One with arguments goes into the box to complete; a skill answers like Claude.
  await input.fill("/expl");
  await expect(picker.getByTestId("picker-item").first()).toContainText("/explain-code");
  await page.keyboard.press("Tab");
  await expect(input).toHaveValue("/explain-code ");
  await input.fill("/expl");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await input.fill("/mcp");
  await expect(picker.getByTestId("picker-item").first()).toContainText("/mcp");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mcp-dialog")).toBeVisible();
  await expect(page.getByTestId("mcp-server")).toHaveCount(2);
  await expect(page.getByTestId("mcp-dialog")).toContainText("needs sign-in");
  await page.keyboard.press("Escape");

  // `@` finds files and folders.
  await input.fill("look at @cart");
  await expect(picker.getByTestId("picker-item").first()).toContainText("src/cart.ts");
  await page.keyboard.press("Tab");
  await expect(input).toHaveValue("look at @src/cart.ts ");

  // `!` runs a shell command; Claude gets the output with the next message.
  await input.fill("! echo shell-output-42");
  await expect(page.getByTestId("composer-mode")).toContainText("Shell");
  await page.keyboard.press("Enter");
  const shell = page.getByTestId("shell-card");
  await expect(shell).toContainText("shell-output-42");
  await expect(shell).toContainText("with your next message");
  await input.fill("what did it print?");
  await page.keyboard.press("Enter");
  await expect(chat).toContainText("<bash-input>echo shell-output-42</bash-input>", { timeout: 15000 });
  await expect(shell).toContainText("Claude saw this");
  await turnDone(page, 2);

  // `#` remembers a line in CLAUDE.md.
  await input.fill("# always use pnpm");
  await page.keyboard.press("Enter");
  await page.getByTestId("remember-project").click();
  await expect
    .poll(() => readFile(join(dir, "CLAUDE.md"), "utf8").catch(() => ""))
    .toContain("- always use pnpm");

  // ↑ brings back what you sent.
  await input.fill("");
  await input.press("ArrowUp");
  await expect(input).toHaveValue("what did it print?");
  await input.press("ArrowUp");
  await expect(input).toHaveValue("/usage");
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("");

  // Shift+Tab goes through the permission modes; a new chat starts in plan mode (the default).
  await expect(page.getByTestId("composer-mode")).toContainText("Plan only");
  await input.press("Shift+Tab");
  await expect(page.getByTestId("composer-mode")).toHaveCount(0);
  await input.press("Shift+Tab");
  await expect(page.getByTestId("composer-mode")).toContainText("Accept edits");
  await input.press("Shift+Tab");
  await expect(page.getByTestId("composer-mode")).toContainText("Plan only");
});

test("transcript: todos, plan approval, subagent progress, diffs, background tasks", async ({
  page,
  jigHome,
}) => {
  const { dir, input, chat } = await openChat(page, jigHome);

  await input.fill("make a todo list and work through it");
  await page.keyboard.press("Enter");
  await turnDone(page, 1);
  const todos = chat.getByTestId("todo-list").last();
  await expect(todos.locator("[data-status=completed]")).toHaveCount(3);
  // Everything done: no panel above the composer.
  await expect(page.getByTestId("todo-panel")).toHaveCount(0);

  await input.fill("make a plan for discounts");
  await page.keyboard.press("Enter");
  const plan = page.getByTestId("plan-card");
  await expect(plan).toContainText("Apply it in total()");
  await plan.getByTestId("plan-approve-auto").click();
  await expect(chat).toContainText("Starting on the plan (mode: acceptEdits)", { timeout: 15000 });
  await expect(page.getByTestId("permission-menu")).toContainText("Accept edits");
  await turnDone(page, 2);

  await input.fill("use a subagent to find the cart");
  await page.keyboard.press("Enter");
  await turnDone(page, 3);
  await expect(chat.getByTestId("task-progress")).toContainText("2 tool uses · 8.2k tokens · 3.1 s");

  await input.fill("edit src/cart.ts");
  await page.keyboard.press("Enter");
  await turnDone(page, 4);
  const diff = chat.getByTestId("tool-diff");
  await expect(diff).toContainText("+export const total = 1; (edited)");
  await expect(chat.getByTestId("tool-card").last()).toContainText("+1 −1");
  expect(await readFile(join(dir, "src", "cart.ts"), "utf8")).toContain("(edited)");

  await input.fill("start a background job");
  await page.keyboard.press("Enter");
  const background = page.getByTestId("background-tasks");
  await expect(background).toContainText("Watch and rebuild");
  await page.getByTestId("background-stop").click();
  await expect(background).toHaveCount(0);
});

test("rewind: edit an earlier message and send it again; find in chat; effort", async ({ page, jigHome }) => {
  const { input, chat } = await openChat(page, jigHome);
  await input.fill("first message");
  await page.keyboard.press("Enter");
  await turnDone(page, 1);
  await input.fill("second message");
  await page.keyboard.press("Enter");
  await turnDone(page, 2);

  // Find in chat.
  await page.keyboard.press("Control+f");
  await page.getByTestId("find-input").fill("message");
  await expect(page.getByTestId("find-count")).toHaveText(/of [0-9]+/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("find-bar")).toHaveCount(0);

  // Rewind to before the second message: it goes back into the message box.
  const second = chat.getByTestId("user-message").nth(1);
  await second.hover();
  await second.getByTestId("user-message-menu").click();
  await page.getByTestId("rewind-edit").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(input).toHaveValue("second message");
  await expect(chat.getByTestId("user-message")).toHaveCount(1);
  await expect(chat).toContainText("Rewound to before");
  await input.fill("second message, edited");
  await page.keyboard.press("Enter");
  await expect(chat).toContainText("You said: second message, edited", { timeout: 15000 });

  // Effort, from the model menu (Claude Code's own model list).
  await page.getByTestId("model-menu").click();
  await page.getByTestId("effort-menu").hover();
  await page.getByTestId("effort-high").click();
  await expect(page.getByTestId("model-menu")).toContainText("high");
});

test("send now: a message typed while Claude works joins the running turn", async ({ page, jigHome }) => {
  const { input, chat } = await openChat(page, jigHome);
  await input.fill("slow answer please");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("composer-stop")).toBeVisible();
  await input.fill("also mention the footer");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("queue")).toHaveCount(0);
  await expect(chat.getByTestId("user-message")).toHaveCount(2);
  await page.getByTestId("composer-stop").click();
});
