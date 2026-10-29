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
- **A guideline, not a hard rule: the left panel follows the active project, the right panel is global**
  (D-102). It is a meaningful default for where things go, and exceptions are fine when they make
  sense (like Repos).
  - **Follow the project:** Git, Files and Home.
  - **Chats:** the active project's chats come first, pinned at the top; the other projects are
    listed below, still grouped, and you can drag chats between them.
  - **Exception:** Repos stays below Git on the left and stays global.
  - **Right panel:** Scripts, Pipelines, Suggestions and Claude's browser are global.
  - The behaviour belongs to the view, not the side: Git moved to the right still follows the
    project. The rule only decides where views start.

What you do with chats:
- **Start** a new chat in a project, and reopen older ones.
- **Pin** chats so they stay at the top of the project.
- **Drag and drop** a chat with no project onto a project, or from one project to another. Chats
  without a project are in a **"No project" group** at the bottom of the Chats list (decided). The
  active project's group is first (D-102).
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
- Decided (D-112): JSON in the add-on's storage per project, runs kept (last 20) per workflow.

### 4e. Manual vs AI: measured, and compared quietly
Recorded silently. Shown only as evidence in suggestions and in a weekly "How you worked" summary on
the Suggestions page; never as nagging.
- **Attribution:** every Claude Edit/Write records which lines it wrote (file, hunk, hash). At each
  commit, the diff is split into lines Claude wrote and lines written by hand (including lines Claude
  wrote and you changed).
- **Time:** chat time per task, against hand-editing time estimated from file changes no chat made
  (the watchers of D-097) and the time between commits. It's an estimate and is labelled as one.
- **Quality, as a proxy:** lines changed or reverted again within N days (churn), and "fix" commits
  touching recent lines (git blame), per origin. It's a signal, not proof, and is worded that way.
- **The summary:** e.g. "This week: 1,240 lines by Claude, 310 by hand. Hand-written code was changed
  again 3× as often. The bug fixed in abc123 was in hand-written code from Tuesday." Tied to the
  ladder: what to hand over next.

### 4f. What you paste, and debugging by hand
- **Classify what's pasted into chats,** without AI, when you send: HTTP responses and requests, JSON
  payloads, headers, stack traces, logs, HAR, SQL results, error dialogs (screenshots).
  - Only the category, size and a short redacted sample are recorded, never the whole paste.
  - ✅ Done early (D-103): large pasted blocks are recorded only as their kind (`detail.pasted`), and
    secret-looking values are masked in everything recorded. 2f builds the suggestions on top.
  - It's matched against the "never record" list.
- **Debugging outside Jig, as evidence:** the browser's network tab, Postman, log portals. It comes
  from chat mentions (4a) and from the pastes.
- **Suggestions it leads to:**
  - "You pasted 14 API responses this week: let Claude look itself." Claude's browser (with network
    capture, below) or `curl` in a Jig terminal.
  - Build an add-on for it: an API client for the project's endpoints, a log viewer, an error
    explainer.
  - A skill with the project's API base URL and auth steps.
- **Claude's browser gets network capture:** `jig_browser_network` lists requests and responses
  (method, URL, status, timing, headers, bodies up to a limit) through Chromium's DevTools protocol.
  Claude debugs what the colleague now checks by hand in the Network tab. A Network list also goes in
  the browser view.
- **Tools never used:** "Claude never used the browser in your web project; it could have checked
  the UI itself." This measures Jig's own tools against what the work needed.

