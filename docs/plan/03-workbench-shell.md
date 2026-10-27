# Phase 3 — Workbench shell

**Goal:** the frame everything lives in: regions defined by layout data, tabs, menus instead of
commands, projects.

**Done when:** the layout is loaded from `layout.json`, views can be moved/hidden/resized from menus,
the Tools menu lists every action, projects can be added and switched, settings are editable.

## Checklist

- [ ] Remove the native Electron menu bar on Windows/Linux; minimal app menu on macOS (D-023)
- [ ] Top bar drawn by Jig under the window-control overlay (drag region, no-drag for controls)
- [ ] Layout model (`layout.json`) with defaults + schema; persisted on change
- [ ] Regions: topbar, left, main (tabs), right, bottom, statusbar; resizable, collapsible
- [ ] View registry (core views + add-on views by id)
- [ ] `⋯` on each view: Move to left/right/bottom, Hide; "Views" menu to show hidden views
- [ ] Main area tabs: open, close, reorder; tab types registry
- [ ] Topbar: project switcher, Tools menu button, suggestions badge, settings
- [ ] Tools menu: every core action and add-on action, grouped, searchable list (no commands to remember)
- [ ] Projects: add folder (native dialog), remove, rename, colour; persisted in `projects.json`
- [ ] Project dashboard tab (widgets slot lands in phase 6)
- [ ] Settings tab with sections (Appearance, Engine, Learning, Add-ons, About)
- [ ] Notifications/toasts
- [ ] Keyboard shortcuts for the common actions, always also reachable from a menu
- [ ] `docs/reference/layout.md`
