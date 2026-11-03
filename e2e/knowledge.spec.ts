import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { expect, hostCall, test } from "./fixtures";
import { makePdf } from "./makePdf";

test("Knowledge: files kept with a project, read by Claude in its chats, removed", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const style = join(jigHome, "style.md");
  await writeFile(style, "# Style\n\nRelease notes are in Swedish.\n");
  const project = ((await hostCall(page, "projects.add", { path: dir })) as { value: { id: string } }).value;
  await page.emulateMedia({ reducedMotion: "reduce" });

  const card = page.getByTestId("home-knowledge").first();
  await expect(card).toContainText("Specs, style guides and other longer texts");
  // Notes are part of the knowledge: added from the card, shown in it.
  await card.getByTestId("knowledge-add-note").click();
  await page.getByRole("dialog").getByTestId("note-input").fill("Totals include VAT");
  await page.getByRole("dialog").getByTestId("note-save").click();
  await expect(card.getByTestId("knowledge-notes")).toContainText("Totals include VAT");
  expect(await hostCall(page, "notes.list", { projectId: project.id })).toMatchObject({
    value: [{ id: "1", kind: "note", text: "Totals include VAT", by: "you" }],
  });
  await hostCall(page, "knowledge.addFiles", { projectId: project.id, paths: [style] });
  await expect(card.getByTestId("knowledge-doc")).toHaveCount(1);
  await expect(card.getByTestId("knowledge-doc")).toContainText("style.md");
  // A PDF is read as text, page by page.
  const pdf = join(jigHome, "pricing.pdf");
  await writeFile(pdf, makePdf(["Prices include VAT."]));
  await hostCall(page, "knowledge.addFiles", { projectId: project.id, paths: [pdf] });
  await expect(card.getByTestId("knowledge-doc")).toHaveCount(2);
  const pdfDoc = (
    (await hostCall(page, "knowledge.list", { projectId: project.id })) as {
      value: Array<{ id: string; name: string }>;
    }
  ).value.find((d) => d.name === "pricing.pdf")!;
  const read = (await hostCall(page, "knowledge.read", { projectId: project.id, id: pdfDoc.id })) as {
    value: { text: string };
  };
  expect(read.value.text).toBe("Prices include VAT.");
  await card.screenshot({ path: test.info().outputPath("knowledge.png") });

  // A chat in the project is told about it and reads it with jig_knowledge_read.
  await page.getByTestId("home-new-chat").first().click();
  await page.getByTestId("composer-input").fill("check the knowledge");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-testid=transcript]:visible")).toContainText(
    "Release notes are in Swedish",
    {
      timeout: 15000,
    },
  );

  // Removing it from the knowledge.
  const docs = (await hostCall(page, "knowledge.list", { projectId: project.id })) as {
    value: Array<{ id: string }>;
  };
  for (const d of docs.value) await hostCall(page, "knowledge.remove", { projectId: project.id, id: d.id });
  const after = (await hostCall(page, "knowledge.list", { projectId: project.id })) as { value: unknown[] };
  expect(after.value).toEqual([]);
});

test("Knowledge: import claude.ai projects from the data export zip", async ({ page, jigHome }) => {
  const dir = join(jigHome, "work");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "workspaces.add", { path: dir });
  const zip = join(jigHome, "data-export.zip");
  const projects = [
    {
      uuid: "p-shop",
      name: "Contoso shop",
      description: "",
      prompt_template: "Answer in Swedish.",
      docs: [{ filename: "pricing.md", content: "# Pricing\n\nPrices include VAT." }],
    },
    { uuid: "p-start", name: "How to use Claude", is_starter_project: true, docs: [] },
  ];
  await writeFile(
    zip,
    zipSync({
      "conversations.json": strToU8("[]"),
      "projects.json": strToU8(JSON.stringify(projects)),
    }),
  );
  // The zip is read by path, as a drop or Browse… gives it.
  const opened = (await hostCall(page, "claudeImport.open", { path: zip })) as {
    value: { token: string; projects: Array<{ uuid: string; name: string; docs: unknown[] }> };
  };
  expect(opened.value.projects.map((p) => [p.name, p.docs.length])).toEqual([["Contoso shop", 1]]);
  const applied = (await hostCall(page, "claudeImport.apply", {
    token: opened.value.token,
    uuids: ["p-shop"],
    path: dir,
  })) as { value: { projectIds: string[] } };
  const id = applied.value.projectIds[0]!;
  const list = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string; name: string; instructions?: string }> };
  };
  expect(list.value.projects.find((p) => p.id === id)).toMatchObject({
    name: "Contoso shop",
    instructions: "Answer in Swedish.",
  });
  const docs = (await hostCall(page, "knowledge.list", { projectId: id })) as {
    value: Array<{ name: string; source: string }>;
  };
  expect(docs.value).toMatchObject([{ name: "pricing.md", source: "claude.ai" }]);
});

test("Knowledge: the import dialog shows the steps and a fixed drop zone", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("Import from claude.ai");
  await page.keyboard.press("Enter");
  const dialog = page.getByTestId("claude-import");
  await expect(dialog).toContainText("Export data");
  await expect(dialog.getByTestId("claude-import-browse")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("import.png") });
});
