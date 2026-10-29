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
  "sections": { "addon.git.git": ["addon.repos.overview"] },
  "closedSections": [],
  "waitingUnder": [],
  "panes":  { "jig.terminals.list": 240, "addon.git.diff": 0.4, "section:addon.repos.overview": 240 },
  "main":   { "tabs": [{ "id": "t…", "type": "jig.chat", "params": { "sessionId": "…" } }], "active": "t…",
              "split": { "right": ["t…"], "focus": "left", "other": "t…" } }
}
```

- **Regions** `left`, `right`, `bottom` hold **views** by id. A region shows one view at a time; the
  others are tabs in its header. `size` is the width (left/right) or height (bottom) in px (120–2000).
  Drag the edge of a region (an 8px handle on its border, highlighted on hover) to resize it, or focus
  the handle and use the arrow keys (Shift: bigger steps); double-click resets. The main area always
  keeps at least 320px.
- **panes**: sizes of resizable panes inside views and tabs, by pane id — px, or a 0–1 ratio for a
  two-column split (`setPaneSize`). Core panes: `jig.terminals.list`, `jig.settings.nav`; the Git
  add-on's diff uses `addon.git.diff`. Add-ons use `Pane` / `useSplitRatio` from `@jig/sdk/ui`.
- **sections** (D-099): views shown *below* another view, in its tab, like GitLens below Source Control
  in VS Code. Host view id → section view ids, top to bottom; one level deep. Each section has a header
  (click to collapse, ⋯ for its menu) and its own height, dragged at its top edge
  (`panes["section:<view>"]`, 240 px by default, double-click resets). **closedSections** are collapsed
  to their header. The Repos add-on's view starts below Git (`"under": "addon.git.git"` in its
  manifest).
  - Any view's ⋯ menu (or right-click on its tab) has **Show below…**, listing the other views.
  - A section's ⋯ menu has **Move to its own tab**.
  - **waitingUnder**: a new view whose host hasn't loaded yet waits in its default region and moves
    below the host once it is placed. A view you moved yourself stays where you put it.
- **hidden**: views the user hid. They come back from the layout menu (top bar) → Views, or
  Settings → Layout.
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
placed anywhere (a new add-on) go to their `defaultRegion`, or below their `under` view; views that are unknown right now (an add-on
that is reloading or switched off) are kept in place but never shown; duplicates are removed.

## Operations

| Function | What |
|---|---|
| `moveView(layout, viewId, region)` | move (or un-hide) a view into a region, activate it, expand the region |
| `hideView` / `showView(layout, viewId, fallbackRegion)` | hide / show and activate (a section: activate its host and open the section) |
| `placeBelow(layout, viewId, hostId)`, `toggleSection(layout, viewId)`, `hostOf(layout, viewId)` | show a view as a section below another, collapse/open it, find its host |
| `setRegion(layout, region, { size?, collapsed?, active? })`, `toggleRegion` | resize, collapse/expand |
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
(global). Long-running output goes to the **bottom**. You can move any view anywhere.

| Kind | Id | Starts | What |
|---|---|---|---|
| view | `jig.projects` | left | projects and workspaces |
| view | `jig.links` | left, below Projects | the active project's links (D-109) |
| view | `jig.sessions` | left | chats, grouped by project |
| view | `addon.files.files` | left | the project's files (`Ctrl+Shift+E`) |
| view | `addon.git.git` | left | Git for the project's repository |
| view | `addon.workflows.workflows` | left | the project's workflows (D-112) |
| view | `addon.repos.overview` | right, below Git | every repository at a glance |
| view | `addon.scripts.scripts` | right | scripts of every workspace folder |
| view | `addon.pipelines.pipelines` | right | Azure DevOps pipelines |
| view | `addon.releases.releases` | right | releases of every repository (D-110) |
| view | `jig.suggestions` | right | suggestions (Learning) |
| view | `jig.browser` | right | Claude's browser |
| view | `jig.terminals` | bottom | terminals |
| view | `jig.builds` | bottom | builds of the in-app builder |
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

| Shortcut | Action (also in the Tools menu) |
|---|---|
| `Ctrl+K` | Tools: every action, searchable |
| `Ctrl+N` | new chat (also the **New chat** button in the top bar) |
| `Ctrl+,` | Settings |
| `Ctrl+B` / `Ctrl+Alt+B` / `Ctrl+J` | toggle left sidebar / right sidebar / bottom panel |
| `Ctrl+W` | close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | next / previous tab |
| `Ctrl+Shift+I` | developer tools |

(On macOS `Ctrl` is `Cmd`, except for `Ctrl+Tab`.)

Top-bar buttons expose each registered action group directly through the shared Menu component. Groups scroll horizontally on narrow windows; the all-tools icon and Ctrl+K retain searchable access to every action. No new view IDs or slots.

Top-bar menus form one menu bar: click to open a group, then hovering another group switches the open menu. Hovering while closed leaves menus closed; Escape, selecting an action or clicking outside ends menu-bar navigation. Panel view tabs use `text-sm` labels, `size-4` icons and `h-7` controls; action-group labels in the top bar use `text-sm`.

Menus survive window blur (including the Windows screenshot overlay). Escape, selecting an action and clicking outside within Jig still dismiss them.

Jig-wide actions appear once in the main Jig logo/name menu; the duplicate Jig group button is omitted. The main menu derives those actions from the existing registry and adds Keyboard shortcuts/Extension slots.
