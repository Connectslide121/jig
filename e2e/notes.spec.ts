import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Project notes: shared across chats, isolated across projects, edited in stable modals", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("this project's notes");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("notes-view");
  await expect(view).toContainText("No notes yet");

  // A note by hand.
  const header = view.getByTestId("note-add");
  const before = await header.boundingBox();
  await header.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("note-kind").locator("option")).toHaveText(["Waiting on", "Note", "Link"]);
  expect(await header.boundingBox()).toEqual(before);
  await dialog.getByTestId("note-input").fill("Totals include VAT");
  await dialog.getByTestId("note-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(view).toContainText("Totals include VAT");

  // Claude adds one through its tool; it shows here, marked as Claude's.
  await page
    .getByTestId("composer-input")
    .fill("remember in the notes that pipeline improvements await the migration");
  await page.keyboard.press("Enter");
  await expect(view).toContainText(
    "Pipeline improvements are deferred until the Jenkins-to-Azure-DevOps migration is complete",
    { timeout: 15000 },
  );
  await expect(view).toContainText("by Claude");
  await expect(view).toContainText("1 open");

  // Ticking the wait off clears it.
  await view.getByTestId("note-toggle-2").click();
  await expect(view).toContainText("2 notes");

  // Another chat in the same project sees both notes.
  await page.keyboard.press("Control+N");
  await expect(view).toContainText("Totals include VAT");
  await expect(view).toContainText("migration is complete");
  await view.getByTestId("note-1").hover();
  await view.getByTestId("note-1").getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByTestId("note-input").fill("Prices include VAT");
  await dialog.getByTestId("note-save").click();
  await expect(view).toContainText("Prices include VAT");
  await page.screenshot({ path: "test-results/project-notes.png" });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const firstId = projects.value.projects[0]!.id;
  const other = (await hostCall(page, "projects.create", { name: "Blog", path: dir })) as {
    value: { id: string };
  };
  await hostCall(page, "projects.setActive", { id: other.value.id });
  await expect(view).toContainText("No notes yet");
  await expect(view).not.toContainText("Prices include VAT");
  await hostCall(page, "projects.setActive", { id: firstId });
  await expect(view).toContainText("Prices include VAT");
  await view.getByTestId("note-1").hover();
  await view.getByTestId("note-1").getByRole("button", { name: "Edit", exact: true }).click();
  await hostCall(page, "projects.setActive", { id: other.value.id });
  await expect(dialog).toHaveCount(0);
  await expect(view).toContainText("No notes yet");
  await hostCall(page, "projects.setActive", { id: firstId });
  await page.reload();
  await expect(view).toContainText("Prices include VAT");
});
