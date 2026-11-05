import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, settledBox, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

test("whole-chat changes stay above the input, show a breakdown, and undo locally after commit/push", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "first.ts"), "one\ntwo\n");
  await writeFile(join(dir, "second.ts"), "alpha\nbeta\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Dev Example");
  git(dir, "config", "user.email", "dev@example.com");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Initial files");
  const remote = join(jigHome, "remote.git");
  git(jigHome, "init", "--bare", "-q", remote);
  git(dir, "remote", "add", "origin", remote);
  git(dir, "push", "-q", "-u", "origin", "main");
  await hostCall(page, "projects.add", { path: dir });
  // The overview card slides in beside the chat; this test measures the changes bar, not that.
  await hostCall(page, "config.update", { chat: { overview: false } });
  await page.keyboard.press("Control+N");
  const chat = page.locator("[data-tab-id]:not(.hidden)").getByTestId("chat");
  const composer = chat.getByTestId("composer");
  const before = await composer.boundingBox();
  const send = async (text: string, turns: number) => {
    await chat.getByTestId("composer-input").fill(text);
    await page.keyboard.press("Enter");
    await expect(chat.getByTestId("turn-result")).toHaveCount(turns, { timeout: 15000 });
  };
  await send("edit first.ts", 1);
  const bar = chat.getByTestId("chat-changes");
  await expect(bar).toContainText("1 file changed");
  expect(await composer.boundingBox()).toEqual(before);
  await send("edit second.ts", 2);
  await send("edit first.ts", 3);
  await expect(bar).toContainText("2 files changed");
  await expect(bar.getByTestId("chat-changes-lines")).toHaveText("+3−3");
  await expect(bar).not.toContainText("first.ts");
  await expect(bar.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
  await expect(chat.getByTestId("transcript").getByTestId("chat-changes")).toHaveCount(0);
  const position = await settledBox(bar);
  const inputPosition = await settledBox(composer);
  const scroll = chat.getByTestId("transcript");
  expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  expect(await bar.boundingBox()).toEqual(position);
  expect(await composer.boundingBox()).toEqual(inputPosition);
  await expect(bar).toBeVisible();
  await bar.getByTestId("chat-changes-open").click();
  const dialog = page.getByTestId("chat-changes-dialog");
  await expect(dialog).toContainText("Whole chat");
  const rows = dialog.getByTestId("chat-changed-file");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("first.ts");
  await expect(rows.nth(0).locator("td").nth(1)).toHaveText("2");
  await expect(rows.nth(0).locator("td").nth(2)).toHaveText("+2");
  await expect(rows.nth(1).locator("td").nth(2)).toHaveText("+1");
  // Measured once the dialog has finished opening.
  const firstCount = await settledBox(rows.nth(0).locator("td").nth(2));
  const secondCount = await settledBox(rows.nth(1).locator("td").nth(2));
  expect(firstCount!.x).toBe(secondCount!.x);
  expect(await composer.boundingBox()).toEqual(inputPosition);
  await expect(page.locator(".jig-modal-layer")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/chat-changes-breakdown.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await hostCall(page, "config.update", { chat: { view: "compact" } });
  await expect(bar).toContainText("2 files changed");
  await page.screenshot({ path: "test-results/chat-changes-bar.png" });
  // Undo restores locally even after commit/push, without changing either history.
  git(dir, "commit", "-q", "-am", "Chat edits");
  git(dir, "push", "-q");
  const committed = git(dir, "rev-parse", "HEAD").trim();
  await bar.getByTestId("chat-changes-undo").click();
  await expect(page.getByRole("dialog")).toContainText("existing commits and pushed history stay intact");
  await page.getByTestId("dialog-confirm").click();
  await expect.poll(() => readFile(join(dir, "first.ts"), "utf8")).toBe("one\ntwo\n");
  await expect.poll(() => readFile(join(dir, "second.ts"), "utf8")).toBe("alpha\nbeta\n");
  expect(git(dir, "rev-parse", "HEAD").trim()).toBe(committed);
  expect(git(remote, "rev-parse", "main").trim()).toBe(committed);
  expect(git(dir, "status", "--porcelain")).toContain("M first.ts");
  git(dir, "commit", "-q", "-am", "Restore the chat files");
  git(dir, "push", "-q");
  expect(git(remote, "show", "main:first.ts")).toBe("one\ntwo\n");
  expect(git(remote, "show", "main:second.ts")).toBe("alpha\nbeta\n");
  await page.reload();
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("chat-changes")).toContainText(
    "2 files changed",
  );
});
