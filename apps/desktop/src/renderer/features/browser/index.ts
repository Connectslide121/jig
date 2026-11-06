import { FlaskConical, Globe, MonitorCog } from "lucide-react";
import { useHostEvent } from "../../lib/host";
import { registerAction, registerTopbarItem, registerView } from "../../workbench/registry";
import { revealView, useClearViewBadge } from "../../workbench/revealView";
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
    title: "Jig’s browser",
    icon: MonitorCog,
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
    title: "Open Jig’s browser",
    group: "Assistant",
    icon: MonitorCog,
    keywords: ["agent", "browser", "automation"],
    run: () => workbench.showView(BROWSER_VIEW),
  });
  registerAction({
    id: "jig.openBrowser",
    title: "Open Browser",
    // Beside "Open Claude's browser" in the Chats menu (a "Tools" group was a one-item top bar menu).
    group: "Assistant",
    icon: Globe,
    keywords: ["browser", "web", "preview", "localhost"],
    run: () => workbench.openViewTab("jig.userBrowser"),
  });
  registerAction({
    id: "jig.testSomething",
    title: "Test something…",
    group: "Assistant",
    icon: FlaskConical,
    keywords: ["test", "check", "qa", "browser", "haiku", "cheap"],
    run: () => void testSomething(),
  });
}

/**
 * Mounted once: a chat started using its page of Claude's browser. The view shows itself, unless
 * you are working on another tab of its panel: then its tab gets a badge instead (D-349), which
 * clears once the view is on screen.
 */
export function useBrowserReveal(): void {
  useHostEvent("browser.reveal", ({ chatId }) => revealView(BROWSER_VIEW, chatId));
  useClearViewBadge(BROWSER_VIEW);
}
