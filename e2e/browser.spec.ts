import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, hostCall, test } from "./fixtures";

const PAGE = `<!doctype html><html><head><title>Cart demo</title></head><body>
<h1>Cart</h1>
<button id="add" onclick="document.getElementById('count').textContent = String(Number(document.getElementById('count').textContent) + 1); console.error('added one')">Add item</button>
<p>Items: <span id="count">0</span></p>
<a href="#about">About</a>
</body></html>`;

test("Claude's browser: Claude opens a page, clicks and takes a screenshot you see live", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "index.html");
  await writeFile(file, PAGE);
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");

  await page.getByTestId("composer-input").fill(`browse ${pathToFileURL(file).href} at phone and desktop`);
  await page.keyboard.press("Enter");
  const chat = page.getByTestId("chat");
  await expect(chat).toContainText("I opened the page in my browser and took a screenshot.", {
    timeout: 20000,
  });
  // The screenshot comes back to Claude and shows in the chat.
  await expect(chat.getByTestId("tool-images").first()).toBeVisible();

  // Two sizes in one call: two images, and the window is back at its size after.
  await expect(chat.getByTestId("tool-images").nth(1).locator("img")).toHaveCount(2);
  expect(JSON.stringify(await hostCall(page, "browser.state"))).toContain('"width":1280');

  // The view opened by itself (browser.showWhenUsed is on by default) and shows the live page.
  const view = page.getByTestId("browser-view");
  await expect(view).toBeVisible();
  await expect(view.getByTestId("browser-frame")).toBeVisible({ timeout: 10000 });
  await expect(view.getByTestId("browser-address")).toHaveValue(/index\.html/);

  // Claude's click ran in the page (real mouse events), and the console error is counted.
  const count = await hostCall(page, "browser.console", {});
  expect(JSON.stringify(count)).toContain("added one");
  await expect(view.getByTestId("browser-errors")).toHaveText("1");
  await view.getByTestId("browser-console-toggle").click();
  await expect(view.getByTestId("browser-console")).toContainText("added one");

  await page.screenshot({
    path: "/tmp/claude-0/-home-user-jig/4879543c-4011-5b05-8342-5ec17a60e32a/scratchpad/browser.png",
  });
  // You can drive it too: the address bar navigates.
  const other = join(dir, "other.html");
  await writeFile(other, "<!doctype html><title>Other page</title><p>Hello from the other page</p>");
  await view.getByTestId("browser-address").fill(pathToFileURL(other).href);
  await view.getByTestId("browser-address").press("Enter");
  await expect
    .poll(async () => JSON.stringify(await hostCall(page, "browser.state")), { timeout: 10000 })
    .toContain("Other page");
});
