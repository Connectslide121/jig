import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

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
  await view.getByTestId("note-1").click();
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
  await view.getByTestId("note-1").click();
  await hostCall(page, "projects.setActive", { id: other.value.id });
  await expect(dialog).toHaveCount(0);
  await expect(view).toContainText("No notes yet");
  await hostCall(page, "projects.setActive", { id: firstId });
  await page.reload();
  await expect(view).toContainText("Prices include VAT");
});

test("Notes the Notes add-on kept move into the project's knowledge on the next start", async () => {
  const jigHome = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  try {
    const dir = join(jigHome, "shop");
    await mkdir(dir, { recursive: true });
    let app = await launchJig(jigHome);
    let page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const added = (await hostCall(page, "projects.add", { path: dir })) as { value: { id: string } };
    await app.close();
    const old = join(jigHome, "addon-data", "notes.json");
    await mkdir(join(jigHome, "addon-data"), { recursive: true });
    const note = { kind: "note", by: "you", createdAt: 1 };
    await writeFile(
      old,
      JSON.stringify({
        [`@project(${added.value.id}) notes`]: [
          { ...note, id: "1", text: "Totals include VAT" },
          { ...note, id: "2", kind: "wait", text: "Waiting on the API review", by: "claude" },
          { ...note, id: "3", kind: "link", text: "Design", url: "https://design.example" },
        ],
      }),
    );

    app = await launchJig(jigHome);
    page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const knowledge = page.getByTestId("knowledge-notes").first();
    await expect(knowledge).toContainText("Totals include VAT");
    await expect(knowledge).toContainText("Waiting on the API review");
    await expect(knowledge).toContainText("by Claude");
    await page.screenshot({ path: test.info().outputPath("project-knowledge.png") });
    await page.getByTestId("goto-button").click();
    await page.getByTestId("goto-input").fill("this project's notes");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("notes-view")).toContainText("1 open");
    await page.screenshot({ path: test.info().outputPath("project-notes-view.png") });
    expect(await readFile(`${old}.migrated`, "utf8")).toContain("Totals include VAT");
    await app.close();
  } finally {
    // Windows: Electron's helpers can hold files in the profile for a moment after it closes.
    await rm(jigHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
