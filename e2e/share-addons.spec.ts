import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
  await expect(page.getByTestId("addon-share")).toBeVisible();
  await page.getByTestId("addon-share-go").click();
  await expect(page.getByTestId("addon-share")).toHaveCount(0);
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

/** D-249: an installed add-on keeps its original, shows "edited" once changed, and restores. */
test("an installed add-on you changed is marked edited and restores to the original", async ({
  page,
  jigHome,
}) => {
  const gallery = join(jigHome, "..", `gallery-${Date.now()}`);
  const source = join(gallery, "addons", "hello");
  await mkdir(source, { recursive: true });
  const view = 'export function View() { return <div data-testid="hello">hi</div>; }\n';
  await writeFile(
    join(source, "addon.json"),
    JSON.stringify({
      id: "hello",
      name: "Hello",
      version: "1.0.0",
      contributes: { views: [{ id: "main", title: "Hello", region: "right", component: "View" }] },
    }),
  );
  await writeFile(join(source, "ui.tsx"), view);
  await hostCall(page, "config.update", { addonGallery: { sources: [gallery] } });
  expect(await hostCall(page, "addons.galleryInstall", { source: gallery, id: "hello" })).toMatchObject({
    ok: true,
  });

  // Changed after installing (as the builder or an editor would): marked edited, then restored.
  const mine = join(jigHome, "addons", "hello", "ui.tsx");
  await writeFile(mine, view.replace("hi", "changed"));
  await hostCall(page, "addons.reload", { id: "hello" });
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await expect(page.getByTestId("addon-edited-hello")).toBeVisible();
  await page.getByTestId("addon-restore-hello").click();
  await expect(page.getByRole("dialog")).toContainText("Restore Hello to the original?");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("addon-edited-hello")).toHaveCount(0);
  expect(await readFile(mine, "utf8")).toBe(view);

  // Shared into the folder gallery as a separate copy: a new id and name beside the original.
  await page.getByTestId("addon-export-hello").click();
  await page.getByTestId("addon-share-target").selectOption(gallery);
  await page.getByRole("switch", { name: "Share as a separate add-on" }).click();
  await page.getByTestId("addon-share-name").fill("Hello Again");
  await page.getByTestId("addon-share-go").click();
  await expect(page.getByTestId("addon-share")).toHaveCount(0);
  const copy = JSON.parse(await readFile(join(gallery, "addons", "hello-again", "addon.json"), "utf8"));
  expect(copy).toMatchObject({ id: "hello-again", name: "Hello Again" });
});
