import { getConfig } from "../config";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { onSessionClosed } from "../sessions";
import { BrowserPages } from "./pages";
import type { BrowserPage } from "./service";
import { browserTools } from "./tools";

import { registerUserBrowser } from "./userBrowser";

let pages: BrowserPages | undefined;

/** What a chat without a page shows (views ask before Claude opened one). */
const NO_PAGE = {
  open: false,
  url: "",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  width: 1280,
  height: 800,
  errors: 0,
  requests: 0,
  failedRequests: 0,
};

export function startBrowser(): void {
  registerUserBrowser();
  const browser = new BrowserPages({
    changed: (list) => emit("browser.pages", list),
    frame: (frame) => emit("browser.frame", frame),
    // The view opens by itself unless you turned browser.showWhenUsed off.
    reveal: (chatId) => {
      if (getConfig().browser.showWhenUsed) emit("browser.reveal", { chatId });
    },
    sessions: () => getConfig().browser.pageSessions,
  });
  pages = browser;
  registerJigTools(browserTools(browser));
  // An archived or deleted chat's page closes with it.
  onSessionClosed((chatId) => browser.close(chatId));

  const existing = (chatId: string): BrowserPage => {
    const page = browser.get(chatId);
    if (!page) throw new Error("This chat has no page in Claude's browser");
    return page;
  };
  handle("browser.pages", () => browser.list());
  handle("browser.state", ({ chatId }) => browser.get(chatId)?.state() ?? NO_PAGE);
  handle("browser.watch", ({ chatId, on }) => browser.get(chatId)?.watch(on));
  handle("browser.navigate", async ({ chatId, url, action }) => {
    const page = browser.page(chatId);
    return url ? (await page.open(url)).state : page.navigate(action ?? "reload");
  });
  handle("browser.input", ({ chatId, input }) => {
    browser.touch(chatId);
    browser.get(chatId)?.input(input);
  });
  handle("browser.resize", ({ chatId, width, height }) => browser.page(chatId).resize(width, height));
  handle("browser.console", ({ chatId, clear }) => browser.get(chatId)?.consoleEntries(Boolean(clear)) ?? []);
  handle("browser.network", ({ chatId, clear }) => browser.get(chatId)?.networkEntries(Boolean(clear)) ?? []);
  handle("browser.networkDetail", ({ chatId, id }) => existing(chatId).networkDetail(id));
  handle("browser.close", ({ chatId }) => browser.close(chatId));
}

export function stopBrowser(): void {
  pages?.closeAll();
}
