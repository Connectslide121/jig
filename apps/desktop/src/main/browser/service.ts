import { BrowserWindow, type WebContents } from "electron";
import type { BrowserInput, BrowserState, ConsoleEntry } from "../../shared/browser";
import { normalizeUrl, VIEWPORTS } from "../../shared/browser";
import { markHelperWindow } from "../appWindows";
import { logger } from "../log";
import { focusScript, locateScript, SNAPSHOT_SCRIPT } from "./pageScripts";

const log = logger("browser");
const PARTITION = "persist:jig-browser";
/** Frames sent to a watching view at most this often (ms). */
const FRAME_MS = 100;
const MAX_CONSOLE = 300;

export interface BrowserEvents {
  state(state: BrowserState): void;
  frame(frame: { data: string; width: number; height: number }): void;
  /** Claude used the browser: show the view. */
  reveal(): void;
}

/**
 * Claude's browser: one offscreen page in its own session (cookies and storage apart from Jig),
 * rendered to frames for the Browser view, driven with real input events so pages behave as with a
 * person. Pop-ups open in place; downloads and permission requests (camera, location…) are refused.
 */
export class BrowserService {
  private window: BrowserWindow | undefined;
  private watchers = 0;
  private lastFrame = 0;
  private pending: Electron.NativeImage | undefined;
  private frameTimer: NodeJS.Timeout | undefined;
  private console: ConsoleEntry[] = [];
  private viewport: { width: number; height: number } = { ...VIEWPORTS.desktop };

  constructor(private readonly events: BrowserEvents) {}

  private get contents(): WebContents | undefined {
    return this.window && !this.window.isDestroyed() ? this.window.webContents : undefined;
  }

  state(): BrowserState {
    const c = this.contents;
    return {
      open: Boolean(c),
      url: c?.getURL() ?? "",
      title: c?.getTitle() ?? "",
      loading: c?.isLoading() ?? false,
      canGoBack: c?.navigationHistory.canGoBack() ?? false,
      canGoForward: c?.navigationHistory.canGoForward() ?? false,
      width: this.viewport.width,
      height: this.viewport.height,
      errors: this.console.filter((e) => e.level === "error").length,
    };
  }

  private changed = () => this.events.state(this.state());

  private ensure(): WebContents {
    if (this.contents) return this.contents;
    const window = new BrowserWindow({
      show: false,
      width: this.viewport.width,
      height: this.viewport.height,
      useContentSize: true,
      webPreferences: {
        offscreen: true,
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    markHelperWindow(window);
    this.window = window;
    const c = window.webContents;
    c.setFrameRate(15);
    c.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    c.session.on("will-download", (event) => event.preventDefault());
    c.setWindowOpenHandler(({ url }) => {
      void c.loadURL(url).catch(() => {});
      return { action: "deny" };
    });
    c.on("will-navigate", (event, url) => {
      if (!/^(https?|file|about):/i.test(url)) event.preventDefault();
    });
    c.on("paint", (_event, _dirty, image) => {
      if (this.watchers === 0) return;
      // At most one frame per FRAME_MS, and always the last one (so a page that stops changing is shown).
      this.pending = image;
      if (this.frameTimer) return;
      const wait = Math.max(0, FRAME_MS - (Date.now() - this.lastFrame));
      this.frameTimer = setTimeout(() => this.flushFrame(), wait);
    });
    c.on("console-message", (details) => {
      // Electron's own development warnings are not the page's.
      if (details.message.includes("Electron Security Warning")) return;
      const level = (["log", "info", "warning", "error"] as const).includes(details.level as never)
        ? (details.level as ConsoleEntry["level"])
        : "log";
      this.console.push({
        level,
        message: details.message.slice(0, 2000),
        source: details.sourceId,
        line: details.lineNumber,
        at: new Date().toISOString(),
      });
      if (this.console.length > MAX_CONSOLE) this.console.splice(0, this.console.length - MAX_CONSOLE);
      if (level === "error") this.changed();
    });
    for (const e of [
      "did-start-loading",
      "did-stop-loading",
      "page-title-updated",
      "did-navigate",
      "did-navigate-in-page",
    ] as const)
      c.on(e as never, this.changed);
    c.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3)
        this.console.push({
          level: "error",
          message: `Couldn't load ${url}: ${description} (${code})`,
          at: new Date().toISOString(),
        });
      this.changed();
    });
    window.on("closed", () => {
      this.window = undefined;
      this.changed();
    });
    return c;
  }

  private flushFrame(): void {
    this.frameTimer = undefined;
    const image = this.pending;
    this.pending = undefined;
    if (!image || this.watchers === 0) return;
    this.lastFrame = Date.now();
    const size = image.getSize();
    this.events.frame({ data: image.toJPEG(75).toString("base64"), width: size.width, height: size.height });
  }

  /** A view started (or stopped) showing the page: frames are only made while someone watches. */
  watch(on: boolean): void {
    this.watchers = Math.max(0, this.watchers + (on ? 1 : -1));
    const c = this.contents;
    if (on && c) c.invalidate();
  }

