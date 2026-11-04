import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionMeta } from "../apps/desktop/src/shared/engine";
import { expect, hostCall, test } from "./fixtures";

// A new chat nobody has written in yet changes project from its header, and follows the project
// picked in the top bar; after its first message it stays where it is (D-341).
test("a new chat moves to another project until its first message", async ({ page, jigHome }) => {
  const shopDir = join(jigHome, "shop");
  const blogDir = join(jigHome, "blog");
  await mkdir(shopDir, { recursive: true });
  await mkdir(blogDir, { recursive: true });
  const shop = ((await hostCall(page, "projects.add", { path: shopDir })) as { value: { id: string } }).value;
  const blog = ((await hostCall(page, "projects.add", { path: blogDir })) as { value: { id: string } }).value;
  await hostCall(page, "projects.update", {
    id: blog.id,
    permissionMode: "acceptEdits",
    starters: ["Fix the typos in the latest post"],
  });
  await hostCall(page, "projects.setActive", { id: shop.id });
  await page.keyboard.press("Control+N");
  const label = page.getByTestId("chat-project");
  const welcome = page.getByTestId("chat-welcome");
  await expect(label).toContainText("shop");
  await expect(label).toHaveAttribute("aria-haspopup", "menu");

  // From the chat's header: its folder, defaults and starter prompts follow, and so does the top bar.
  const before = await label.boundingBox();
  await label.click();
  await page.getByTestId("chat-project-item-blog").click();
  await expect(label).toContainText("blog");
  await expect(welcome).toContainText(blogDir);
  await expect(welcome).toContainText("Fix the typos in the latest post");
  await expect(page.getByTestId("project-switcher")).toContainText("blog");
  const chat = async () =>
    ((await hostCall(page, "sessions.list")) as { value: SessionMeta[] }).value.find((m) => m.draft);
  await expect.poll(async () => (await chat())?.permissionMode).toBe("acceptEdits");

  // From the top bar.
  await page.getByTestId("project-switcher").click();
  await page.getByTestId("project-item-shop").click();
  await expect(label).toContainText("shop");
  await expect(welcome).toContainText(shopDir);

  // Started: plain text in the same box, and the top bar no longer moves it.
  await page.getByTestId("composer-input").fill("Hello");
  await page.keyboard.press("Enter");
  await expect(page.getByText("You said:")).toBeVisible({ timeout: 15000 });
  await expect(label).not.toHaveAttribute("aria-haspopup", "menu");
  const after = await label.boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);
  await hostCall(page, "projects.setActive", { id: blog.id });
  await expect(page.getByTestId("project-switcher")).toContainText("blog");
  await expect(label).toContainText("shop");
});
