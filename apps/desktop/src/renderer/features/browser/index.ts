import { FlaskConical, Globe, MonitorCog } from "lucide-react";
import { useEffect } from "react";
import { revealAction, viewVisible } from "../../../shared/layout";
import { useHostEvent } from "../../lib/host";
import { focusedPanel } from "../../workbench/focusedPanel";
import { registerAction, registerTopbarItem, registerView } from "../../workbench/registry";
import { useWorkbench, workbench } from "../../workbench/store";
import { setViewBadge } from "../../workbench/viewBadges";
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
    title: "Open Claude’s browser",
    group: "Claude",
    icon: MonitorCog,
    keywords: ["agent", "browser", "automation"],
    run: () => workbench.showView(BROWSER_VIEW),
  });
  registerAction({
    id: "jig.openBrowser",
    title: "Open Browser",
    // Beside "Open Claude's browser" in the Chats menu (a "Tools" group was a one-item top bar menu).
    group: "Claude",
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

/** Chats that browsed while the view stayed out of sight in your panel: the badge counts them. */
const unseen = new Set<string>();

/**
 * Mounted once: a chat started using its page of Claude's browser. The view shows itself, unless
 * you are working on another tab of its panel: then its tab gets a badge instead (D-349), which
 * clears once the view is on screen.
 */
export function useBrowserReveal(): void {
  useHostEvent("browser.reveal", ({ chatId }) => {
    const layout = useWorkbench.getState().layout;
    const action = layout ? revealAction(layout, BROWSER_VIEW, focusedPanel()) : "show";
    if (action === "show") workbench.showView(BROWSER_VIEW);
    if (action !== "badge") return;
    unseen.add(chatId);
    setViewBadge(BROWSER_VIEW, String(unseen.size));
  });
  const visible = useWorkbench((s) => (s.layout ? viewVisible(s.layout, BROWSER_VIEW) : false));
  useEffect(() => {
    if (!visible) return;
    unseen.clear();
    setViewBadge(BROWSER_VIEW);
  }, [visible]);
}
