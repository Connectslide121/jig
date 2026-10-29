import { FlaskConical, Globe } from "lucide-react";
import { useHostEvent } from "../../lib/host";
import { registerAction, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { BrowserView } from "./BrowserView";
import { testSomething } from "./testing";

export const BROWSER_VIEW = "jig.browser";

export function registerBrowser(): void {
  registerView({
    id: BROWSER_VIEW,
    title: "Claude's browser",
    icon: Globe,
    defaultRegion: "right",
    component: BrowserView,
    owner: "core",
  });
  registerAction({
    id: "jig.openBrowser",
    title: "Open Claude's browser",
    group: "Claude",
    icon: Globe,
    keywords: ["browser", "web", "preview", "localhost"],
    run: () => workbench.showView(BROWSER_VIEW),
  });
  registerAction({
    id: "jig.testSomething",
    title: "Test something…",
    group: "Claude",
    icon: FlaskConical,
    keywords: ["test", "check", "qa", "browser", "haiku", "cheap"],
    run: () => void testSomething(),
  });
}

/** Mounted once: Claude started using its browser, so show it. */
export function useBrowserReveal(): void {
  useHostEvent("browser.reveal", () => workbench.showView(BROWSER_VIEW));
}
