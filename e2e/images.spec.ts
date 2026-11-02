import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
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
  await expect(diff.getByTestId("git-image-after").getByTestId("image-size")).toHaveText("1024 × 1024 px");
  const after = diff.getByTestId("git-image-after");
  const toolbar = after.getByTestId("image-toolbar");
  const toolbarBox = await toolbar.boundingBox();
  await after.getByRole("button", { name: "Actual size", exact: true }).click();
  await after.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(after.getByTestId("image-zoom")).toHaveText("125%");
  await after.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(after.getByTestId("image-zoom")).toHaveText("100%");
  await after.getByRole("button", { name: "Image zoom", exact: true }).click();
  await page.getByRole("menuitem", { name: "50%", exact: true }).click();
  await expect
    .poll(async () => (await after.getByTestId("image-preview-img").boundingBox())?.width)
    .toBe(512);
  await expect(diff.getByTestId("git-image-before").getByTestId("image-zoom")).toHaveText("Fit");
  expect(await toolbar.boundingBox()).toEqual(toolbarBox);
  await after.getByRole("button", { name: "Fit image", exact: true }).click();
  await expect(after.getByTestId("image-zoom")).toHaveText("Fit");
  await page.getByRole("button", { name: "Open the image" }).click();
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("1024 × 1024 px");
  await expect(page.getByTestId("tab-jig.image")).toContainText("logo.png");
  const imageTab = page.getByTestId("image-tab");
  await imageTab.getByRole("button", { name: "Image zoom", exact: true }).click();
  await page.getByRole("menuitem", { name: "200%", exact: true }).click();
  await expect
    .poll(async () => (await imageTab.getByTestId("image-preview-img").boundingBox())?.width)
    .toBe(2048);
  expect(await imageTab.getByTestId("image-viewport").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await imageTab.getByTestId("image-viewport").dispatchEvent("wheel", { deltaY: 100, ctrlKey: true });
  await expect(imageTab.getByTestId("image-zoom")).toHaveText("150%");
  await imageTab.getByRole("button", { name: "Fit image", exact: true }).click();
  if (process.env.JIG_SCREENSHOTS) {
    await page.screenshot({
      path: "apps/desktop/src/renderer/features/about/shots/image-zoom.jpg",
      type: "jpeg",
      quality: 90,
    });
  }
  // Preview uses the same image controls, including for SVG files.
  await page.getByTestId("git-file-unstaged-logo.png").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Preview", exact: true }).click();
  const preview = page.locator("[data-tab-id]:not(.hidden)").getByTestId("preview");
  await expect(preview.getByTestId("image-zoom")).toHaveText("Fit");
  await preview.getByRole("button", { name: "Actual size", exact: true }).click();
  await preview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(preview.getByTestId("image-zoom")).toHaveText("125%");
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
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("1024 × 1024 px");
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
  await expect(page.getByTestId("composer").getByTestId("chat-attachment")).toHaveCount(2);
  // Remove one, then send with text.
  await page.getByTestId("composer").getByRole("button", { name: "Remove the attachment" }).first().click();
  await expect(page.getByTestId("composer").getByTestId("chat-attachment")).toHaveCount(1);
  await input.fill("what is this?");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("user-message").getByTestId("chat-attachment")).toHaveCount(1);
  await expect(page.getByTestId("user-message")).toContainText("what is this?");
  await expect(page.getByTestId("assistant-message").last()).toContainText("I see 1 image.");
  await expect
    .poll(async () => {
      const activityDir = join(jigHome, "activity");
      const files = await readdir(activityDir).catch(() => []);
      return (await Promise.all(files.map((file) => readFile(join(activityDir, file), "utf8")))).join("\n");
    })
    .toContain('"imageAttachments":"1"');
  await expect(page.getByTestId("composer").getByTestId("chat-attachment")).toHaveCount(0);
  // The thumbnail opens the image tab.
  await page.getByTestId("user-message").getByTestId("chat-attachment").getByRole("button").click();
  await expect(page.getByTestId("image-tab").getByTestId("image-size")).toHaveText("1 × 1 px");
  // Unsupported types are refused with a message.
  await input.evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "clip.mp4", { type: "video/mp4" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId("toast").last()).toContainText("Claude can take images, PDFs, Word");
});

test("PDFs, Word, Excel and PowerPoint files can be attached as context", async ({ page, jigHome }) => {
  const dir = join(jigHome, "docs");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const docx = zipSync({
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Plan</w:t></w:r></w:p></w:body></w:document>",
    ),
  });
  const files = [
    { name: "spec.pdf", type: "application/pdf", b64: Buffer.from("%PDF-1.4 fake").toString("base64") },
    {
      name: "plan.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      b64: Buffer.from(docx).toString("base64"),
    },
    { name: "old.doc", type: "application/msword", b64: "AAAA" },
  ];
  await page.getByTestId("composer").evaluate((el, list) => {
    const data = new DataTransfer();
    for (const f of list)
      data.items.add(
        new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }),
      );
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, files);
  const chips = page.getByTestId("composer").getByTestId("chat-attachment");
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveAttribute("data-kind", "pdf");
  await expect(chips.nth(1)).toHaveAttribute("data-kind", "office");
  await expect(chips.nth(1)).toContainText("plan.docx");
  await expect(page.getByTestId("toast").last()).toContainText("Save it as .docx");
  await page.getByTestId("composer-input").fill("summarise these");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("assistant-message").last()).toContainText("I read spec.pdf, plan.docx.");
  await expect(page.getByTestId("user-message").getByTestId("chat-attachment")).toHaveCount(2);
});
