# Phase 18 — Next: Jon's list

**Status:** ⏸ not started. Jon is collecting what to build next and says when to start. Build the
items in this order. Add new items here as Jon names them.

## 1. File explorer

A **Files** view: its own tab in the left sidebar, next to Projects, Chats and Git (decided, D-101).
- **What it shows is chosen per project, from the panel itself,** like the Git panel:
  - a picker of the project's default folder, plus folders shown next to it, managed with the same
    picker and eye button;
  - the default folder is set in the project, not tied to the workspace.
- **How it looks:** files and folders with `FileIcon` (the user's icon theme), and changed files in
  git colours. It's lazy-loaded and skips `.git` and `node_modules`.
- **Click:** opens the file in Preview.
- **Right-click:** Open in VS Code, Show in Explorer, New chat about this file, Copy path, Preview.
- **Kept up to date** with the same watchers as the Git view (D-097).

Still open: a filter box (probably yes).

## 2. Light editing in Preview

Code and text files in the Preview tab are **always editable**, like VS Code: no Edit switch (decided,
D-101).
- **The editor:** CodeMirror 6 (lighter than Monaco), coloured by the active theme, with find, and
  Ctrl+S to save.
- **Saving** goes through a host method with a path schema (D-089).
- **Conflicts:** when the file changes on disk while you have unsaved edits (e.g. Claude edits it), a
  bar says "Claude changed this file", with **Keep mine / Load theirs / Show diff** (decided).

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
  repositories shown next to it (today's per-focus choice, D-100, moves here). The **Files** panel
  works the same way, with a default folder.
- **One default workspace;** a new chat can start in any other workspace (decided).
- **Per-project preferences** (decided):
  - default model, effort and permission mode for new chats;
  - project instructions, appended to Claude's system prompt for this project's chats (append only,
    never replacing the preset);
  - starter prompts on its Home.
- **What follows the active project** (decided): the Git panel, the Files panel and Home. The Chats
  list always shows every project, grouped.

What you do with chats:
- **Start** a new chat in a project, and reopen older ones.
- **Pin** chats so they stay at the top of the project.
- **Drag and drop** a chat with no project onto a project, or from one project to another. Chats
  without a project are in a **"No project" group** at the bottom of the Chats list (decided).
- **Nothing is automatic:** projects never change because of the folder a chat runs in.

What stays as it is:
- **Folders/workspaces:** the repos folder, and any others, are still added so Jig knows the
  repositories, scripts and files.
- **The Repos add-on** always shows every repository of the workspace(s), whatever the project.

No migration is needed: Jig has never been used, so the new model replaces the old one directly.

To work out when we start: the add-on API (`AddonProject`, `ctx.projects`), `projectId` on sessions,
and Claude's configure tools for projects.

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
- Claude **saves the evidence on its own and shows a card** with Remove; it doesn't ask first (decided).
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
- Coaching (prompting, habits): **at most one tip a week**, always with your own examples as evidence
  (decided).
- **Did it help?** After a suggestion is built or adopted, check whether the pattern went away or the
  tool is used. Tell the user, and feed it back into the next reflection.

### 4c. Weekly check-in
- An opt-in, skippable short chat: Claude asks 3–5 questions chosen from gaps in the profile and from
  recent evidence (e.g. "You mentioned uploading to a VM twice — how does a release work for you?").
- Answers update the profile. Frequency is a setting (weekly, every two weeks, off). **Off by default;
  Jig offers it once** after a couple of weeks of use (decided).
- It uses some of the plan's usage, so it is kept short.

### 4d. Workflows (a new built-in add-on)
- **A workflow** is a named list of steps. A step is one of: a manual check, a script, a git action,
  a pipeline run, a message to Claude, or a wait for your OK.
- **Stored in Jig, per project** (`~/.jig`, private to you) (decided).
- **Three levels:**
  - manual: a checklist with buttons, and progress you can see;
  - assisted: each step is marked **manual, auto or ask me**. Claude does the auto steps and stops at
    the others (decided). A workflow can be exported as a Claude Code skill.
  - automated: a trigger (schedule, push, file change) runs it **while Jig is open**. **Move to the
    cloud** turns it into a Claude Code routine or an Azure DevOps pipeline (decided).
- Suggestions draft workflows from evidence ("Release webshop: build → package → upload to VM").
- Still open: the file format (Markdown with steps?) and the run history.

Principles stay: local, quiet, visible, deletable (vision #7). Nothing leaves the machine apart from
the AI calls that already exist (reflection, check-in).

## 5. Arrange the Scripts and Pipelines panels

In each panel, from the panel itself:
- hide scripts or pipelines you don't want;
- reorder them (drag);
- group them with **dividers** (a line, optionally with a title, wherever you put one).

One arrangement per panel, the same for every project (decided). The add-on keeps it in its own
storage.

## Checklist

- [ ] File explorer view (tree, icons, git colours, Preview on click, context menu, live refresh)
- [ ] Edit in Preview (CodeMirror, theme, find, Ctrl+S, conflict warning, save IPC + schema)
- [ ] Docs: preview.md, layout.md ids, status, About page, README; e2e for both
- [ ] Projects you manage: create/edit, default workspace and Git repo, per-project preferences,
      pinned chats, drag and drop chats between projects, chats without a project; workspaces and
      Repos unchanged
- [ ] Scripts and Pipelines: hide, reorder and dividers, from the panel
- [ ] Learning 2a: `jig_note_evidence` tool with chat card; friction signals in the activity log
- [ ] Learning 2b: profile + "What Jig knows about me"; suggestion kinds with actions; did-it-help
      follow-up
- [ ] Learning 2c: weekly check-in chat (opt-in, frequency setting)
- [ ] Learning 2d: Workflows add-on (manual, assisted, automated; suggestions draft workflows)
