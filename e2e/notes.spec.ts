import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Notes: the chat's notes, written by you and by Claude, ticked off, per chat", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("this chat's notes");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("notes-view");
  await expect(view).toContainText("No notes yet");

  // A note by hand.
  await view.getByTestId("note-input").fill("Totals include VAT");
  await view.getByTestId("note-add").click();
  await expect(view).toContainText("Totals include VAT");

  // Claude adds one through its tool; it shows here, marked as Claude's.
  await page.getByTestId("composer-input").fill("remember in the notes that we wait on the API review");
  await page.keyboard.press("Enter");
  await expect(view).toContainText("the API review from the backend team", { timeout: 15000 });
  await expect(view).toContainText("by Claude");
  await expect(view).toContainText("1 open");

  // Ticking the wait off clears it.
  await view.getByTestId("note-toggle-2").click();
  await expect(view).toContainText("2 notes");

  // Another chat has its own notes.
  await page.keyboard.press("Control+N");
  await expect(view).toContainText("No notes yet");
});
