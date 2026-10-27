import { describe, expect, it } from "vitest";
import {
  activateTab,
  closeOtherTabs,
  closeTab,
  closeTabsWhere,
  cycleTab,
  defaultLayout,
  findView,
  hideView,
  LayoutSchema,
  MAX_TABS,
  moveTab,
  moveView,
  normalizeLayout,
  openTab,
  reorderView,
  setRegion,
  showView,
  tabKey,
  toggleRegion,
  updateTabParams,
} from "./layout";

const views = [
  { id: "jig.projects", defaultRegion: "left" as const },
  { id: "jig.sessions", defaultRegion: "left" as const },
  { id: "jig.terminal", defaultRegion: "bottom" as const },
];

const base = () => normalizeLayout(defaultLayout(), views);

describe("layout schema", () => {
  it("has defaults for every field and survives partial files", () => {
    const layout = LayoutSchema.parse({ left: { size: 300 } });
    expect(layout.left).toMatchObject({ size: 300, collapsed: false, views: [] });
    expect(layout.right.collapsed).toBe(true);
    expect(layout.main.tabs).toEqual([]);
  });
});

describe("views", () => {
  it("places new views in their default region and activates the first", () => {
    const layout = base();
    expect(layout.left.views).toEqual(["jig.projects", "jig.sessions"]);
    expect(layout.left.active).toBe("jig.projects");
    expect(layout.bottom.views).toEqual(["jig.terminal"]);
  });

  it("keeps the user's placement, removes duplicates and keeps unknown views inactive", () => {
    const custom = LayoutSchema.parse({
      left: { views: ["addon.gone", "jig.sessions"], active: "addon.gone" },
      right: { views: ["jig.projects", "jig.sessions"] },
    });
    const layout = normalizeLayout(custom, views);
    expect(layout.left.views).toEqual(["addon.gone", "jig.sessions"]);
    expect(layout.left.active).toBe("jig.sessions");
    expect(layout.right.views).toEqual(["jig.projects"]);
  });

  it("does not re-add hidden views", () => {
    const layout = normalizeLayout(hideView(base(), "jig.terminal"), views);
    expect(findView(layout, "jig.terminal")).toBe("hidden");
    expect(layout.bottom.views).toEqual([]);
    expect(layout.bottom.active).toBeUndefined();
  });

  it("moves a view, activating and expanding the target region", () => {
    const layout = moveView(base(), "jig.sessions", "right");
    expect(layout.left.views).toEqual(["jig.projects"]);
    expect(layout.right).toMatchObject({ views: ["jig.sessions"], active: "jig.sessions", collapsed: false });
  });

  it("moving the active view activates its neighbour", () => {
    let layout = setRegion(base(), "left", { active: "jig.sessions" });
    layout = moveView(layout, "jig.sessions", "bottom");
    expect(layout.left.active).toBe("jig.projects");
  });

  it("shows hidden views again in the fallback region", () => {
    let layout = hideView(base(), "jig.projects");
    layout = showView(layout, "jig.projects", "right");
    expect(layout.right.views).toEqual(["jig.projects"]);
    expect(layout.hidden).toEqual([]);
    const shown = showView(toggleRegion(base(), "left"), "jig.sessions", "right");
    expect(shown.left).toMatchObject({ active: "jig.sessions", collapsed: false });
  });

  it("resizes within bounds, toggles and reorders", () => {
    expect(setRegion(base(), "left", { size: 50 }).left.size).toBe(120);
    expect(setRegion(base(), "left", { size: 333.4 }).left.size).toBe(333);
    expect(toggleRegion(base(), "right").right.collapsed).toBe(false);
    expect(reorderView(base(), "jig.sessions", 0).left.views).toEqual(["jig.sessions", "jig.projects"]);
    expect(reorderView(base(), "nope", 0)).toEqual(base());
  });

  it("never mutates its input", () => {
    const layout = base();
    const before = JSON.stringify(layout);
    moveView(layout, "jig.sessions", "right");
    hideView(layout, "jig.projects");
    openTab(layout, { type: "x" });
    expect(JSON.stringify(layout)).toBe(before);
  });
});

describe("tabs", () => {
  it("opens a tab right of the active one, or focuses an existing identical tab", () => {
    let { layout, tabId: a } = openTab(base(), { type: "jig.settings" });
    ({ layout } = openTab(layout, { type: "jig.chat", params: { sessionId: "1" } }));
    layout = activateTab(layout, a);
    const third = openTab(layout, { type: "jig.chat", params: { sessionId: "2" } });
    expect(third.layout.main.tabs.map((t) => t.params.sessionId ?? "s")).toEqual(["s", "2", "1"]);
    const again = openTab(third.layout, { type: "jig.chat", params: { sessionId: "1" } });
    expect(again.layout.main.tabs).toHaveLength(3);
    expect(again.layout.main.active).toBe(again.tabId);
    expect(again.layout.main.tabs.find((t) => t.id === again.tabId)?.params.sessionId).toBe("1");
  });

  it("identifies tabs by type and params regardless of key order", () => {
    expect(tabKey({ type: "d", params: { a: 1, b: "x" } })).toBe(
      tabKey({ type: "d", params: { b: "x", a: 1 } }),
    );
    expect(tabKey({ type: "d", params: { a: 1 } })).not.toBe(tabKey({ type: "d", params: { a: 2 } }));
  });

  it("closes tabs and activates the neighbour", () => {
    let layout = base();
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const r = openTab(layout, { type: "t", params: { n } });
      layout = r.layout;
      ids.push(r.tabId);
    }
    layout = activateTab(layout, ids[1]!);
    layout = closeTab(layout, ids[1]!);
    expect(layout.main.active).toBe(ids[2]);
    layout = closeTab(layout, ids[2]!);
    expect(layout.main.active).toBe(ids[0]);
    layout = closeTab(layout, ids[0]!);
    expect(layout.main).toEqual({ tabs: [], active: undefined });
    expect(closeTab(layout, "nope")).toBe(layout);
  });

  it("cycles, moves, closes others and closes by predicate", () => {
    let layout = base();
    for (const n of [1, 2, 3]) layout = openTab(layout, { type: "t", params: { n } }).layout;
    const [a, b, c] = layout.main.tabs.map((t) => t.id);
    expect(cycleTab(layout, 1).main.active).toBe(a);
    expect(cycleTab(layout, -1).main.active).toBe(b);
    expect(moveTab(layout, c!, 0).main.tabs.map((t) => t.id)).toEqual([c, a, b]);
    expect(closeOtherTabs(layout, b!).main.tabs.map((t) => t.id)).toEqual([b]);
    expect(closeTabsWhere(layout, (t) => t.params.n !== 2).main.tabs.map((t) => t.id)).toEqual([b]);
    expect(updateTabParams(layout, a!, { x: 1 }).main.tabs[0]?.params).toEqual({ n: 1, x: 1 });
  });

  it("caps the number of tabs by closing the oldest", () => {
    let layout = base();
    for (let n = 0; n < MAX_TABS + 5; n++) layout = openTab(layout, { type: "t", params: { n } }).layout;
    expect(layout.main.tabs).toHaveLength(MAX_TABS);
    expect(layout.main.tabs.some((t) => t.params.n === MAX_TABS + 4)).toBe(true);
  });
});
