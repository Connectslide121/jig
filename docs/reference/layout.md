# Layout reference

Source of truth: `apps/desktop/src/shared/layout.ts` (schema + pure operations, unit-tested in
`layout.test.ts`). Stored in `~/.jig/layout.json`.

## Model

```jsonc
{
  "version": 1,
  "left":   { "views": ["jig.projects", "jig.sessions"], "active": "jig.sessions", "size": 280, "collapsed": false },
  "right":  { "views": [], "size": 320, "collapsed": true },
  "bottom": { "views": ["jig.terminals"], "active": "jig.terminals", "size": 260, "collapsed": true },
  "hidden": ["addon.pipelines.view"],
  "main":   { "tabs": [{ "id": "t…", "type": "jig.chat", "params": { "sessionId": "…" } }], "active": "t…" }
}
```

- **Regions** `left`, `right`, `bottom` hold **views** by id. A region shows one view at a time; the
  others are tabs in its header. `size` is the width (left/right) or height (bottom) in px (120–2000).
- **hidden**: views the user hid. They come back from the layout menu (top bar) → Views, or
  Settings → Layout.
- **main**: tabs in the main area, in order, and the active one. A tab is `{ id, type, params }`;
  opening a tab whose `type` + `params` already exist focuses that tab instead (`tabKey`). At most
  50 tabs (the oldest is closed). Tab types marked `singleton` (Settings) reuse their one tab.
- The top bar and status bar are fixed; add-ons contribute to them through slots (phase 6).

`normalizeLayout(layout, views)` runs after every change and on load: views that exist but are not
placed anywhere (a new add-on) go to their `defaultRegion`; views that are unknown right now (an add-on
that is reloading or switched off) are kept in place but never shown; duplicates are removed.

## Operations

| Function | What |
|---|---|
| `moveView(layout, viewId, region)` | move (or un-hide) a view into a region, activate it, expand the region |
| `hideView` / `showView(layout, viewId, fallbackRegion)` | hide / show and activate |
| `setRegion(layout, region, { size?, collapsed?, active? })`, `toggleRegion` | resize, collapse/expand |
| `reorderView(layout, viewId, index)` | order within a region |
| `openTab(layout, { type, params })` → `{ layout, tabId }` | open or focus a tab |
| `closeTab`, `closeOtherTabs`, `closeTabsWhere(predicate)`, `activateTab`, `cycleTab(±1)`, `moveTab`, `updateTabParams` | tab housekeeping |

All operations are pure (they return a new layout). In the renderer, `updateLayout(fn)`
(`renderer/workbench/store.ts`) applies one, normalises and saves (debounced `layout.set`). Host code
(the builder, level 1) writes with `setLayout()` (`main/layout`) and the renderer follows the
`layout.changed` event.

## Registered ids (core)

| Kind | Id | What |
|---|---|---|
| view | `jig.projects` | project list (left) |
| tab type | `jig.project` | project dashboard (`params.projectId`) |
| tab type | `jig.settings` | Settings (`params.section`: appearance, layout, engine, terminal, learning, about, or an add-on's page) |

Later phases add `jig.sessions`, `jig.chat`, `jig.terminals`, … and each add-on's views as
`addon.<addon-id>.<view-id>`.

## Menus and shortcuts

Every view has a `⋯` menu (and a right-click menu on its tab): Move to left sidebar / right sidebar /
bottom panel, Hide. The top bar's layout button toggles regions and shows/hides views. Main-area tabs:
middle-click or `×` closes; right-click → Close, Close others, Close all; drag to reorder.

| Shortcut | Action (also in the Tools menu) |
|---|---|
| `Ctrl+,` | Settings |
| `Ctrl+B` / `Ctrl+Alt+B` / `Ctrl+J` | toggle left sidebar / right sidebar / bottom panel |
| `Ctrl+W` | close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | next / previous tab |
| `Ctrl+Shift+I` | developer tools |

(On macOS `Ctrl` is `Cmd`, except for `Ctrl+Tab`.)
