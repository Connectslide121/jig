# Phase 3 — Workbench shell

**Goal:** the frame everything lives in: regions defined by layout data, tabs, menus instead of
commands, projects.

**Done when:** the layout is loaded from `layout.json`, views can be moved/hidden/resized from menus,
the Tools menu lists every action, projects can be added and switched, settings are editable.

## Checklist

- [x] Remove the native Electron menu bar on Windows/Linux; minimal app menu on macOS (D-023)
- [x] Top bar drawn by Jig under the window-control overlay (drag region, no-drag for controls)
- [x] Layout model (`layout.json`) with defaults + schema; persisted on change
- [x] Regions: topbar, left, main (tabs), right, bottom, statusbar; resizable, collapsible
- [x] View registry (core views + add-on views by id)
- [x] `⋯` on each view: Move to left/right/bottom, Hide; "Views" menu to show hidden views
- [x] Main area tabs: open, close, reorder; tab types registry
- [x] Topbar: project switcher, Tools menu button, settings (the suggestions badge lands with the inbox in phase 9)
- [x] Tools menu: every core action and add-on action, grouped, searchable list (no commands to remember)
- [x] Projects: add folder (native dialog), remove, rename, colour; persisted in `projects.json`
- [x] Project dashboard tab (widgets slot lands in phase 6)
- [x] Settings tab with sections (Appearance, Engine, Learning, Add-ons, About)
- [x] Notifications/toasts
- [x] Keyboard shortcuts for the common actions, always also reachable from a menu
- [x] `docs/reference/layout.md`

## Notes

- Regions show one view at a time with a tab per view in the region header (D-030).
- The top bar's layout button toggles regions and lists every view (show/hide); Settings → Layout
  shows hidden views and resets the layout.
- Projects are added through the native folder picker (`projects.add` without a path); e2e tests pass
  a path instead.
- Custom window buttons are not needed on Windows/Linux (the OS draws them over the top bar via the
  title-bar overlay); `window.minimize/toggleMaximize/close` exist for a future frameless mode.
