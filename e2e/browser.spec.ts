import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { browserPageChat, expect, hostCall, test } from "./fixtures";

const PAGE = `<!doctype html><html><head><title>Cart demo</title></head><body>
<h1>Cart</h1>
<button id="add" onclick="document.getElementById('count').textContent = String(Number(document.getElementById('count').textContent) + 1); console.error('added one')">Add item</button>
<p>Items: <span id="count">0</span></p>
<a href="#about">About</a><input id="login" aria-label="Sign-in code">
</body></html>`;

test("Claude's browser: Claude opens a page, clicks and takes a screenshot you see live", async ({
  page,
  app,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "index.html");
  await writeFile(file, PAGE);
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");

  await page
    .getByTestId("composer-input")
    .fill(`browse ${pathToFileURL(file).href} at phone and desktop and check the requests`);
  await page.keyboard.press("Enter");
  const chat = page.getByTestId("chat");
  await expect(chat).toContainText("I opened the page in my browser and took a screenshot.", {
    timeout: 20000,
  });
  // The screenshot comes back to Claude and shows in the chat.
  await expect(chat.getByTestId("tool-images").first()).toBeVisible();

  // Two sizes in one call: two images, and the window is back at its size after.
  await expect(chat.getByTestId("tool-images").nth(1).locator("img")).toHaveCount(2);
  const chatId = await browserPageChat(page);
  expect(JSON.stringify(await hostCall(page, "browser.state", { chatId }))).toContain('"width":1280');

  // The view opened by itself (browser.showWhenUsed is on by default) and shows the live page.
  const view = page.getByTestId("browser-view");
  await expect(view).toBeVisible();
  await expect(view.getByTestId("browser-frame")).toBeVisible({ timeout: 10000 });
  await expect(view.getByTestId("browser-address")).toHaveValue(/index\.html/);

  // Claude's click ran in the page (real mouse events), and the console error is counted.
  const count = await hostCall(page, "browser.console", { chatId });
  expect(JSON.stringify(count)).toContain("added one");
  await expect(view.getByTestId("browser-errors")).toHaveText("1");
  await view.getByTestId("browser-console-toggle").click();
  await expect(view.getByTestId("browser-console")).toContainText("added one");

  // The network log: Claude read it, and the view lists the requests.
  await expect(chat).toContainText("jig_browser_network");
  expect(JSON.stringify(await hostCall(page, "browser.network", { chatId }))).toContain("index.html");

  await page.screenshot({
    path: join(jigHome, "claude-browser.png"),
  });
  // Claude owns navigation, while you can still click/type in the page for sign-in.
  await expect(view.getByTestId("browser-address")).toHaveAttribute("readonly", "");
  await expect(view.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(view.getByRole("button", { name: "Reload", exact: true })).toHaveCount(0);
  await expect(view.getByRole("button", { name: /Window size/ })).toHaveCount(0);
  const hint = view.getByTestId("claude-browser-hint");
  await expect(hint).toContainText("sign-ins");
  // The hint is the view's footer: its last row, and closing the console doesn't move it.
  expect(await hint.evaluate((el) => el === el.parentElement?.lastElementChild)).toBe(true);
  const hintBefore = (await hint.boundingBox())!;
  await view.getByTestId("browser-console-toggle").click();
  await expect(view.getByTestId("browser-console")).toHaveCount(0);
  expect(await hint.evaluate((el) => el === el.parentElement?.lastElementChild)).toBe(true);
  expect((await hint.boundingBox())!.y).toBe(hintBefore.y);
  const target = (await app.evaluate(async ({ webContents }, url) => {
    const c = webContents.getAllWebContents().find((c) => c.getURL() === url)!;
    return c.executeJavaScript(
      "(() => { const b = document.querySelector('#login').getBoundingClientRect(); return { x:b.x+b.width/2, y:b.y+b.height/2 }; })()",
    );
  }, pathToFileURL(file).href)) as { x: number; y: number };
  const box = (await view.getByTestId("browser-frame").boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 800);
  await page.mouse.click(
    box.x + (box.width - 1280 * scale) / 2 + target.x * scale,
    box.y + (box.height - 800 * scale) / 2 + target.y * scale,
  );
  await page.keyboard.type("sample-code");
  await expect
    .poll(async () =>
      app.evaluate(async ({ webContents }, url) => {
        const c = webContents.getAllWebContents().find((c) => c.getURL() === url)!;
        return c.executeJavaScript("document.querySelector('#login').value");
      }, pathToFileURL(file).href),
    )
    .toBe("sample-code");
  await view.getByTestId("claude-browser-open-browser").click();
  await expect(page.getByTestId("user-browser-view")).toBeVisible();
  await expect(view.getByTestId("browser-address")).toHaveValue(pathToFileURL(file).href);
});

test("Claude's browser: the network log shows requests, errors and their bodies", async ({ page }) => {
  const server = createServer((req, res) => {
    if (req.url === "/api/cart") {
      res.writeHead(500, { "Content-Type": "application/json", "Set-Cookie": "session=secret" });
      res.end('{"error":"cart is broken"}');
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<!doctype html><title>Shop</title><p>Shop</p><script>fetch('/api/cart', { headers: { Authorization: 'Bearer abc' } })</script>",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    // A page of its own, as a chat's (any id names a page).
    const chatId = "e2e-network";
    await hostCall(page, "browser.navigate", { chatId, url });
    await expect
      .poll(async () => JSON.stringify(await hostCall(page, "browser.network", { chatId })), {
        timeout: 10000,
      })
      .toContain('"status":500');
    const list = (await hostCall(page, "browser.network", { chatId })) as {
      value: Array<{ id: string; url: string; requestHeaders: Record<string, string> }>;
    };
    const cart = list.value.find((e) => e.url.endsWith("/api/cart"))!;
    expect(cart.requestHeaders.Authorization).toBe("«redacted»");
    const detail = JSON.stringify(await hostCall(page, "browser.networkDetail", { chatId, id: cart.id }));
    expect(detail).toContain("cart is broken");
    expect(detail).not.toContain("session=secret");

    await page.keyboard.press("Control+K");
    await page.getByTestId("goto-input").fill("Open Claude’s browser");
    await page.getByTestId("goto-action-jig.openClaudeBrowser").click();
    const view = page.getByTestId("browser-view");
    await view.getByTestId("browser-network-toggle").click();
    await view.getByTestId("browser-request").filter({ hasText: "/api/cart" }).click();
    await expect(view.getByTestId("browser-network")).toContainText("cart is broken");
  } finally {
    server.close();
  }
});
