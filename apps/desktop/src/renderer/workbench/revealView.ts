import { useEffect } from "react";
import { revealAction, viewVisible } from "../../shared/layout";
import { focusedPanel } from "./focusedPanel";
import { useWorkbench, workbench } from "./store";
import { setViewBadge } from "./viewBadges";

/** Per view, what wanted attention while it stayed out of sight in your panel: the badge counts them. */
const unseen = new Map<string, Set<string>>();

/**
 * A view wants attention on its own (a chat browsed, a chat started a terminal): it shows itself,
 * unless you are working on another tab of its panel; then its tab gets a badge instead (D-349),
 * counting the distinct `key`s (chats, terminals) until the view is on screen (`useClearViewBadge`).
 */
export function revealView(viewId: string, key: string): void {
  const layout = useWorkbench.getState().layout;
  const action = layout ? revealAction(layout, viewId, focusedPanel()) : "show";
  if (action === "show") workbench.showView(viewId);
  if (action !== "badge") return;
  const keys = unseen.get(viewId) ?? new Set<string>();
  keys.add(key);
  unseen.set(viewId, keys);
  setViewBadge(viewId, String(keys.size));
}

/** Mounted once per view that uses `revealView`: clears its badge once the view is on screen. */
export function useClearViewBadge(viewId: string): void {
  const visible = useWorkbench((s) => (s.layout ? viewVisible(s.layout, viewId) : false));
  useEffect(() => {
    if (!visible) return;
    unseen.delete(viewId);
    setViewBadge(viewId);
  }, [visible, viewId]);
}
