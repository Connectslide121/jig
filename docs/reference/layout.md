# Layout reference

Source of truth: `apps/desktop/src/shared/layout.ts` (schema + pure operations, unit-tested in
`layout.test.ts`). Stored in `~/.jig/layout.json`.

## Model

```jsonc
{
  "version": 1,
  "left":   { "views": ["jig.projects", "jig.sessions"], "active": "jig.sessions", "size": 280, "collapsed": false },
  "left2":  { "views": ["addon.repos.overview"], "active": "addon.repos.overview", "size": 260, "collapsed": false },
  "right":  { "views": [], "size": 320, "collapsed": true },
  "right2": { "views": [], "size": 260, "collapsed": false },
  "bottom": { "views": ["jig.terminals"], "active": "jig.terminals", "size": 260, "collapsed": true },
  "hidden": ["addon.releases.releases", "jig.suggestions"],
  "panes":  { "jig.terminals.list": 240, "addon.git.diff": 0.4 },
  "main":   { "tabs": [{ "id": "t…", "type": "jig.chat", "params": { "sessionId": "…" } }], "active": "t…",
              "split": { "right": ["t…"], "focus": "left", "other": "t…" } }
  // a view opened as a main tab: { "type": "jig.view", "params": { "viewId": "addon.releases.releases" } }
}
```

- **Regions** `left`, `left2`, `right`, `right2`, `bottom` hold **views** by id. A region shows one view at a time; the
  others are tabs in its header. `size` is the width (left/right) or height (bottom) in px (120–2000).
  Drag the edge of a region (an 8px handle on its border, highlighted on hover) to resize it, or focus
  the handle and use the arrow keys (Shift: bigger steps); double-click resets. The main area always
  keeps at least 320px.
- **Split sidebar** (D-173): `left2` and `right2` are the lower halves of the left and right sidebars,
  each with its own tabs, like a second stack of views in the same column. A lower half shows only
  when it has views; its `size` is its height (dragged at its top edge, double-click resets). Width
  and collapsed belong to the upper half (`columnOf`): collapsing the left sidebar hides both halves.
  When the upper half is empty, the lower half's views move up. Split a sidebar by dragging a view's
  tab onto the lower part of a sidebar that isn't split ("Drop to split the sidebar"), or onto a
  lower half's tab bar; there is no menu entry for it. The Repos add-on starts in `left2`, below the
  left sidebar's tabs.