Principles stay: local, quiet, visible, deletable (vision #7). Nothing leaves the machine apart from
the AI calls that already exist (reflection, check-in).

## 5. Arrange the Scripts and Pipelines panels

In each panel, from the panel itself:
- hide scripts or pipelines you don't want;
- reorder them (drag);
- group them with **dividers** (a line, optionally with a title, wherever you put one).

One arrangement per panel, the same for every project (decided). The add-on keeps it in its own
storage.

## 6. Split view in the main area

Two panes, **side by side**, each with its own tabs (decided). For example a chat next to its diff, a
chat next to a preview, or two chats.
- **Opening a tab on the other side:**
  - drag a tab to the right edge (or onto the other pane's tab bar), like VS Code;
  - right-click a tab → **Open to the side** (decided).
- **Layout:** the divider is draggable and its ratio is kept in the layout (`panes`). Closing the
  last tab of a pane removes the split.
- **Model:** `main` gets a second tab group in the layout (`main.groups`). New tabs open in the pane
  that has focus.
- Out of scope: a grid, and top/bottom splits.

## 7. Project links (Azure resources, sites, anything)

Each project keeps its own **links, in groups**: e.g. "Stage" with its resource groups and sites,
"Prod" with its own. Groups are what you make them, so they can also be per customer, per service, or
"Monitoring".
- **A link** has a URL, a label (optional, else taken from the URL) and a **type**. The type gives its
  icon and a default label:
  - Azure: resource group, app service / website, function app, database, storage, key vault, App
    Insights / monitoring, container / AKS;
  - other: Azure DevOps (repo, pipeline, board), docs, API (Swagger), dashboard, other.

  Types come from a fixed list in Jig, and a custom label is always possible.
- **Managed by hand:** add, edit, reorder and group from the panel itself, with dividers between
  groups (like item 5).
- **Managed from a chat:** Claude gets tools to read and change a project's links (e.g. "add the
  stage database and site to the Stage group"), with a change card and Undo like the other configure
  tools.
- **Optional help:** "Add from Azure…" lists your resource groups or resources through your own `az`
  login (as Pipelines does) so you can tick the ones to add. Jig stores no tokens.
- **Clicking a link** opens it in your browser. Right-click: copy URL, edit, ask Claude about it.
- **Where it shows** (decided): it follows the active project (D-102).
  - In the left panel as a collapsible **section below Projects** (D-099), not its own tab.
  - On the project's Home, as a Links card.

## 8. Releases: start versioning, and keep at it (a new built-in add-on)

For everyone, not only Jon. It **starts versioning** where there is none (Jon's repos today), **adopts
what already works** where there is one, and then **keeps the discipline**, proactively but quietly.

**What runs on what:**
- **Everything ongoing is plain code, with no AI:** reading versions, tags and commits, the badges,
  watching pipeline runs, reminders, and writing files, commits and tags.
- **Claude is used only at moments you start, and only where judgement or writing is needed:**
  - the setup chat, once per repository;
  - the bump suggestion and the notes, once per release, when you click Release;
  - Write for commit messages, which already exists.
- **Nothing calls an AI in the background** for releases.

### Getting started, once per repository
- **Detection first, without AI:** version files, tag patterns, a `CHANGELOG.md`, conventional
  commits, and tools such as GitVersion, Nerdbank.GitVersioning, semantic-release, release-please or
  versioning steps in pipelines.
- **A setup chat** ("Set up versioning for shop"). Claude gets what detection found and looks at
  the repository (stack, how it's deployed, pipelines, history), then asks only what it can't work
  out.
  - **Versioning already in place → adopt it.** The policy describes what the team already does (its
    scheme, tag format, changelog style and tools). Nothing is changed unless you ask. A tool such as
    GitVersion stays in charge of the number, and the add-on reads it instead of bumping files.
  - **No versioning yet → start it,** as below.
- **It proposes rules with reasons, and you adjust them:**
  - the scheme: SemVer for APIs and libraries, CalVer for sites and apps that just ship;
  - the one place the version lives (`Directory.Build.props`, `.csproj`, `package.json`, a `VERSION`
    file) and the tag format (`v1.2.3`);
  - environments: stage gets release candidates (`1.3.0-rc.1`), and prod gets the same build as
    `1.3.0`;
  - the notes' audiences and languages;
  - a commit message convention (optional);
  - when to release (e.g. "before every prod deploy", weekly).
- **How the project ships is part of the policy**, since it differs from project to project:
  - **Release style:**
    - **Planned releases:** versions, release candidates on stage, notes per release, and the
      discipline nudges below.
    - **Continuous:** every prod deploy is a release. Common for small projects where a customer asks
      for a small change or reports a bug and it's simply fixed and deployed. Each deploy gets a
      version automatically (CalVer or a build number such as `2026.10.28.2`) and a one-line entry in
      a running changelog. There are no "release first?" prompts and no reminders.
    - **None:** the project isn't tracked.
  - **How deploys happen:**
    - **A pipeline:** Jig sees the runs through the Pipelines add-on.
    - **By hand:** e.g. publish and upload to a VM. Jig can't see this, so a "Deployed" button (and
      later a Release workflow step) records it.
    - **Both**, per environment.
- **The rules are saved as the repository's release policy.** Proposed: `.jig/release.json`, committed,
  so colleagues get the same rules and the add-on helps them too. To confirm.
- **Starting fresh:** a baseline release (`1.0.0`, "first versioned release") marks the starting
  point. Adopting needs no baseline: the latest existing tag is the start.

### Staying disciplined
- **Unreleased work is visible:** a badge in Git and Repos ("14 commits unreleased, 3 weeks"), and the
  workspace list of repositories with something to release.
- **Deploys without a version (planned releases only):** when a prod pipeline runs (or is about to
  run) on a commit with no release, Jig says "release 1.4.0 first?". It's a warning you can override,
  not a block (proposed).
- **Continuous projects stay light:** after each prod deploy, the deploy is tagged and logged. The
  only AI is an optional "what changed this month" summary to send the customer, made when you ask.
- **Commit messages follow the policy:** the Git panel's Write uses the convention, so the changelog
  and the bump suggestion are reliable.
- **Reminders follow the policy's cadence.** Learning reports how releases are going in its weekly
  summary.

### Releasing
- **What's unreleased:** commits, merged PRs, and the Azure DevOps work items they mention, since the
  last tag. The version in files and in tags is checked to agree.
- **Claude** suggests the bump (with reasons) and drafts a **changelog** (`CHANGELOG.md`: Added / Changed
  / Fixed) and **notes for users** (plain language, in the policy's languages). You edit before
  anything is written.
- **One action, after a preview diff:** bump the version files, update the changelog, commit "Release
  x.y.z", tag, push, and optionally start the release pipeline (Pipelines add-on).
- **Afterwards:**
  - the history of releases with their notes;
  - "What's live": which version each environment runs, from pipeline runs, and which changes aren't
    in prod yet;
  - notes copied as Markdown or text, or published as an artifact.
- **Ties to the rest of the plan:** Claude gets tools ("what changed since the last release?", "write
  the notes for 2.5.0"); a "Release" workflow (4d) uses these steps; Learning suggests it when it sees
  manual releases.

## 9. Finish: everything documented (last step of the phase)

When the items above are built, finish the phase by bringing every document up to date with all the
new features. Each item already updates its own reference docs as it goes (AGENTS.md "Keep the docs
true"). This step checks the whole picture again:
- **`README.md`:** headline features, the slot table, the screenshots (regenerated, `?v=` bumped).
- **`AGENTS.md`:** new conventions and "never do X" rules from this phase. For example, D-102 (left
  follows the project, right is global) for where views start, link types, and workflow steps.
- **`docs/`:**
  - `status.md` (what works, how to try it, what needs testing on Windows), `architecture.md`,
    `vision.md` if a principle moved (e.g. light editing);
  - every `docs/reference/*.md` touched (layout, state, ipc, learning, preview, configure, builder,
    slots, addon-api);
  - `guides/testing.md` (new fake-engine triggers);
  - the `docs/README.md` index;
  - `decisions.md`, and this plan with its phase status.
- **The "What Jig can do" page** (`features/about/`): a line and a screenshot per new feature, and
  slot examples.
- **The guide artifact** for new users, https://claude.ai/artifact/MMdEDPypuhxyyS8Tw1eJr2:
  - read it with the Artifact tool (`action: "read"`), since the local copy from earlier sessions is
    gone;
  - add every new feature with screenshots, and publish to the same URL.

## Checklist

- [x] File explorer view (tree, icons, git colours, Preview on click, context menu, live refresh)
- [x] Edit in Preview (CodeMirror, theme, find, Ctrl+S, conflict warning, save IPC + schema)
- [x] Docs: preview.md, layout.md ids, status, About page, README; e2e for both
- [x] Projects you manage: create/edit, default workspace and Git repo, per-project preferences,
      pinned chats, drag and drop chats between projects, chats without a project; workspaces and
      Repos unchanged
- [x] Scripts and Pipelines: hide, reorder and dividers, from the panel
- [x] Split view: two side-by-side panes with their own tabs; drag a tab to the edge or "Open to the
      side"; draggable divider
- [x] Project links: grouped, typed links (icon + default label), managed in the panel and from
      chats (with Undo), optional "Add from Azure…" via `az`
- [x] Learning 2a: `jig_note_evidence` tool with chat card; friction signals in the activity log
- [x] Learning 2b: profile + "What Jig knows about me"; suggestion kinds with actions; did-it-help
      follow-up
- [x] Learning 2c: weekly check-in chat (opt-in, frequency setting)
- [x] Learning 2e: AI vs hand-written lines per commit, time and churn per origin, weekly "How you
      worked" summary
- [x] Learning 2f: classify pastes (no raw content stored); `jig_browser_network` + Network list in
      the browser view; "tools never used" signals
- [x] Learning 2d: Workflows add-on (manual, assisted, automated; suggestions draft workflows)
- [x] Releases add-on: setup chat and release policy per repository, baseline release; unreleased
      work in the panel and status bar, deploy-without-version warning, commit convention, reminders;
      bump suggestion, changelog and user notes, one-action release, history and "What's live" (D-110).
      Not yet: merged PRs in the list, starting the release pipeline, notes as an artifact, Claude
      tools for releases (backlog)
- [x] Finish: README, AGENTS.md, all docs (status, architecture, references, guides, index,
      decisions, plan), the About page and screenshots, and the guide artifact updated with every new
      feature

### After the phase (additions Jon asked for, and a sweep)

- [x] Chats in their own git worktree (D-114)
- [x] Add-ons share as a .zip: export and import with a preview (D-113)
- [x] Review comments on diff lines, sent to a chat
- [x] Claude tools from add-ons (`claude.tool`), Releases and Workflows tools, add-on data tools,
      add-on suggestions in chats (D-115)
- [x] Add-on data scope: global, per project or per repository (D-116)
- [x] Repo sweep: four reviews and their fixes (unsaved-edit guard, races, safer inputs, a11y, docs)
- [x] A full code editor: theme syntax colours, indentation guides and detection, closing brackets,
      several cursors, go to line, word wrap and whitespace, status line, Settings → Editor (D-118)
- [x] Development requests: when no add-on can do it, the builder's proposal becomes a package
      (spec, prompt for Claude Code, mockup, context) that **Email to developers** attaches to a new
      email to support@sprinta.se (D-119); you try the demo, ask for changes and confirm before
      sending; the address is fixed (D-120)
- [x] Email to developers saves the package in Downloads and opens a plain `mailto:` email (D-123)
- [x] Delete your own add-ons in Settings → Add-ons (D-122)
- [x] Testing on a small model: the `jig-tester` subagent in every chat and Tools → Test something…
      (D-124)
- [x] Pipelines: every Azure DevOps organisation you belong to, all projects by default (D-125)
- [x] Sign-in: `claude auth login`, Jig confirms it and closes the terminal; Get started shows it (D-126)