  /** Waits until the page stops loading (and a moment for scripts), at most `timeoutMs`. */
  private async settle(timeoutMs = 15_000): Promise<void> {
    const c = this.contents;
    if (!c) return;
    await new Promise((r) => setTimeout(r, 250));
    if (c.isLoading())
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, timeoutMs);
        function done() {
          clearTimeout(timer);
          c?.off("did-stop-loading", done);
          resolve();
        }
        c.once("did-stop-loading", done);
      });
    await new Promise((r) => setTimeout(r, 200));
  }

  async open(input: string): Promise<BrowserState> {
    const url = normalizeUrl(input);
    const c = this.ensure();
    this.events.reveal();
    try {
      await c.loadURL(url);
    } catch (error) {
      // A failed load is reported in the state and the console; the page shows Chromium's error.
      log.debug(`load failed: ${(error as Error).message}`);
    }
    await this.settle();
    this.changed();
    return this.state();
  }

  async navigate(action: "back" | "forward" | "reload"): Promise<BrowserState> {
    const c = this.ensure();
    if (action === "back" && c.navigationHistory.canGoBack()) c.navigationHistory.goBack();
    else if (action === "forward" && c.navigationHistory.canGoForward()) c.navigationHistory.goForward();
    else if (action === "reload") c.reload();
    await this.settle();
    return this.state();
  }

  private page(): WebContents {
    const c = this.contents;
    if (!c?.getURL() || c.getURL() === "about:blank") throw new Error("Open a page first (jig_browser_open)");
    return c;
  }

  /** The page as text plus its interactive elements, numbered for click/type. */
  async snapshot(): Promise<{
    title: string;
    url: string;
    text: string;
    truncated: boolean;
    items: string[];
  }> {
    return this.page().executeJavaScript(SNAPSHOT_SCRIPT, true);
  }

  async click(target: { ref?: number; selector?: string; text?: string }): Promise<string> {
    const c = this.page();
    const at = (await c.executeJavaScript(locateScript(target), true)) as {
      x: number;
      y: number;
      label: string;
      tag: string;
    } | null;
    if (!at)
      throw new Error("No such element on the page (read the page again: refs change after it updates)");
    c.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
    c.sendInputEvent({ type: "mouseDown", x: at.x, y: at.y, button: "left", clickCount: 1 });
    c.sendInputEvent({ type: "mouseUp", x: at.x, y: at.y, button: "left", clickCount: 1 });
    await this.settle();
    return `Clicked ${at.tag} "${at.label}".`;
  }

  async type(
    target: { ref?: number; selector?: string },
    text: string,
    options: { clear?: boolean; submit?: boolean },
  ): Promise<string> {
    const c = this.page();
    const ok = await c.executeJavaScript(focusScript(target, options.clear !== false), true);
    if (!ok) throw new Error("No such field on the page (read the page again: refs change after it updates)");
    await c.insertText(text);
    if (options.submit) await this.press("Enter");
    else await this.settle();
    return `Typed ${JSON.stringify(text.length > 60 ? `${text.slice(0, 60)}…` : text)}${options.submit ? " and pressed Enter" : ""}.`;
  }

  async press(key: string): Promise<string> {
    const c = this.page();
    c.sendInputEvent({ type: "keyDown", keyCode: key });
    if (key.length === 1 || key === "Enter")
      c.sendInputEvent({ type: "char", keyCode: key === "Enter" ? "\r" : key });
    c.sendInputEvent({ type: "keyUp", keyCode: key });
    await this.settle();
    return `Pressed ${key}.`;
  }

  async screenshot(): Promise<{ png: string; width: number; height: number }> {
    const image = await this.page().capturePage();
    const { width } = image.getSize();
    // Large screenshots cost many tokens: keep them at most 1280 wide.
    const scaled = width > 1280 ? image.resize({ width: 1280 }) : image;
    return { png: scaled.toPNG().toString("base64"), ...scaled.getSize() };
  }

  consoleEntries(clear: boolean): ConsoleEntry[] {
    const list = [...this.console];
    if (clear) {
      this.console = [];
      this.changed();
    }
    return list;
  }

  async evaluate(expression: string): Promise<string> {
    const value = await this.page().executeJavaScript(
      `(async () => { const v = await (${expression}); try { return JSON.stringify(v, null, 2); } catch { return String(v); } })()`,
      true,
    );
    return typeof value === "string" ? value.slice(0, 20_000) : String(value);
  }

  resize(width: number, height: number): BrowserState {
    this.viewport = { width: Math.round(width), height: Math.round(height) };
    this.ensure();
    this.window?.setContentSize(this.viewport.width, this.viewport.height);
    this.changed();
    return this.state();
  }

  /** Input from the live view (you, taking over). */
  input(event: BrowserInput): void {
    const c = this.contents;
    if (!c) return;
    switch (event.type) {
      case "text":
        void c.insertText(event.text);
        return;
      case "keyDown":
      case "keyUp":
        c.sendInputEvent({ type: event.type, keyCode: event.key });
        // Enter also needs its character, or forms don't submit.
        if (event.type === "keyDown" && event.key === "Enter")
          c.sendInputEvent({ type: "char", keyCode: "\r" });
        return;
      case "wheel":
        c.sendInputEvent({
          type: "mouseWheel",
          x: event.x,
          y: event.y,
          deltaX: -event.deltaX,
          deltaY: -event.deltaY,
        });
        return;
      default:
        c.sendInputEvent({
          type: event.type,
          x: event.x,
          y: event.y,
          button: event.button ?? "left",
          clickCount: event.clickCount ?? 1,
        });
    }
  }

  close(): void {
    this.window?.destroy();
    this.window = undefined;
    this.console = [];
    this.changed();
  }
}
