import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("an add-on is exported to a zip and imported back after showing its permissions", async ({
  app,
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "addons", "greeter");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "addon.json"),
    JSON.stringify({
      id: "greeter",
      name: "Greeter",
      version: "1.0.0",
      description: "Says hello",
      permissions: ["exec:git"],
      contributes: { views: [{ id: "main", title: "Greeter", region: "right", component: "View" }] },
    }),
  );
  await writeFile(
    join(dir, "ui.tsx"),
    'export function View() { return <div data-testid="greeter">hi</div>; }\n',
  );
  await hostCall(page, "addons.reload", {});

  // Export (the save dialog answers with a file in the test folder).
  const zip = join(jigHome, "greeter.jig-addon.zip");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as never;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as never;
  }, zip);
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await page.getByTestId("addon-export-greeter").click();
  await expect
    .poll(() =>
      stat(zip)
        .then((s) => s.size)
        .catch(() => 0),
    )
    .toBeGreaterThan(100);

  // Deleted (after asking), then imported back: the dialog says what it is and what it may do.
  await page.getByTestId("addon-delete-greeter").click();
  await expect(page.getByRole("dialog")).toContainText("Delete Greeter?");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("addon-greeter")).toHaveCount(0);
  await expect(stat(dir)).rejects.toThrow();
  expect(await hostCall(page, "addons.remove", { id: "git" })).toMatchObject({ ok: false });
  await page.getByTestId("addon-import").click();
  await expect(page.getByRole("dialog")).toContainText("Install Greeter 1.0.0?");
  await expect(page.getByRole("dialog")).toContainText("Says hello");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("addon-greeter")).toBeVisible({ timeout: 15000 });
  expect((await stat(join(dir, "ui.tsx"))).isFile()).toBe(true);

  // Importing it again offers to replace yours.
  await page.getByTestId("addon-import").click();
  await expect(page.getByRole("dialog")).toContainText('You already have "greeter"');
  await expect(page.getByTestId("dialog-confirm")).toHaveText("Replace");
});
