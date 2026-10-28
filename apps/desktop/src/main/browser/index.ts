import { getConfig } from "../config";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { BrowserService } from "./service";
import { browserTools } from "./tools";

let service: BrowserService | undefined;

export function startBrowser(): void {
  const browser = new BrowserService({
    state: (state) => emit("browser.state", state),
    frame: (frame) => emit("browser.frame", frame),
    // The view opens by itself unless you turned browser.showWhenUsed off.
    reveal: () => {
      if (getConfig().browser.showWhenUsed) emit("browser.reveal", undefined);
    },
  });
  service = browser;
  registerJigTools(browserTools(() => browser));

  handle("browser.state", () => browser.state());
  handle("browser.watch", ({ on }) => browser.watch(on));
  handle("browser.navigate", async ({ url, action }) =>
    url ? browser.open(url) : browser.navigate(action ?? "reload"),
  );
  handle("browser.input", (event) => browser.input(event));
  handle("browser.resize", ({ width, height }) => browser.resize(width, height));
  handle("browser.console", ({ clear }) => browser.consoleEntries(Boolean(clear)));
  handle("browser.close", () => browser.close());
}

export function stopBrowser(): void {
  service?.close();
}
