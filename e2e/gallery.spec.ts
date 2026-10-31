import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./fixtures";

/** The add-on gallery (D-179): a folder source, browse, install after seeing the permissions. */
test("installs an add-on from a gallery folder", async ({ page, jigHome }) => {
  const gallery = join(jigHome, "..", `gallery-${Date.now()}`);
  const dir = join(gallery, "addons", "hello-gallery");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "addon.json"),
    JSON.stringify({
      id: "hello-gallery",
      name: "Hello gallery",
      version: "1.0.0",
      description: "Says hello from a gallery",
      permissions: ["net"],
    }),
  );

  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("Add-on gallery");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("addon-gallery")).toBeVisible();

  await page.getByTestId("gallery-add-source").click();
  await page.getByTestId("dialog-input").fill(gallery);
  await page.getByTestId("dialog-confirm").click();

  const row = page.getByTestId("gallery-addon-hello-gallery");
  await expect(row).toContainText("Hello gallery");
  await expect(row).toContainText("1.0.0");
  await page.getByTestId("gallery-install-hello-gallery").click();
  await expect(page.getByTestId("dialog")).toContainText("Hello gallery");
  await page.getByTestId("dialog-confirm").click();

  await expect(page.getByTestId("gallery-install-hello-gallery")).toHaveText("Installed");
  const installed = JSON.parse(
    await readFile(join(jigHome, "addons", "hello-gallery", "addon.json"), "utf8"),
  );
  expect(installed.name).toBe("Hello gallery");
});
