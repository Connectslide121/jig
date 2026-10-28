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

test("screenshots pasted or dropped into the composer go to Claude with the message", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "demo2");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const input = page.getByTestId("composer-input");
  await input.focus();
  // Paste a screenshot (an image on the clipboard).
  await input.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "image.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, tiny.toString("base64"));
  // And drop another one.
  await page.getByTestId("composer").evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "drop.png", { type: "image/png" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, tiny.toString("base64"));
  await expect(page.getByTestId("composer").getByTestId("chat-image")).toHaveCount(2);
  // Remove one, then send with text.
  await page.getByTestId("composer").getByRole("button", { name: "Remove the image" }).first().click();
  await expect(page.getByTestId("composer").getByTestId("chat-image")).toHaveCount(1);
  await input.fill("what is this?");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("user-message").getByTestId("chat-image")).toHaveCount(1);
  await expect(page.getByTestId("user-message")).toContainText("what is this?");
  await expect(page.getByTestId("assistant-message").last()).toContainText("I see 1 image.");
  await expect(page.getByTestId("composer").getByTestId("chat-image")).toHaveCount(0);
  // The thumbnail opens the image tab.
  await page.getByTestId("user-message").getByTestId("chat-image").getByRole("button").click();
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("1 × 1 px");
  // Unsupported types are refused with a message.
  await input.evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId("toast").last()).toContainText("PNG, JPEG, GIF and WebP");
});
