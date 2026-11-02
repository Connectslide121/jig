import { FlaskConical, Globe } from "lucide-react";
import { useHostEvent } from "../../lib/host";
import { registerAction, registerTopbarItem, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { BrowserButton } from "./BrowserButton";
import { BrowserView } from "./BrowserView";
import { testSomething } from "./testing";
import { UserBrowserView } from "./UserBrowserView";

export const BROWSER_VIEW = "jig.browser";

export function registerBrowser(): void {
  registerTopbarItem({ id: "jig.browser", order: -5, component: BrowserButton, owner: "core" });
  registerView({
    id: BROWSER_VIEW,
    title: "Claude’s browser",
    icon: Globe,
    defaultRegion: "right",
    component: BrowserView,
    owner: "core",
  });
  registerView({
    id: "jig.userBrowser",
    title: "Browser",
    icon: Globe,
    defaultRegion: "right",
    startHidden: true,
    component: UserBrowserView,
    owner: "core",
  });
  registerAction({
    id: "jig.openClaudeBrowser",
    title: "Open Claude’s browser",
    group: "Claude",
    icon: Globe,
    keywords: ["agent", "browser", "automation"],
    run: () => workbench.showView(BROWSER_VIEW),
  });
  registerAction({
    id: "jig.openBrowser",
    title: "Open Browser",
    group: "Tools",
    icon: Globe,
    keywords: ["browser", "web", "preview", "localhost"],
    run: () => workbench.openViewTab("jig.userBrowser"),
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
