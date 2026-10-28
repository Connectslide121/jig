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

## 4. Learning 2: Jig helps you work better

Today (`docs/reference/learning.md`) Jig records what you *do* in Jig, mines repetition and proposes
add-ons. It misses what you *say*, friction, and work done outside Jig, and it only answers "build a
tool". Build in this order:

### 4a. Evidence from chats and friction signals
- **`jig_note_evidence`**, a Jig tool for Claude. When you mention manual work, work outside Jig,
  frustration or a chore, Claude saves a short note: quote or summary, project, category.
  - It shows as a "Noted for suggestions" card in the chat, with Remove.
  - `jigContext` says when to use it. It never costs an extra AI call.
  - The fake engine gets a trigger for it.
- **Friction signals,** recorded without AI: interrupts, rewinds, denied permissions, corrections
  ("no, I meant…"), the same error repeated, scripts that keep failing, long chats with no commit,
  hopping between repositories.
- Both go into the activity log and feed the miner and the reflection, with evidence shown on each
  suggestion.

### 4b. A profile, and more kinds of suggestions
- **Profile:** a readable, editable file describing how you work: stack, release process, tools
  outside Jig, preferences, what you already know. Every reflection reads it and proposes updates.
- **A "What Jig knows about me" page:** the profile, the evidence and the activity, each editable or
  deletable.
- **Suggestion kinds, each with its own action:**
  - tool → Build add-on;
  - setting/layout → Change it;
  - workflow → Draft a workflow, or a pipeline with the Pipelines add-on;
  - Claude Code setup → add an MCP server, skill or hook;
  - project memory → add to CLAUDE.md;
  - prompting tip → with your own before/after examples;
  - habit tip → Dismiss / Remind me;
  - automation → make a routine.
- Coaching (prompting, habits) is rare and specific: at most one tip a week, always with evidence.
- **Did it help?** After a suggestion is built or adopted, check whether the pattern went away or the
  tool is used. Tell the user, and feed it back into the next reflection.

### 4c. Weekly check-in
- An opt-in, skippable short chat: Claude asks 3–5 questions chosen from gaps in the profile and from
  recent evidence (e.g. "You mentioned uploading to a VM twice — how does a release work for you?").
- Answers update the profile. Frequency is a setting (weekly, every two weeks, off).
- It uses some of the plan's usage, so it is kept short.

### 4d. Workflows (a new built-in add-on)
- **A workflow** is a named list of steps. A step is one of: a manual check, a script, a git action,
  a pipeline run, a message to Claude, or a wait for your OK.
- **Three levels:**
  - manual: a checklist with buttons, and progress you can see;
  - assisted: Claude runs the steps and stops at checkpoints; a workflow can be exported as a Claude
    Code skill;
  - automated: a trigger (schedule, push, file change) while Jig runs, or moved to a Claude Code
    routine or an Azure DevOps pipeline to run without Jig.
- Suggestions draft workflows from evidence ("Release webshop: build → package → upload to VM").
- To decide: the file format (Markdown with steps?), where workflows live (per project?), and the
  run history.

Principles stay: local, quiet, visible, deletable (vision #7). Nothing leaves the machine apart from
the AI calls that already exist (reflection, check-in).

## Checklist

- [ ] File explorer view (tree, icons, git colours, Preview on click, context menu, live refresh)
- [ ] Edit in Preview (CodeMirror, theme, find, Ctrl+S, conflict warning, save IPC + schema)
- [ ] Docs: preview.md, layout.md ids, status, About page, README; e2e for both
- [ ] Projects you manage: create/edit, default workspace and Git repo, per-project preferences,
      pinned chats, drag and drop chats between projects, chats without a project; workspaces and
      Repos unchanged
- [ ] Learning 2a: `jig_note_evidence` tool with chat card; friction signals in the activity log
- [ ] Learning 2b: profile + "What Jig knows about me"; suggestion kinds with actions; did-it-help
      follow-up
- [ ] Learning 2c: weekly check-in chat (opt-in, frequency setting)
- [ ] Learning 2d: Workflows add-on (manual, assisted, automated; suggestions draft workflows)
