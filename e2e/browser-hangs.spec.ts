import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test as base, expect, hostCall, launchJig } from "./fixtures";

/**
 * Claude's browser never hangs a chat (D-319): a load that never finishes, a page dialog and a page
 * that loops for ever all end in a clear tool result. Limits are shortened to a fifth for the test
 * (load 6 s, page script 3 s, whole call 12 s).
 */
const test = base.extend({
  app: async ({ jigHome }, use) => {
    const app = await launchJig(jigHome, { JIG_BROWSER_TIMEOUT_SCALE: "0.2" });
    await use(app);
    await app.close();
  },
});

const PAGES: Record<string, string> = {
  "/ok": "<!doctype html><title>Fine</title><p>Fine</p>",
  "/alert":
    "<!doctype html><title>Before</title><script>alert('Saved the cart'); if (confirm('Leave the page?')) document.title = 'After dialogs';</script><button>OK</button>",
  "/loop": '<!doctype html><title>Loop</title><button onclick="while (true) {}">Spin</button>',
};

/** A local site; `/slow` holds the request and never answers (a dev server that is rebuilding). */
async function site(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (req.url === "/slow") return;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGES[req.url ?? ""] ?? "<!doctype html><title>Other</title>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** Sends a message in a new chat; returns a function reading the chat's transcript as text. */
async function chat(page: Page, jigHome: string, message: string) {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill(message);
  await page.keyboard.press("Enter");
  return async () => {
    const list = (await hostCall(page, "sessions.list")) as { value: Array<{ id: string }> };
    const id = list.value[0]?.id;
    return id ? JSON.stringify(await hostCall(page, "sessions.get", { id })) : "";
  };
}

const DONE = "I opened the page in my browser and took a screenshot.";

test("Claude's browser: a page that never finishes loading ends the call with a clear message", async ({
  page,
  jigHome,
}) => {
  const { server, url } = await site();
  try {
    const transcript = await chat(page, jigHome, `browse ${url}/slow`);
    await expect.poll(transcript, { timeout: 40000 }).toContain(DONE);
    const text = await transcript();
    expect(text).toContain(`The page didn't finish loading in 6 s (still loading: ${url}/slow)`);
    expect(text).toContain("(took ");
    // The browser is still usable for the next page.
    await hostCall(page, "browser.navigate", { url: `${url}/ok` });
    await expect
      .poll(async () => JSON.stringify(await hostCall(page, "browser.state")), { timeout: 15000 })
      .toContain('"title":"Fine"');
  } finally {
    server.close();
  }
});

test("Claude's browser: alert and confirm answer themselves and show on the console", async ({
  page,
  jigHome,
}) => {
  const { server, url } = await site();
  try {
    const transcript = await chat(page, jigHome, `browse ${url}/alert`);
    await expect.poll(transcript, { timeout: 30000 }).toContain(DONE);
    // The page went on after its dialogs (confirm answered OK).
    expect(JSON.stringify(await hostCall(page, "browser.state"))).toContain('"title":"After dialogs"');
    const console = JSON.stringify(await hostCall(page, "browser.console", {}));
    expect(console).toContain("alert: Saved the cart (answered OK automatically)");
    expect(console).toContain("confirm: Leave the page?");
  } finally {
    server.close();
  }
});

test("Claude's browser: a page stuck in a loop is recreated and the call says so", async ({
  page,
  jigHome,
}) => {
  const { server, url } = await site();
  try {
    const transcript = await chat(page, jigHome, `browse ${url}/loop and read it again`);
    await expect.poll(transcript, { timeout: 40000 }).toContain(DONE);
    expect(await transcript()).toContain("The page stopped responding");
    // A new page loaded the address again and answers.
    await expect
      .poll(async () => JSON.stringify(await hostCall(page, "browser.state")), { timeout: 15000 })
      .toContain('"title":"Loop"');
    expect(JSON.stringify(await hostCall(page, "browser.console", {}))).toContain("Jig recreated the page");
  } finally {
    server.close();
  }
});
