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

## 3. Projects you manage (like projects in the Claude app)

Today a project is a folder, and a chat belongs to the folder it was started in. Jon wants projects
to be **groups he makes and manages himself**, independent of folders.

What a project is:
- **Created and edited by you:** name, colour (later maybe icon and description).
- **A default workspace** (folder) for new chats. It's only a default: the new-chat flow always lets
  you pick another folder.
- **A default Git repository**, shown in the Git panel when the project is active, plus the
  repositories shown next to it (today's per-focus choice, D-100, moves here).
- **Preferences worth having per project** (to decide):
  - default model, effort and permission mode for new chats;
  - instructions appended to Claude's system prompt for this project's chats (append only, never
    replacing the preset);
  - starter prompts on its Home;
  - which scripts or script groups show first;
  - its Pipelines project.

What you do with chats:
- **Start** a new chat in a project, and reopen older ones.
- **Pin** chats so they stay at the top of the project.
- **Drag and drop** a chat with no project onto a project, or from one project to another. Chats
  without a project live in their own group.
- **Nothing is automatic:** projects never change because of the folder a chat runs in.

What stays as it is:
- **Folders/workspaces:** the repos folder, and any others, are still added so Jig knows the
  repositories, scripts and files.
- **The Repos add-on** always shows every repository of the workspace(s), whatever the project.

To work out when we start:
- the model and migration: today's projects become workspaces, and each also becomes a project with
  its chats in it;
- what "active project" means for Scripts, Home and the status bar;
- the add-on API (`AddonProject`, `ctx.projects`) and `projectId` on sessions;
- Claude's configure tools for projects.

## Checklist

- [ ] File explorer view (tree, icons, git colours, Preview on click, context menu, live refresh)
- [ ] Edit in Preview (CodeMirror, theme, find, Ctrl+S, conflict warning, save IPC + schema)
- [ ] Docs: preview.md, layout.md ids, status, About page, README; e2e for both
- [ ] Projects you manage: create/edit, default workspace and Git repo, per-project preferences,
      pinned chats, drag and drop chats between projects, chats without a project; workspaces and
      Repos unchanged
