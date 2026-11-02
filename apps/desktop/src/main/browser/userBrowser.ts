import { BrowserWindow, type WebContents, WebContentsView } from "electron";
import { type BrowserBounds, normalizeUrl, type UserBrowserState } from "../../shared/browser";
import { CHANNEL_EVENT } from "../../shared/ipc";
import { handle } from "../ipc/router";

/** One native page per workbench window, with cookies apart from both Jig and Claude. */
class UserBrowser {
  readonly view = new WebContentsView({
    webPreferences: {
      partition: "persist:jig-user-browser",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  private error: string | undefined;

  constructor(private readonly owner: BrowserWindow) {
    const c = this.view.webContents;
    this.view.setVisible(false);
    owner.contentView.addChildView(this.view);
    c.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    c.session.setPermissionCheckHandler(() => false);
    const guard = (event: Electron.Event, url: string) => {
      if (!/^(https?:|file:|about:blank$)/i.test(url)) event.preventDefault();
    };
    c.on("will-navigate", guard);
    c.on("will-redirect", guard);
    c.setWindowOpenHandler(({ url }) => {
      if (/^(https?:|file:)/i.test(url)) this.load(url);
      return { action: "deny" };
    });
    for (const event of [
      "did-start-loading",
      "did-stop-loading",
      "did-navigate",
      "did-navigate-in-page",
      "page-title-updated",
    ] as const)
      c.on(event as never, () => this.changed());
    c.on("did-start-navigation", (details) => {
      if (details.isMainFrame) this.error = undefined;
    });
    c.on("did-fail-load", (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        this.error = description;
        this.changed();
      }
    });
    c.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const mod = process.platform === "darwin" ? input.meta : input.control;
      if (mod && input.key.toLowerCase() === "l") {
        event.preventDefault();
        owner.webContents.focus();
        owner.webContents.send(CHANNEL_EVENT, "userBrowser.address", undefined);
      } else if (mod && ["k", "w", "n", "tab", ","].includes(input.key.toLowerCase())) {
        // Workbench actions remain reachable while the native page owns keyboard focus.
        event.preventDefault();
        owner.webContents.focus();
        const modifiers: NonNullable<Electron.InputEvent["modifiers"]> = [];
        if (input.control) modifiers.push("control");
        if (input.meta) modifiers.push("meta");
        if (input.alt) modifiers.push("alt");
        if (input.shift) modifiers.push("shift");
        owner.webContents.sendInputEvent({ type: "keyDown", keyCode: input.key, modifiers });
      } else if (input.key === "F5" || (mod && input.key.toLowerCase() === "r")) {
        event.preventDefault();
        c.reload();
      } else if (input.alt && ["ArrowLeft", "ArrowRight"].includes(input.key)) {
        event.preventDefault();
        this.navigate({ action: input.key === "ArrowLeft" ? "back" : "forward" });
      } else if (mod && ["+", "=", "-", "0"].includes(input.key)) {
        event.preventDefault();
        c.setZoomLevel(
          input.key === "0" ? 0 : Math.max(-5, Math.min(5, c.getZoomLevel() + (input.key === "-" ? -1 : 1))),
        );
      }
    });
    owner.once("closed", () => {
      if (!c.isDestroyed()) c.close();
    });
    owner.webContents.once("destroyed", () => {
      if (!c.isDestroyed()) c.close();
    });
    // A reload must never leave an orphaned native surface over the new workbench.
    owner.webContents.on("did-start-loading", () => this.view.setVisible(false));
  }

  state(): UserBrowserState {
    const c = this.view.webContents;
    return {
      url: c.getURL(),
      title: c.getTitle(),
      loading: c.isLoading(),
      canGoBack: c.navigationHistory.canGoBack(),
      canGoForward: c.navigationHistory.canGoForward(),
      error: this.error,
    };
  }

  private changed() {
    if (!this.owner.webContents.isDestroyed())
      this.owner.webContents.send(CHANNEL_EVENT, "userBrowser.state", this.state());
  }

  present(bounds: BrowserBounds, visible: boolean) {
    // DOM rectangles are CSS pixels; native bounds use device-independent pixels.
    const zoom = this.owner.webContents.getZoomFactor();
    const [width = 0, height = 0] = this.owner.getContentSize();
    const x = Math.min(width, Math.round(bounds.x * zoom));
    const y = Math.min(height, Math.round(bounds.y * zoom));
    this.view.setBounds({
      x,
      y,
      width: Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom))),
      height: Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom))),
    });
    this.view.setVisible(visible && bounds.width > 0 && bounds.height > 0);
  }

  private load(url: string) {
    this.error = undefined;
    void this.view.webContents.loadURL(url).catch(() => {});
  }

  navigate({ url, action }: { url?: string; action?: "back" | "forward" | "reload" | "stop" }) {
    const c = this.view.webContents;
    if (url) this.load(normalizeUrl(url));
    else if (action === "back" && c.navigationHistory.canGoBack()) c.navigationHistory.goBack();
    else if (action === "forward" && c.navigationHistory.canGoForward()) c.navigationHistory.goForward();
    else if (action === "stop") c.stop();
    else if (action === "reload") c.reload();
  }
}

export function registerUserBrowser(): void {
  const browsers = new WeakMap<WebContents, UserBrowser>();
  const get = (sender: WebContents) => {
    let browser = browsers.get(sender);
    if (!browser) {
      const owner = BrowserWindow.fromWebContents(sender);
      if (!owner) throw new Error("Open the browser from a Jig window");
      browser = new UserBrowser(owner);
      browsers.set(sender, browser);
    }
    return browser;
  };
  handle("userBrowser.state", (_args, { sender }) => get(sender).state());
  handle("userBrowser.present", ({ bounds, visible }, { sender }) => get(sender).present(bounds, visible));
  handle("userBrowser.navigate", (args, { sender }) => get(sender).navigate(args));
  handle("userBrowser.devtools", (_args, { sender }) =>
    get(sender).view.webContents.openDevTools({ mode: "detach" }),
  );
}
