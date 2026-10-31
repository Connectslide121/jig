import { describe, expect, it } from "vitest";
import {
  activateTab,
  closeOtherTabs,
  closeTab,
  closeTabsWhere,
  cycleTab,
  defaultLayout,
  dropView,
  findView,
  hideView,
  LayoutSchema,
  MAX_TABS,
  moveTab,
  moveTabToPane,
  moveView,
  normalizeLayout,
  openTab,
  openViewTab,
  paneActive,
  paneTabs,
  reorderView,
  setPaneSize,
  setRegion,
  showView,
  splitBeside,
  tabKey,
  toggleRegion,
  updateTabParams,
  VIEW_TAB,
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

  it("keeps the user's placement, removes duplicates and keeps a reloading view active", () => {
    const custom = LayoutSchema.parse({
      left: { views: ["addon.gone", "jig.sessions"], active: "addon.gone" },
      right: { views: ["jig.projects", "jig.sessions"] },
    });
    const layout = normalizeLayout(custom, views);
    expect(layout.left.views).toEqual(["addon.gone", "jig.sessions"]);
    expect(layout.left.active).toBe("addon.gone");
    const moved = normalizeLayout(
      LayoutSchema.parse({ left: { views: ["jig.sessions"], active: "addon.moved-away" } }),
      views,
    );
    expect(moved.left.active).toBe("jig.sessions");
    expect(layout.right.views).toEqual(["jig.projects"]);
  });

  it("reveals a newly placed view when asked (new add-on views)", () => {
    const layout = normalizeLayout(base(), [
      ...views,
      { id: "addon.x.v", defaultRegion: "right", reveal: true },
    ]);
    expect(layout.right).toMatchObject({ views: ["addon.x.v"], active: "addon.x.v", collapsed: false });
    const again = normalizeLayout(toggleRegion(layout, "right"), [
      ...views,
      { id: "addon.x.v", defaultRegion: "right", reveal: true },
    ]);
    expect(again.right.collapsed).toBe(true);
  });

  it("does not re-add hidden views", () => {
    const layout = normalizeLayout(hideView(base(), "jig.terminal"), views);
    expect(findView(layout, "jig.terminal")).toBe("hidden");
    expect(layout.bottom.views).toEqual([]);
    expect(layout.bottom.active).toBeUndefined();
    expect(findView(layout, "jig.projects")).toBe("left");
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

describe("setPaneSize", () => {
  it("remembers pixel sizes and split ratios within bounds", () => {
    let layout = defaultLayout();
    expect(layout.panes).toEqual({});
    layout = setPaneSize(layout, "jig.terminals.list", 250.4);
    layout = setPaneSize(layout, "addon.git.diff", 0.95);
    layout = setPaneSize(layout, "tiny", 10);
    expect(layout.panes).toEqual({ "jig.terminals.list": 250, "addon.git.diff": 0.9, tiny: 48 });
    expect(setPaneSize(layout, "", 100)).toBe(layout);
  });
});

describe("views as main tabs", () => {
  it("opens a view as a tab, out of its sidebar, and focuses that tab again", () => {
    const { layout, tabId } = openViewTab(base(), "jig.sessions");
    expect(layout.left.views).not.toContain("jig.sessions");
    expect(findView(layout, "jig.sessions")).toBe("hidden");
    expect(layout.main.tabs).toEqual([{ id: tabId, type: VIEW_TAB, params: { viewId: "jig.sessions" } }]);
    expect(layout.main.active).toBe(tabId);
    const again = openViewTab(layout, "jig.sessions");
    expect(again.tabId).toBe(tabId);
    expect(again.layout.main.tabs).toHaveLength(1);
  });

  it("closes the view's tab when it moves into a sidebar (a view is in one place)", () => {
    const { layout } = openViewTab(base(), "jig.sessions");
    const opened = openTab(layout, { type: "jig.chat", params: { sessionId: "a" } }).layout;
    const moved = dropView(opened, "jig.sessions", "right2");
    expect(moved.right2.views).toEqual(["jig.sessions"]);
    expect(moved.right.collapsed).toBe(false);
    expect(moved.main.tabs.map((t) => t.type)).toEqual(["jig.chat"]);
  });

  it("normalizing closes the tab of a view that is back in a sidebar (Reset layout)", () => {
    const { layout } = openViewTab(base(), "jig.sessions");
    const reset = normalizeLayout({ ...defaultLayout(), main: layout.main }, views);
    expect(reset.left.views).toContain("jig.sessions");
    expect(reset.main.tabs).toEqual([]);
  });
});

describe("split sidebar (a lower half with its own tabs)", () => {
  const git = { id: "addon.git.git", defaultRegion: "left" as const };
  const repos = { id: "addon.repos.overview", defaultRegion: "left2" as const };

  it("starts a view in a lower half and keeps it there", () => {
    const layout = normalizeLayout(defaultLayout(), [...views, git, repos]);
    expect(layout.left2.views).toEqual(["addon.repos.overview"]);
    expect(findView(layout, "addon.repos.overview")).toBe("left2");
  });

  it("moves a lower half up when its sidebar has nothing else", () => {
    const layout = normalizeLayout(defaultLayout(), [repos]);
    expect(layout.left.views).toEqual(["addon.repos.overview"]);
    expect(layout.left2.views).toEqual([]);
  });

  it("splits a view beside another and moves it back", () => {
    const layout = normalizeLayout(defaultLayout(), [...views, git]);
    const split = splitBeside(layout, "addon.git.git", "jig.sessions");
    expect(split.left2.views).toEqual(["addon.git.git"]);
    expect(split.left2.active).toBe("addon.git.git");
    expect(split.left.views).not.toContain("addon.git.git");
    const back = moveView(split, "addon.git.git", "left");
    expect(back.left2.views).toEqual([]);
    expect(back.left.views).toContain("addon.git.git");
    expect(splitBeside(layout, "jig.sessions", "jig.sessions")).toBe(layout);
  });

  it("opens and collapses the whole sidebar from its lower half", () => {
    let layout = normalizeLayout(defaultLayout(), [...views, repos]);
    layout = toggleRegion(layout, "left2");
    expect(layout.left.collapsed).toBe(true);
    layout = showView(layout, "addon.repos.overview", "left");
    expect(layout.left.collapsed).toBe(false);
    expect(layout.left2.active).toBe("addon.repos.overview");
    expect(setRegion(layout, "left2", { size: 400 }).left2.size).toBe(400);
  });

  it("a lower half takes drops on its tab bar", () => {
    const layout = normalizeLayout(defaultLayout(), [...views, repos]);
    const next = dropView(layout, "jig.sessions", "left2", "addon.repos.overview");
    expect(next.left2.views).toEqual(["jig.sessions", "addon.repos.overview"]);
    expect(next.left2.active).toBe("jig.sessions");
  });

  it("keeps a view you moved yourself where you put it", () => {
    const first = normalizeLayout(defaultLayout(), [...views, repos]);
    const moved = moveView(first, "addon.repos.overview", "bottom");
    expect(normalizeLayout(moved, [...views, repos, git]).bottom.views).toContain("addon.repos.overview");
  });

  it("a view that starts hidden is not placed until it is shown", () => {
    const releases = { id: "addon.releases.releases", defaultRegion: "right" as const, hidden: true };
    const layout = normalizeLayout(defaultLayout(), [...views, releases]);
    expect(layout.hidden).toEqual(["addon.releases.releases"]);
    expect(layout.right.views).toEqual([]);
    const shown = showView(layout, "addon.releases.releases", "right");
    expect(shown.right.views).toEqual(["addon.releases.releases"]);
    expect(shown.hidden).toEqual([]);
    expect(normalizeLayout(hideView(shown, "addon.releases.releases"), [...views, releases]).hidden).toEqual([
      "addon.releases.releases",
    ]);
  });

  it("moves views that old layouts showed below another view into the lower half", () => {
    const old = LayoutSchema.parse({
      left: { views: ["jig.projects", "jig.sessions"] },
      sections: { "jig.sessions": ["addon.repos.overview"] },
    });
    const layout = normalizeLayout(old, [...views, repos]);
    expect(layout.left2.views).toEqual(["addon.repos.overview"]);
    expect(layout.sections).toBeUndefined();
  });
});

describe("split view", () => {
  const three = () => {
    let l = base();
    for (const n of ["a", "b", "c"]) l = openTab(l, { type: "t", params: { n }, id: n }).layout;
    return l;
  };
  const ids = (l: ReturnType<typeof base>, pane: "left" | "right") => paneTabs(l, pane).map((t) => t.id);

  it("opens a tab to the side: two panes, each keeping its active tab", () => {
    const split = moveTabToPane(three(), "c", "right");
    expect(ids(split, "left")).toEqual(["a", "b"]);
    expect(ids(split, "right")).toEqual(["c"]);
    expect(split.main.split?.focus).toBe("right");
    expect(paneActive(split, "right")).toBe("c");
    expect(paneActive(split, "left")).toBe("b");
    // Activating a left tab moves the focus; the right pane keeps "c".
    const left = activateTab(split, "a");
    expect(left.main.split?.focus).toBe("left");
    expect(paneActive(left, "right")).toBe("c");
    // New tabs open in the focused pane.
    const opened = openTab(split, { type: "t", params: { n: "d" }, id: "d" }).layout;
    expect(ids(opened, "right")).toEqual(["c", "d"]);
  });

  it("closing the last tab of a pane ends the split; a lone tab can't leave one pane", () => {
    const split = moveTabToPane(three(), "c", "right");
    const closed = closeTab(split, "c");
    expect(closed.main.split).toBeUndefined();
    expect(closed.main.active).toBe("b");
    const one = openTab(base(), { type: "t", params: {}, id: "x" }).layout;
    expect(moveTabToPane(one, "x", "right")).toBe(one);
    // Moving the right pane's only tab back ends the split too.
    const back = moveTabToPane(split, "c", "left");
    expect(back.main.split).toBeUndefined();
    expect(back.main.active).toBe("c");
  });

  it("closing the active tab of the other pane picks its neighbour", () => {
    let split = moveTabToPane(three(), "c", "right");
    split = moveTabToPane(split, "b", "right");
    split = activateTab(split, "a");
    expect(paneActive(split, "right")).toBe("b");
    const closed = closeTab(split, "b");
    expect(paneActive(closed, "right")).toBe("c");
    expect(closed.main.active).toBe("a");
  });

  it("survives a saved layout with unknown tabs in the split", () => {
    const l = LayoutSchema.parse({
      main: { tabs: [{ id: "a", type: "t" }], active: "a", split: { right: ["gone"], focus: "right" } },
    });
    const normal = normalizeLayout(l, views);
    expect(normal.main.split).toBeUndefined();
    expect(normal.main.active).toBe("a");
  });
});

describe("dropView", () => {
  it("moves a view to another region before a tab, or reorders it in its region", () => {
    let l = dropView(base(), "jig.terminal", "left", "jig.sessions");
    expect(l.left.views).toEqual(["jig.projects", "jig.terminal", "jig.sessions"]);
    expect(l.left.active).toBe("jig.terminal");
    expect(l.bottom.views).toEqual([]);
    l = dropView(l, "jig.projects", "left");
    expect(l.left.views).toEqual(["jig.terminal", "jig.sessions", "jig.projects"]);
    l = dropView(l, "jig.sessions", "right");
    expect(l.right.views).toEqual(["jig.sessions"]);
    expect(dropView(l, "jig.terminal", "left", "jig.terminal")).toBe(l);
  });
});
