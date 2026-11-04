import { BrowserWindow, type WebContents } from "electron";
import type { BrowserInput, BrowserState, ConsoleEntry, NetworkEntry } from "../../shared/browser";
import { isNetworkError, normalizeUrl, redactHeaders, VIEWPORTS } from "../../shared/browser";
import { markHelperWindow } from "../appWindows";
import { logger } from "../log";
import { LIMITS, secs, TimeoutError, withTimeout } from "./deadline";
import { DIALOG_MARK, DIALOG_SCRIPT, focusScript, locateScript, SNAPSHOT_SCRIPT } from "./pageScripts";

const log = logger("browser");
/** Frames sent to a watching view at most this often (ms). */
const FRAME_MS = 100;
const MAX_CONSOLE = 300;
const MAX_NETWORK = 300;
/** Bodies Claude gets, at most (characters). */
const MAX_BODY = 20_000;

export interface PageEvents {
  state(state: BrowserState): void;
  frame(frame: { data: string; width: number; height: number }): void;
}

/** Electron's `webRequest` details, the fields a page's network log uses. */
type RequestDetails = { id: number; webContentsId?: number; timestamp: number };

/**
 * One chat's page of Claude's browser (D-320; `pages.ts` keeps one per chat): an offscreen page in
 * the browser's session (cookies and storage apart from Jig), rendered to frames for the Browser view,
 * driven with real input events so pages behave as with a person. Pop-ups open in place; downloads and
 * permission requests (camera, location…) are refused.
 *
 * Nothing here waits for ever (D-319): loads, page scripts and captures have time limits; page dialogs
 * answer themselves; a page that crashes or stops responding is recreated, and the next tool call
 * hears about it (`takeNotice`).
 */
export class BrowserPage {
  private window: BrowserWindow | undefined;
  private watchers = 0;
  private lastFrame = 0;
  private pending: Electron.NativeImage | undefined;
  private frameTimer: NodeJS.Timeout | undefined;
  private console: ConsoleEntry[] = [];
  private network: NetworkEntry[] = [];
  private viewport: { width: number; height: number } = { ...VIEWPORTS.desktop };
  /** Aborted when the current page is gone (crashed, hung and recreated, closed): its waits stop. */
  private gone = new AbortController();
  /** What happened to the page since the last tool call (a crash, a recreated page), for Claude. */
  private notice: string | undefined;
  private lastRecovery: { url: string; at: number } | undefined;

  constructor(
    /** The session partition (shared by every page, or this chat's own: `browser.pageSessions`). */
    readonly partition: string,
    private readonly events: PageEvents,
  ) {}

  private get contents(): WebContents | undefined {
    return this.window && !this.window.isDestroyed() ? this.window.webContents : undefined;
  }

  /** The page's WebContents id, for the session's request log to find its page. */
  contentsId(): number | undefined {
    return this.contents?.id;
  }

