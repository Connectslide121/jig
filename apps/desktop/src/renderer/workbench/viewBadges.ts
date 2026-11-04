import { create } from "zustand";

/**
 * Jig's own badges on a view's icon (D-349), beside add-ons' (`ctx.setBadge`, which win when both
 * set one): e.g. Claude's browser counting chats that browsed while you worked in its panel.
 */
export const useViewBadges = create<{ badges: Record<string, string> }>(() => ({ badges: {} }));

/** Sets (or, with no text, clears) a view's badge. */
export function setViewBadge(viewId: string, text?: string): void {
  const badges = { ...useViewBadges.getState().badges };
  if (text) badges[viewId] = text;
  else if (viewId in badges) delete badges[viewId];
  else return;
  useViewBadges.setState({ badges });
}
