import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("a terminal Claude started tells its chat when it ends", async ({ page, jigHome }) => {
  const path = join(jigHome, "app");
  await mkdir(path, { recursive: true });
  await hostCall(page, "projects.add", { path });
  await page.keyboard.press("Control+N");
  const chat = page.getByTestId("chat");
  await page.getByTestId("composer-input").fill("build it in a jig terminal");
  await page.keyboard.press("Enter");
  await expect(chat).toContainText("I'll hear when it ends.", { timeout: 15000 });
  // The command exits by itself: Jig sends the chat one line (not a message from you), a new turn.
  const notice = chat.getByTestId("jig-message");
  await expect(notice).toContainText('Terminal "Build" finished', { timeout: 15000 });
  await expect(notice).toContainText("Sent by Jig");
  await expect(notice).toHaveAttribute("title", /build finished/);
  await expect(chat.getByTestId("user-message")).toHaveCount(1);

  // D-373: the chat has its exit notice, so the terminal closes, but not while you look at it.
  const row = page.getByTestId("terminal-tab-Claude: Build");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await page
    .getByTestId("view-tabs-bottom")
    .locator("[data-view-id]:not([data-view-id='jig.terminals'])")
    .first()
    .click();
  await page.getByTestId("view-tabs-bottom").locator("[data-view-id='jig.terminals']").click();
  await expect(row).toHaveCount(0);
});

test("a chat's terminals close when the chat is archived", async ({ page, jigHome }) => {
  const path = join(jigHome, "app");
  await mkdir(path, { recursive: true });
  const project = (await hostCall(page, "projects.add", { path })) as { value: { id: string } };
  const created = (await hostCall(page, "sessions.create", { projectId: project.value.id, cwd: path })) as {
    value: { id: string };
  };
  // The chat's terminal shows itself, so it stays open after it finishes while you look at it.
  await hostCall(page, "sessions.send", { id: created.value.id, text: "build it in a jig terminal" });
  const terminals = async () =>
    ((await hostCall(page, "terminals.list")) as { value: Array<{ sessionId?: string }> }).value.filter(
      (t) => t.sessionId === created.value.id,
    ).length;
  await expect.poll(terminals, { timeout: 15000 }).toBe(1);
  await hostCall(page, "sessions.archive", { id: created.value.id, archived: true });
  await expect.poll(terminals).toBe(0);
});
