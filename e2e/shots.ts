/**
 * Screenshots of a view at the widths it can be shown at, for a design check (docs/guides/testing.md →
 * "Put the UI in a state and screenshot it"). The view is really placed there (the layout is saved and
 * the window reloads it, as on start), so its `@container` sizes respond as in real use.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { expect, hostCall, settledBox } from "./fixtures";

/** Where a view can be shown: a narrow sidebar, the wide bottom panel, a tab in the main area. */
export type Placement = "sidebar" | "bottom" | "tab";

/** `.tmp/shots/` in the repository (git-ignored). */
export const SHOTS_DIR = fileURLToPath(new URL("../.tmp/shots/", import.meta.url));

interface Region {
  views: string[];
  active?: string;
  size: number;
  collapsed: boolean;
}
interface Layout {
  left: Region;
  left2: Region;
  right: Region;
  right2: Region;
  bottom: Region;
  hidden: string[];
  main: {
    tabs: Array<{ id: string; type: string; params: Record<string, unknown> }>;
    active?: string;
    split?: unknown;
  };
}
const REGIONS = ["left", "left2", "right", "right2", "bottom"] as const;
const VIEW_TAB = "jig.view";

/** The layout with `viewId` only at `placement` (sidebar 320 px wide, bottom panel 320 px high). */
function place(layout: Layout, viewId: string, placement: Placement): Layout {
  const next = structuredClone(layout);
  for (const r of REGIONS) {
    next[r].views = next[r].views.filter((v) => v !== viewId);
    if (next[r].active === viewId) next[r].active = next[r].views[0];
  }
  next.hidden = next.hidden.filter((v) => v !== viewId);
  next.main.tabs = next.main.tabs.filter((t) => !(t.type === VIEW_TAB && t.params.viewId === viewId));
  next.main.split = undefined;
  if (placement === "tab") {
    const id = `shot-${viewId}`;
    next.hidden.push(viewId);
    next.main.tabs.push({ id, type: VIEW_TAB, params: { viewId } });
    next.main.active = id;
  } else {
    const region = placement === "sidebar" ? "right" : "bottom";
    next[region] = { ...next[region], views: [...next[region].views, viewId], active: viewId };
    next[region].size = 320;
    next[region].collapsed = false;
  }
  return next;
}

/**
 * Screenshots view `viewId` in each placement, as `.tmp/shots/<name>-<placement>.png`, and returns
 * the paths. Put the UI in its state first (it lives in the host or add-on storage, so it survives
 * the reload; an open modal does not). `ready` waits for the view's content in the panel, e.g.
 * `(panel) => expect(panel.getByTestId("tasks-view")).toBeVisible()`.
 */
export async function shootView(
  page: Page,
  viewId: string,
  name: string,
  options: { placements?: Placement[]; ready?: (panel: Locator) => Promise<void> } = {},
): Promise<string[]> {
  await mkdir(SHOTS_DIR, { recursive: true });
  const paths: string[] = [];
  for (const placement of options.placements ?? ["sidebar", "bottom", "tab"]) {
    const layout = (await hostCall(page, "layout.get")) as { value: Layout };
    await hostCall(page, "layout.set", place(layout.value, viewId, placement));
    // The renderer reads the layout when it starts; a reload shows the new one like a restart would.
    await page.reload();
    await page.waitForSelector("[data-testid=app-root] [data-testid=main-area]");
    const panel = page.getByTestId(
      placement === "sidebar" ? "region-right" : placement === "bottom" ? "region-bottom" : "main-area",
    );
    await expect(panel).toBeVisible();
    if (placement === "tab") await expect(page.getByTestId(`view-in-main-${viewId}`)).toBeVisible();
    await options.ready?.(panel);
    await settledBox(panel);
    const path = join(SHOTS_DIR, `${name}-${placement}.png`);
    await panel.screenshot({ path, animations: "disabled" });
    paths.push(path);
  }
  return paths;
}