  /** Someone is watching its live view (frames are made only then). */
  watched(): boolean {
    return this.watchers > 0;
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
      requests: this.network.length,
      failedRequests: this.network.filter(isNetworkError).length,
    };
  }

  private changed = () => this.events.state(this.state());

  private ensure(): WebContents {
    if (this.contents) return this.contents;
    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      width: this.viewport.width,
      height: this.viewport.height,
      useContentSize: true,
      webPreferences: {
        offscreen: true,
        partition: this.partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    markHelperWindow(window);
    this.window = window;
    this.gone = new AbortController();
    const c = window.webContents;
    /** Events of a page that was replaced since (one we crashed while recreating it) don't count. */
    const current = () => this.window === window;
    c.setFrameRate(15);
    // Downloads and permission requests are refused for the whole session (`pages.ts`, `route`).
    c.setWindowOpenHandler(({ url }) => {
      // A page's popup opens in the same tab, but never as a file or another scheme.
      if (/^https?:/i.test(url)) void c.loadURL(url).catch(() => {});
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
      if (details.message.startsWith(DIALOG_MARK)) {
        try {
          const d = JSON.parse(details.message.slice(DIALOG_MARK.length)) as Record<string, string>;
          this.dialog(`${d.kind}: ${d.message} (answered ${d.answer} automatically)`, d.kind ?? "dialog");
        } catch {}
        return;
      }
      const level = (["log", "info", "warning", "error"] as const).includes(details.level as never)
        ? (details.level as ConsoleEntry["level"])
        : "log";
      this.addConsole({
        level,
        message: details.message.slice(0, 2000),
        source: details.sourceId,
        line: details.lineNumber,
        at: new Date().toISOString(),
      });
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
        this.addConsole({
          level: "error",
          message: `Couldn't load ${url}: ${description} (${code})`,
          at: new Date().toISOString(),
        });
      this.changed();
    });
    // A page that wants to stay ("Leave site?") is left anyway: nobody is there to answer.
    c.on("will-prevent-unload", (event) => {
      event.preventDefault();
      this.dialog("beforeunload: the page asked to stay; it was left anyway", "beforeunload");
    });
    c.on("render-process-gone", (_event, details) => {
      if (current() && details.reason !== "clean-exit") this.recover(`The page crashed (${details.reason})`);
    });
    c.on("unresponsive", () => {
      if (current()) this.recover("The page stopped responding");
    });
    window.on("closed", () => {
      if (!current()) return;
      this.window = undefined;
      this.gone.abort(new Error("Claude's browser was closed"));
      this.changed();
    });
    this.captureNetwork(c);
    return c;
  }

  private addConsole(entry: ConsoleEntry): void {
    this.console.push(entry);
    if (this.console.length > MAX_CONSOLE) this.console.splice(0, this.console.length - MAX_CONSOLE);
  }

  /** A dialog answered by itself: on the console for Claude, and in main.log (without its text). */
  private dialog(message: string, kind: string): void {
    log.info(`A page ${kind} dialog was answered automatically`);
    this.addConsole({ level: "warning", message: message.slice(0, 2000), at: new Date().toISOString() });
  }

  private find = (id: number) => this.network.find((e) => e.id === String(id));

  /**
   * The page's requests: the session's `webRequest` events (every request, whatever renderer process
   * the page is in) reach the page they belong to through `pages.ts` (a session takes one listener per
   * event, and pages may share it): method, URL, type, status, time, headers with credentials redacted.
   */
  requestStarted(details: Electron.OnBeforeRequestListenerDetails): void {
    const TYPES: Record<string, string> = { mainFrame: "document", subFrame: "iframe", xhr: "fetch" };
    this.network.push({
      id: String(details.id),
      method: details.method,
      url: details.url,
      type: TYPES[details.resourceType] ?? details.resourceType,
      startedAt: new Date(details.timestamp).toISOString(),
      postData: details.uploadData?.[0]?.bytes?.toString("utf8").slice(0, MAX_BODY),
    });
    if (this.network.length > MAX_NETWORK) this.network.splice(0, this.network.length - MAX_NETWORK);
    this.networkChanged();
  }

  requestHeaders(details: Electron.OnBeforeSendHeadersListenerDetails): void {
    const e = this.find(details.id);
    if (e) e.requestHeaders = redactHeaders(details.requestHeaders);
  }

  responseHeaders(details: Electron.OnHeadersReceivedListenerDetails): void {
    const e = this.find(details.id);
    if (!e) return;
    e.status = details.statusCode;
    e.statusText = details.statusLine.replace(/^HTTP\/[\d.]+\s+\d+\s*/, "");
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(details.responseHeaders ?? {})) headers[k] = v.join(", ");
    e.responseHeaders = redactHeaders(headers);
    e.mimeType = (headers["content-type"] ?? headers["Content-Type"] ?? "").split(";")[0];
  }

  requestEnded(details: RequestDetails & { statusCode?: number; error?: string }): void {
    const e = this.find(details.id);
    if (!e) return;
    if (details.statusCode !== undefined) e.status = details.statusCode;
    if (details.error) e.error = details.error;
    e.durationMs = details.timestamp - new Date(e.startedAt).getTime();
    const length = Number(e.responseHeaders?.["content-length"] ?? e.responseHeaders?.["Content-Length"]);
    if (!details.error && Number.isFinite(length)) e.size = length;
    this.networkChanged();
  }

  /**
   * Response bodies come from Chromium's DevTools protocol (`webContents.debugger`), used only to
   * fetch a body when asked, and to answer page dialogs.
   */
  private captureNetwork(c: WebContents): void {
    // Bodies: DevTools remembers the request id of each URL's latest response.
    try {
      c.debugger.attach("1.3");
      // Enabled on a blank page before the first navigation, so the first page's requests are seen
      // from their start (Chromium keeps bodies only for requests it saw begin).
      const enable = (async () => {
        await c.loadURL("about:blank").catch(() => {});
        await c.debugger.sendCommand("Network.enable");
        // Dialogs never block the page: answered in it before its own scripts run, and one that still
        // opens (from a frame the script missed) is accepted through DevTools.
        await c.debugger.sendCommand("Page.enable");
        await c.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: DIALOG_SCRIPT });
      })().catch(() => {});
      this.bodiesReady = Promise.race([enable, new Promise<void>((r) => setTimeout(r, 3000))]);
      // A navigation to another site moves the page to a new renderer: enable it there too.
      c.on("did-start-navigation", (details) => {
        if (details.isMainFrame && !details.isSameDocument)
          void c.debugger.sendCommand("Network.enable").catch(() => {});
      });
      // biome-ignore lint/suspicious/noExplicitAny: DevTools protocol payloads.
      c.debugger.on("message", (_event, method: string, params: any) => {
        if (method === "Network.responseReceived" && params.response?.url)
          this.bodyIds.set(`${params.response.url}`, String(params.requestId));
        if (method === "Page.javascriptDialogOpening") {
          void c.debugger
            .sendCommand("Page.handleJavaScriptDialog", {
              accept: true,
              promptText: params.defaultPrompt ?? "",
            })
            .catch(() => {});
          this.dialog(
            `${params.type}: ${String(params.message ?? "").slice(0, 500)} (answered OK automatically)`,
            String(params.type),
          );
        }
      });
    } catch (error) {
      log.warn("Response bodies unavailable", error);
      // Without DevTools, dialogs are answered from the moment the document is ready.
      c.on("dom-ready", () => void c.executeJavaScript(DIALOG_SCRIPT).catch(() => {}));
    }
  }

  private bodyIds = new Map<string, string>();
  private bodiesReady: Promise<void> = Promise.resolve();

  private networkTimer: NodeJS.Timeout | undefined;
  /** The view's list follows the log (at most twice a second). */
  private networkChanged(): void {
    if (this.networkTimer) return;
    this.networkTimer = setTimeout(() => {
      this.networkTimer = undefined;
      this.changed();
    }, 500);
  }

  networkEntries(clear = false): NetworkEntry[] {
    const list = this.network.map((e) => ({ ...e }));
    if (clear) {
      this.network = [];
      this.bodyIds.clear();
      this.changed();
    }
    return list;
  }

  /** One request with its response body (text, at most 20k characters) if Chromium still has it. */
  async networkDetail(id: string): Promise<NetworkEntry & { body?: string; bodyNote?: string }> {
    const e = this.network.find((x) => x.id === id);
    if (!e) throw new Error(`No request #${id} (list them with jig_browser_network)`);
    const requestId = this.bodyIds.get(e.url);
    const c = this.contents;
    if (!requestId || !c) return { ...e, bodyNote: "The body is no longer available." };
    try {
      const r = (await withTimeout(
        c.debugger.sendCommand("Network.getResponseBody", { requestId }),
        LIMITS.script,
        "body",
      )) as { body: string; base64Encoded: boolean };
      if (r.base64Encoded) return { ...e, bodyNote: `Binary body (${e.mimeType || "unknown type"}).` };
      return {
        ...e,
        body: r.body.slice(0, MAX_BODY),
        bodyNote: r.body.length > MAX_BODY ? `Cut at ${MAX_BODY} of ${r.body.length} characters.` : undefined,
      };
    } catch {
      return { ...e, bodyNote: "The body is no longer available (Chromium keeps it only for a while)." };
    }
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
  private async settle(timeoutMs = LIMITS.settle): Promise<void> {
    const c = this.contents;
    if (!c) return;
    await new Promise((r) => setTimeout(r, 250));
    if (!c.isDestroyed() && c.isLoading())
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, timeoutMs);
        function done() {
          clearTimeout(timer);
          if (!c?.isDestroyed()) c?.off("did-stop-loading", done);
          resolve();
        }
        c.once("did-stop-loading", done);
      });
    await new Promise((r) => setTimeout(r, 200));
  }

  /**
   * Loads `url`, at most `LIMITS.load`: a server that holds the request (a dev server rebuilding)
   * would keep `loadURL` waiting for ever. Then the load is stopped; false says it didn't finish.
   */
  private async load(c: WebContents, url: string): Promise<boolean> {
    const signal = this.gone.signal;
    const loading = c.loadURL(url);
    try {
      await withTimeout(loading, LIMITS.load, "load", signal);
      return true;
    } catch (error) {
      if (signal.aborted) throw error;
      if (!(error instanceof TimeoutError)) {
        // A failed load is reported in the state and the console; the page shows Chromium's error.
        log.debug(`load failed: ${(error as Error).message}`);
        return true;
      }
      log.warn(`A page load didn't finish in ${secs(LIMITS.load)}; stopped it`);
      loading.catch(() => {});
      if (!c.isDestroyed()) c.stop();
      return false;
    }
  }

  async open(input: string): Promise<{ state: BrowserState; timedOut: boolean; url: string }> {
    const url = normalizeUrl(input);
    const c = this.ensure();
    await this.bodiesReady;
    const finished = await this.load(c, url);
    if (finished) await this.settle();
    this.changed();
    return { state: this.state(), timedOut: !finished, url };
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

  /**
   * A script in the page, at most `LIMITS.script`. When it doesn't answer, a trivial script tells
   * whether only this one waits (a promise that never settles) or the whole page is stuck (a loop, a
   * blocked renderer): then the page is recreated.
   */
  private async run<T>(code: string, what: string): Promise<T> {
    const c = this.page();
    try {
      return (await withTimeout(
        c.executeJavaScript(code, true),
        LIMITS.script,
        "script",
        this.gone.signal,
      )) as T;
    } catch (error) {
      if (!(error instanceof TimeoutError)) throw error;
    }
    log.warn(`A page script (${what}) didn't answer in ${secs(LIMITS.script)}`);
    await this.responsiveOrRecover(c);
    throw new Error(
      `The page didn't answer in ${secs(LIMITS.script)} while ${what} (the script is still waiting, e.g. on a promise that never settles); the page itself still responds.`,
    );
  }

  /** Throws (and recreates the page) when the page doesn't run even a trivial script. */
  private async responsiveOrRecover(c: WebContents): Promise<void> {
    const alive = await withTimeout(
      c.executeJavaScript("1", true),
      LIMITS.probe,
      "probe",
      this.gone.signal,
    ).then(
      () => true,
      () => false,
    );
    if (alive || c !== this.contents) return;
    this.recover(`The page stopped responding (no answer for ${secs(LIMITS.script + LIMITS.probe)})`);
    throw new Error(this.notice ?? "The page stopped responding.");
  }

  /**
   * The page crashed or hangs: it is replaced by a new one (in a new renderer process) that loads the
   * same address again, once: the same page failing again within a minute is left closed. Every wait
   * on the old page stops, and the next tool call says what happened.
   */
  private recover(reason: string): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const url = window.webContents.getURL();
    const real = Boolean(url) && !url.startsWith("about:");
    const again = real && !(this.lastRecovery?.url === url && Date.now() - this.lastRecovery.at < 60_000);
    this.lastRecovery = real ? { url, at: Date.now() } : undefined;
    log.warn(`${reason}; recreating the page${again ? " and loading it again" : ""}`);
    this.window = undefined;
    this.gone.abort(new Error(reason));
    try {
      // Its renderer may be stuck in a loop: end it, so the new page never shares it.
      window.webContents.forcefullyCrashRenderer();
    } catch {}
    window.destroy();
    this.addConsole({
      level: "error",
      message: `${reason}; Jig recreated the page.`,
      at: new Date().toISOString(),
    });
    if (!real) this.notice = `${reason}; it was recreated (blank).`;
    else if (again) this.notice = `${reason}; it was reloaded (${url}).`;
    else
      this.notice = `${reason} again; this time it was left blank. Open it again with jig_browser_open (${url}) once it should work.`;
    const c = this.ensure();
    if (again)
      void (async () => {
        await this.bodiesReady;
        if (this.contents === c) await this.load(c, url);
      })().catch(() => {});
    this.changed();
  }

  /** What happened to the page since the last tool call (a crash, a recreated page); read once. */
  takeNotice(): string | undefined {
    const notice = this.notice;
    this.notice = undefined;
    return notice;
  }

  /** The page as text plus its interactive elements, numbered for click/type. */
  async snapshot(): Promise<{
    title: string;
    url: string;
    text: string;
    truncated: boolean;
    items: string[];
  }> {
    return this.run(SNAPSHOT_SCRIPT, "reading the page");
  }

  async click(target: { ref?: number; selector?: string; text?: string }): Promise<string> {
    const c = this.page();
    const at = await this.run<{ x: number; y: number; label: string; tag: string } | null>(
      locateScript(target),
      "finding the element",
    );
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
    const ok = await this.run<boolean>(focusScript(target, options.clear !== false), "finding the field");
    if (!ok) throw new Error("No such field on the page (read the page again: refs change after it updates)");
    await withTimeout(c.insertText(text), LIMITS.script, "type", this.gone.signal).catch(async (error) => {
      if (!(error instanceof TimeoutError)) throw error;
      await this.responsiveOrRecover(c);
      throw new Error(`The page didn't take the text in ${secs(LIMITS.script)}.`);
    });
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

  /**
   * A PNG of the page: the visible part, or with `fullPage` the whole page (the window grows to the
   * page's height for the capture, at most 8000 px, then goes back). At most 1280 wide and 7900 high,
   * since large images cost many tokens and Claude's limit is 8000 px.
   */
  async screenshot(
    options: { fullPage?: boolean } = {},
  ): Promise<{ png: string; width: number; height: number }> {
    const c = this.page();
    const { width, height } = this.viewport;
    let image: Electron.NativeImage;
    if (options.fullPage) {
      const pageHeight = Number(
        await this.run(
          "Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)",
          "measuring the page",
        ),
      );
      const tall = Math.min(Math.max(height, Math.round(pageHeight) || height), 8000);
      this.window?.setContentSize(width, tall);
      await new Promise((r) => setTimeout(r, 400));
      try {
        image = await this.capture(c);
      } finally {
        this.window?.setContentSize(width, height);
      }
    } else image = await this.capture(c);
    let scaled = image.getSize().width > 1280 ? image.resize({ width: 1280 }) : image;
    if (scaled.getSize().height > 7900) scaled = scaled.resize({ height: 7900 });
    return { png: scaled.toPNG().toString("base64"), ...scaled.getSize() };
  }

  /**
   * `capturePage`, at most `LIMITS.capture`. A hidden offscreen page sometimes stops making frames
   * until something forces one: then `invalidate()` and once more, before saying it failed.
   */
  private async capture(c: WebContents): Promise<Electron.NativeImage> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await withTimeout(c.capturePage(), LIMITS.capture, "capture", this.gone.signal);
      } catch (error) {
        if (!(error instanceof TimeoutError)) throw error;
      }
      log.warn(
        `A screenshot didn't come in ${secs(LIMITS.capture)}${attempt ? "" : "; forcing a frame and trying again"}`,
      );
      if (!c.isDestroyed()) c.invalidate();
    }
    await this.responsiveOrRecover(c);
    throw new Error(
      `Couldn't take a screenshot: the page didn't paint a frame in ${secs(2 * LIMITS.capture)}. Try again, or use jig_browser_read for the text.`,
    );
  }

  /** The current window size (to put it back after trying other sizes). */
  size(): { width: number; height: number } {
    return { ...this.viewport };
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
    const value = await this.run(
      `(async () => { const v = await (${expression}); try { return JSON.stringify(v, null, 2); } catch { return String(v); } })()`,
      "running the expression",
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
    clearTimeout(this.frameTimer);
    clearTimeout(this.networkTimer);
    this.frameTimer = undefined;
    this.networkTimer = undefined;
    this.pending = undefined;
    const window = this.window;
    this.window = undefined;
    this.gone.abort(new Error("Claude's browser was closed"));
    window?.destroy();
    this.notice = undefined;
    this.console = [];
    this.network = [];
    this.bodyIds.clear();
  }
}
