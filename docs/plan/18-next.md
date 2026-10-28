# Phase 18 — Next: Jon's list

**Status:** ⏸ not started. Jon is collecting what to build next and says when to start. Build the
items in this order. Add new items here as Jon names them.

## 1. File explorer

A **Files** view: a tree of the project.
- **What it covers:** the workspace, or the repository you work in, following the Git panel's picker
  (D-100).
- **How it looks:** files and folders with `FileIcon` (the user's icon theme), and changed files in
  git colours. It's lazy-loaded and skips `.git` and `node_modules`.
- **Click:** opens the file in Preview.
- **Right-click:** Open in VS Code, Show in Explorer, New chat about this file, Copy path, Preview.
- **Kept up to date** with the same watchers as the Git view (D-097).

Open questions for when we start:
- Left sidebar tab, or a section below Projects (D-099)?
- A filter box?

## 2. Light editing in Preview

An **Edit** switch on code and text files in the Preview tab:
- **The editor:** CodeMirror 6 (lighter than Monaco), coloured by the active theme, with find, and
  Ctrl+S to save.
- **Saving** goes through a host method with a path schema (D-089).
- **Conflicts:** a warning when the file changes on disk while you edit (e.g. Claude edits it).

It is for quick fixes, not a VS Code replacement (vision non-goals): no language servers or multi-file
refactors. Big files and binary files stay read-only.

## Checklist

- [ ] File explorer view (tree, icons, git colours, Preview on click, context menu, live refresh)
- [ ] Edit in Preview (CodeMirror, theme, find, Ctrl+S, conflict warning, save IPC + schema)
- [ ] Docs: preview.md, layout.md ids, status, About page, README; e2e for both
