import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ElectronApplication } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

async function nativeState(app: ElectronApplication, url: string) {
  return app.evaluate(({ BrowserWindow, webContents }, url) => {
    const c = webContents.getAllWebContents().find((c) => c.getURL() === url);
    if (!c) return undefined;
    const owner = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith("jig-app:"))!;
    const view = owner.contentView.children.find(
      (v) => "webContents" in v && (v as Electron.WebContentsView).webContents.id === c.id,
    );
    return { visible: view?.getVisible(), bounds: view?.getBounds(), partition: c.session.storagePath };
  }, url);
}

test("native Browser opens in the main panel, takes native input and stays apart from Claude", async ({
  page,
  app,
  jigHome,
}) => {
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><title>${req.url === "/other" ? "Other page" : "Native browser"}</title>
      <style>body{font:20px system-ui;padding:32px} input,button{font:inherit}</style>
      <h1>Shop</h1><input id="name" aria-label="Name"><button onclick="document.title='Clicked'">Save</button><a href="/other">Other</a>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    await page.getByTestId("topbar-browser").click();
    const view = page.getByTestId("user-browser-view");
    await expect(view).toBeVisible();
    // The registered view opens in a main-area tab, not a sidebar.
    await expect
      .poll(async () => JSON.stringify(await hostCall(page, "layout.get")))
      .toContain('"viewId":"jig.userBrowser"');
    const address = view.getByTestId("user-browser-address");
    await address.fill(url);
    await address.press("Enter");
    await expect(view.getByRole("status")).toHaveText("Native browser");
    await expect.poll(async () => (await nativeState(app, url))?.visible).toBe(true);
    const slot = await page.getByTestId("user-browser-page").boundingBox();
    const native = await nativeState(app, url);
    expect(native?.bounds?.width).toBeCloseTo(slot!.width, 0);
    expect(native?.bounds?.height).toBeCloseTo(slot!.height, 0);
    expect(await view.locator("img").count()).toBe(0);

    // Exercise the actual native WebContents: normal text, paste/IME insertion and selection.
    const result = await app.evaluate(async ({ webContents }, url) => {
      const c = webContents.getAllWebContents().find((c) => c.getURL() === url)!;
      await c.executeJavaScript("document.querySelector('input').focus()");
      await c.insertText("Hello 世界");
      return c.executeJavaScript(
        "({value:document.querySelector('input').value, bridge:typeof window.jig, node:typeof process})",
      );
    }, url);
    expect(result).toEqual({ value: "Hello 世界", bridge: "undefined", node: "undefined" });

    // Native Ctrl+L returns focus to the real address field.
    await app.evaluate(({ webContents }, url) => {
      const c = webContents.getAllWebContents().find((c) => c.getURL() === url)!;
      c.sendInputEvent({ type: "keyDown", keyCode: "L", modifiers: ["control"] });
    }, url);
    await expect(address).toBeFocused();
    await address.fill(`${url}other`);
    await address.press("Enter");
    await expect(view.getByRole("status")).toHaveText("Other page");
    await view.getByRole("button", { name: "Back", exact: true }).click();
    await expect(address).toHaveValue(url);
    await expect(view.getByRole("status")).toHaveText("Native browser");

    // App overlays always remain accessible above the page; they never move its slot.
    const before = await page.getByTestId("user-browser-page").boundingBox();
    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("goto-input")).toBeVisible();
    await expect.poll(async () => (await nativeState(app, url))?.visible).toBe(false);
    expect(await page.getByTestId("user-browser-page").boundingBox()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await nativeState(app, url))?.visible).toBe(true);

    await hostCall(page, "browser.navigate", { url: `${url}claude` });
    expect(JSON.stringify(await hostCall(page, "userBrowser.state"))).toContain(url);
    expect(JSON.stringify(await hostCall(page, "userBrowser.state"))).not.toContain(`${url}claude`);
    await page.screenshot({ path: `${jigHome}/native-browser.png` });
    if (process.env.JIG_SCREENSHOTS) {
      // Playwright captures the workbench renderer only. Keep both real Chromium
      // surfaces and their native bounds for scripts/compose-browser-screenshot.py.
      await mkdir(".tmp/browser-screenshot", { recursive: true });
      await page.screenshot({ path: ".tmp/browser-screenshot/shell.png" });
      const capture = await app.evaluate(async ({ webContents }, url) => {
        const c = webContents.getAllWebContents().find((c) => c.getURL() === url)!;
        return (await c.capturePage()).toPNG().toString("base64");
      }, url);
      await writeFile(".tmp/browser-screenshot/page.png", Buffer.from(capture, "base64"));
      await writeFile(
        ".tmp/browser-screenshot/bounds.txt",
        JSON.stringify((await nativeState(app, url))!.bounds),
      );
    }
    // Close the main tab: a detached surface must never obscure the next tab.
    await app.evaluate(({ webContents }, url) => {
      const c = webContents.getAllWebContents().find((c) => c.getURL() === url)!;
      c.sendInputEvent({ type: "keyDown", keyCode: "W", modifiers: ["control"] });
    }, url);
    await expect(view).not.toBeVisible();
    await expect.poll(async () => (await nativeState(app, url))?.visible).toBe(false);
  } finally {
    server.close();
  }
});