- **Drag anywhere** (D-174): drag a view's tab (in a sidebar, or a view open as a main tab) to any
  place: another region's tab bar, a sidebar's lower part (splits it), the main area ("Drop to open
  as a tab"), or, for a region that isn't showing, the dashed target at the left, right or bottom
  edge. A view's ⋯ menu also has Move to left/right/bottom, **Open as a tab** and Hide; a view's
  main tab's context menu has Move to left sidebar/right sidebar/bottom panel.
- **panes**: sizes of resizable panes inside views and tabs, by pane id — px, or a 0–1 ratio for a
  two-column split (`setPaneSize`). Core panes: `jig.terminals.list`, `jig.settings.nav`; the Git
  add-on's diff uses `addon.git.diff`. Add-ons use `Pane` / `useSplitRatio` from `@jig/sdk/ui`.
- **hidden**: views that are not in a sidebar or the bottom panel. Showing one (its action in the
  top bar menus, layout menu → Views) opens it as a **main tab** (`jig.view`, `params.viewId`,
  `openViewTab`, D-174); the builder's and settings tools' `showView` still put it in a region.
  Views used now and then start here (D-173: Suggestions, Links, Releases, Workflows) so the
  sidebars hold only daily views; a view or add-on view says so with `startHidden` / `"hidden": true`.
  A view is in one place: moving it to a region closes its main tab, and `normalizeLayout` closes
  `jig.view` tabs whose view is in a region.
- **Reset layout** (top bar layout menu, Settings → Layout, or the "Reset layout" action) asks, then
  puts every view back where it started, with default sizes and sidebars. Open tabs stay.
- Old layouts (before D-173) had `sections`, `closedSections` and `waitingUnder` (views shown below
  another view, D-099). On load, sections move to the lower half of their host's sidebar and the
  other two fields are dropped.
- **saved** (D-175): named layouts (at most 20), `[{ name, left, left2, right, right2, bottom, hidden, panes }]` — where every view is,
  sizes and sidebars, not the open chats. **View → Layout → Layouts** saves the current one
  (`saveNamedLayout`), switches (`applyNamedLayout`, keeps tabs that aren't views) and manages them;
  Settings → Layout lists them with Use / Delete; chats use the `save` / `use` layout ops.
- **main**: tabs in the main area, in order, and the active one. A tab is `{ id, type, params }`;
  opening a tab whose `type` + `params` already exist focuses that tab instead (`tabKey`). At most
  50 tabs (the oldest is closed). Tab types marked `singleton` (Settings) reuse their one tab.
- **Split view** (`main.split`, D-107): two panes side by side, each with its own tabs.
  - `right` lists the right pane's tab ids; `focus` is the pane new tabs open in, and `main.active`
    is its active tab; `other` is the other pane's active tab.
  - Open a tab on the other side by right-clicking it → **Open to the side** / Move to the other
    side, by dragging it to the right part of the main area, or by dropping it on the other pane's
    tab bar.
  - The divider's ratio is `panes["main.split"]` (double-click resets). Closing a pane's last tab,
    or **One pane**, ends the split.
- The top bar and status bar are fixed; add-ons contribute to them through slots (phase 6).

`normalizeLayout(layout, views)` runs after every change and on load: views that exist but are not
placed anywhere (a new add-on) go to their `defaultRegion` (or to `hidden` when they start hidden); views that are unknown right now (an add-on
that is reloading or switched off) are kept in place but never shown; duplicates are removed.

## Operations

| Function | What |
|---|---|
| `moveView(layout, viewId, region)` | move (or un-hide) a view into a region, activate it, expand the region |
| `hideView` / `showView(layout, viewId, fallbackRegion)` | hide / show and activate (un-hiding into `fallbackRegion`) |
| `splitBeside(layout, viewId, hostId)` | move a view to the lower half of the sidebar `hostId` is in (the bottom panel if the host is there) |
| `setRegion(layout, region, { size?, collapsed?, active? })`, `toggleRegion` | resize, collapse/expand (`collapsed` of a lower half goes to its sidebar, `columnOf`) |
| `reorderView(layout, viewId, index)` | order within a region |
| `dropView(layout, viewId, region, beforeId?)` | drag and drop: move to `region` (if elsewhere) before `beforeId` or at the end, and show it |
| `openTab(layout, { type, params })` → `{ layout, tabId }` | open or focus a tab |
| `closeTab`, `closeOtherTabs`, `closeTabsWhere(predicate)`, `activateTab`, `cycleTab(±1)`, `moveTab`, `updateTabParams` | tab housekeeping (split-aware: activating a tab focuses its pane) |
| `moveTabToPane(layout, tabId, "left" \| "right")`, `unsplit`, `paneOf`, `paneTabs`, `paneActive` | split view |

All operations are pure (they return a new layout). In the renderer, `updateLayout(fn)`
(`renderer/workbench/store.ts`) applies one, normalises and saves (debounced `layout.set`). Host code
(the builder, level 1) writes with `setLayout()` (`main/layout`) and the renderer follows the
`layout.changed` event.

## Registered ids

**Where a view starts** (D-102, a guideline, not a rule): views about the active project start on the
**left** (they follow the project you switch to); views that cover everything start on the **right**
(global). Long-running output goes to the **bottom**. Views used now and then start **hidden** and
open from a top bar menu as a main tab (D-173, D-174). You can drag any view anywhere.

| Kind | Id | Starts | What |
|---|---|---|---|
| view | `jig.projects` | left | projects and workspaces |
| view | `jig.links` | hidden (left) | the active project's links (D-109) |
| view | `jig.sessions` | left | chats, grouped by project |
| view | `addon.files.files` | left | the project's files (`Ctrl+Shift+E`) |
| view | `addon.git.git` | left | Git for the project's repository |
| view | `addon.workflows.workflows` | hidden (left) | the project's workflows (D-112) |
| view | `addon.repos.overview` | left2 (lower left) | every repository at a glance |
| view | `addon.scripts.scripts` | right | scripts of every workspace folder |
| view | `addon.pipelines.pipelines` | right | Azure DevOps pipelines |
| view | `addon.releases.releases` | hidden (right) | releases of every repository (D-110) |
| view | `addon.notes.notes` | right | the active chat's notes |
| view | `jig.suggestions` | hidden (right) | suggestions (Learning) |
| view | `jig.browser` | right | Claude's browser |
| view | `jig.terminals` | bottom | terminals |
| view | `jig.builds` | bottom | builds of the in-app builder |
| tab type | `jig.view` | | a view opened in the main area (`params.viewId`, D-174) |
| tab type | `jig.project` | | project dashboard: the project's Home (`params.projectId`) |
| tab type | `jig.chat` | | a chat (`params.sessionId`) |
| tab type | `jig.settings` | | Settings (`params.section`: appearance, layout, engine, terminal, learning, workspaces, about, or an add-on's page) |
| tab type | `jig.preview` / `jig.image` | | a file in Preview (editable for code and text) / an image |
| tab type | `jig.knowledge` | | What Jig knows about me (D-111) |
| tab type | `jig.about`, `jig.setup` | | What Jig can do; Get started |
| tab type | `jig.attempts`, `jig.tour`, `jig.build` | | Try several ways; a change tour; a build |
| tab type | `jig.routines`, `jig.artifacts` | | Claude Code routines and artifacts |
| tab type | `addon.git.history` / `commit` / `diff` / `compare` | | Git |
| tab type | `addon.releases.repo` | | one repository's releases (`params.path`) |
| tab type | `addon.workflows.workflow` | | a workflow (`params.projectId`, `id`; or `draft`) |

## The main area with no tab open

- **With an active project:** the project's **Home** (`features/home/Home.tsx`), also the project
  dashboard tab.
  - A box to start a chat: Enter sends the message in a new chat.
  - Starter prompts, and **Try several ways…**.
  - The project's recent chats with their status.
  - "Next steps" tiles: new chat, Git, scripts, standup, routines, artifacts, build a tool, What Jig
    can do.
  - The add-ons' dashboard widgets.
- **With no project:** the "What Jig can do" page, with Add project….

## Tab status

A tab type can report a status with `useStatus(params)`, shown as a dot on the tab:
- `working` (pulsing blue);
- `attention` (amber, needs you);
- `error` (red);
- `unread` (accent: a chat finished a turn you haven't looked at).

Chat tabs report it from the chat's status and the turns seen while the tab showed
(`useSeenTurns`, in memory).

## Menus and shortcuts

Every view has a `⋯` menu (and a right-click menu on its tab): Move to left sidebar / right sidebar /
bottom panel, Hide. **Drag a view's tab** to reorder it, or onto another sidebar's (or the bottom
panel's) tabs to move it there, before the tab you drop it on (`dropView`); the menus work as before. The top bar's layout button toggles regions and shows/hides views. Main-area tabs:
middle-click or `×` closes; right-click → Close, Close others, Close all; drag to reorder.

| Shortcut | Action (also in the grouped menus) |
|---|---|
| `Ctrl+K` / `Ctrl+P` | Search chats, files, views and actions |
| `Ctrl+N` | new chat (also the **New chat** button in the top bar) |
| `Ctrl+,` | Settings |
| `Ctrl+B` / `Ctrl+Alt+B` / `Ctrl+J` | toggle left sidebar / right sidebar / bottom panel |
| `Ctrl+W` | close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | next / previous tab |
| `Ctrl+Shift+I` | developer tools |

(On macOS `Ctrl` is `Cmd`, except for `Ctrl+Tab`.)

Top-bar menus (D-174) merge action groups into a few menus, each group under its own heading:
The separate Tools dropdown is removed (D-190). In this documentation, **Search →** means open the
top-bar search field (Go to), type the item's name and select it. `tools.action` keeps its manifest name for
compatibility and contributes to the grouped menus and search; it has no exclusive dropdown.
**Chats** (Chats, Claude, Workflows), **Code** (Git, Files, Terminals, Pipelines), **Build** and
**View** (Layout, Appearance; Reset layout is here). The Projects group's actions are in the project
switcher; the Jig group is in the Jig menu. Any other group (an add-on's own) keeps its own menu
(`TOPBAR_MENUS` in `workbench/Topbar.tsx`). Groups scroll horizontally on narrow windows; the top-bar search field, Ctrl+P and Ctrl+K provide a single search for chats, files, views and actions. No new view IDs or slots.

Top-bar menus form one menu bar: click to open a group, then hovering another group switches the open menu. Hovering while closed leaves menus closed; Escape, selecting an action or clicking outside ends menu-bar navigation. Panel view tabs use `text-sm` labels, `size-4` icons and `h-7` controls; action-group labels in the top bar use `text-sm`.

Menus survive window blur (including the Windows screenshot overlay). Escape, selecting an action and clicking outside within Jig still dismiss them.

Jig-wide actions appear once in the main Jig logo/name menu; the duplicate Jig group button is omitted. The main menu derives those actions from the existing registry and adds Keyboard shortcuts/Extension slots.

Chats shows ten chats per group initially, including pinned chats. All pinned chats remain visible
when there are more than ten. **Show more** adds up to ten unpinned chats at a time; each group keeps
its own expanded count while the view stays mounted. The header has New chat and the view's ⋯ menu.
**⋯ → View type** offers By project, By status, By day and One list. Chats board and Claude Code import
remain in the Chats top-bar menu and search (D-193).
