import { execFileSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, hostCall, test } from "./fixtures";

const icon = fileURLToPath(new URL("../apps/desktop/build/icon.png", import.meta.url));
// A 1×1 PNG.
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

test("Git shows a changed image before and after, and opens it in an image tab", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "site");
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  await writeFile(join(dir, "logo.png"), tiny);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Add logo");
  await copyFile(icon, join(dir, "logo.png"));
  await hostCall(page, "projects.add", { path: dir });

  await page.keyboard.press("Control+Shift+G");
  await page.getByTestId("git-file-unstaged-logo.png").click();
  const diff = page.getByTestId("git-image-diff");
  await expect(diff.getByTestId("git-image-before").getByTestId("image-size")).toHaveText("1 × 1 px");
  await expect(diff.getByTestId("git-image-after").getByTestId("image-size")).toHaveText("512 × 512 px");
  await page.getByRole("button", { name: "Open the image" }).click();
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("512 × 512 px");
  await expect(page.getByTestId("tab-jig.image")).toContainText("logo.png");
});

test("an image Claude reads shows as a thumbnail in its tool card", async ({ page, jigHome }) => {
  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await copyFile(icon, join(dir, "shot.png"));
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill(`look at ${join(dir, "shot.png")}`);
  await page.keyboard.press("Enter");
  const thumb = page.getByTestId("tool-card").getByTestId("image-thumb");
  await expect(thumb).toBeVisible({ timeout: 15000 });
  await thumb.getByRole("img").click();
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("512 × 512 px");
  // Non-images are refused by the host.
  const refused = await hostCall(page, "files.image", { path: join(dir, "notes.txt") });
  expect(refused).toMatchObject({ ok: false, error: { code: "not_image" } });
});
