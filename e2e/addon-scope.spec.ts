import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

/** An add-on whose data is per project: a note per project, kept with useStorage. */
async function notesAddon(jigHome: string) {
  const dir = join(jigHome, "addons", "notes");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "addon.json"),
    JSON.stringify({
      id: "notes",
      name: "Notes",
      storage: { scope: "project" },
      contributes: { views: [{ id: "main", title: "Notes", region: "right", component: "NotesView" }] },
    }),
  );
  await writeFile(
    join(dir, "ui.tsx"),
    `import { Input, useStorage } from "@jig/sdk/ui";
export function NotesView() {
  const [note, setNote] = useStorage("note", "");
  return <Input data-testid="note" value={note} onChange={(e) => void setNote(e.target.value)} />;
}
`,
  );
}

test("an add-on's data per project: each project has its own copy", async ({ page, jigHome }) => {
  await notesAddon(jigHome);
  for (const name of ["shop", "blog"]) await mkdir(join(jigHome, name), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  await hostCall(page, "projects.add", { path: join(jigHome, "blog") });
  await hostCall(page, "addons.reload", {});
  const state = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string; name: string }> };
  };
  const id = (name: string) => state.value.projects.find((p) => p.name === name)!.id;

  await hostCall(page, "projects.setActive", { id: id("shop") });
  // The view starts in the right sidebar: open it if it isn't showing.
  await expect
    .poll(async () => {
      const layout = (await hostCall(page, "layout.get")) as { value: { right: { views: string[] } } };
      return layout.value.right.views.includes("addon.notes.main");
    })
    .toBe(true);
  if (!(await page.getByTestId("region-right").isVisible())) {
    await page.getByTestId("layout-button").click();
    await page.getByRole("menuitem", { name: "Right sidebar" }).click();
  }
  await expect(page.getByTestId("view-tab-addon.notes.main")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("view-tab-addon.notes.main").click();
  await page.getByTestId("note").fill("Shop: ship on Friday");
  await expect
    .poll(
      async () =>
        (await hostCall(page, "addons.storageGet", {
          id: "notes",
          key: `@project(${id("shop")}) note`,
        })) as unknown,
    )
    .toMatchObject({ value: "Shop: ship on Friday" });

  // Another project: its own (empty) note; back again: the shop's.
  await hostCall(page, "projects.setActive", { id: id("blog") });
  await expect(page.getByTestId("note")).toHaveValue("");
  await page.getByTestId("note").fill("Blog: new theme");
  await hostCall(page, "projects.setActive", { id: id("shop") });
  await expect(page.getByTestId("note")).toHaveValue("Shop: ship on Friday");

  // Settings shows the scope.
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await expect(page.getByTestId("addon-notes")).toContainText("data per project");
});
