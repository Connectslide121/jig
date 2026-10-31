# Status

Pipeline arrangement (2026-10-31): nested cards no longer show the duplicate Add divider/help row.
Use the small side divider icon; the outer list retains its footer.

Menus (2026-10-31): the duplicate Tools dropdown is removed. Use the grouped top-bar menus or the
magnifier's Go to search (Ctrl+P and Ctrl+K). `tools.action` add-ons remain available in those menus
and search, including a dedicated menu for their own groups; no action is exclusive to the old picker.

Chat alignment (2026-10-31): transcript and input now share a column and matching content edges.
The overview card's column remains reserved when hidden and in empty/loading chats, preventing
sideways movement as it appears or disappears. Work continues directly on `main` with logical commits.
Validation: build and `npm run check` pass (592 tests, 8 skipped). Five fake-engine Electron checks
pass, covering exact input/message alignment at narrow and wide widths, no movement when the overview
is hidden or first appears, visible command pickers, queued messages, streaming and long-text overflow.
Narrow-pane follow-up: model and permission labels truncate within their buttons so the Send button
stays inside the composer; full labels remain available in tooltips. Alignment/overflow coverage also
includes an 800-pixel window. The screenshot generator selects the last preview tab when several exist.
The screenshot suite passes; chat, overview, details and related chat screenshots were refreshed.

Task entry (2026-10-31): Add tasks uses compact single-line prompt rows with inline filename chips.
The attachment area reserves its width and scrolls horizontally; files never grow a row or move its
controls. Click a filename to preview or × to remove; paste, drop and paperclip still work.
Validation: production build and `npm run check` pass (592 tests, 8 skipped). The fake-engine task
queue regression verifies image paste, document drop, unchanged row/prompt geometry, retained files
in results and attachments delivered to the chat. Screenshot: `test-results/tasks-add-compact.png`.

_Last updated: 2026-10-29 (phases 0–17: every phase of the plan is done; the latest are routines and artifacts, Claude's browser and the chat at Claude Code's level)._

## Continue here (next session)

1. Clone Jig and install: `npm install` (npm reads `.npmrc`, which sets `legacy-peer-deps`).
2. Clone ThinkRail beside it for reference: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`.
   Which parts to read for which phase: `docs/reference/reference-repos.md`.
3. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`.
4. Phases 0–18 in `docs/plan/README.md` are ✅ (19 is 🟡: only the Windows taskbar-icon check is left) (phase 18 was Jon's list: file explorer, editing in
   Preview, projects you manage, arranging panels, split view, project links, Releases, Learning 2
   with Workflows). What's left of it is in `docs/plan/99-backlog.md`. Next: try phase 18 on Windows
   ("Needs testing on your machine" below) and ask Jon what comes next.
5. Run `npm run check` before every commit; keep plan, docs and decisions true.

## What works today

- Navigation and layouts (D-175, D-176): **Ctrl+P** (or the magnifier in the top bar) opens Go to:
  chats, views, actions and files. **View → Layout → Layouts** saves named layouts and switches
  between them (also Settings → Layout, and from a chat). Learning notices views you keep opening or
  moving the same way and suggests placing them.
- Chats board (D-178): Chats view header → board icon, or Chats menu → Chats board.
- Task queue (D-182): Chats menu → Task queue. Add tasks grouped in chats, one field per task
  (a chat's first task starts it, the next ones continue it; D-186), then Start. Claude does them in
  order and reports each (outcome, summary, things to know, follow-ups); the results show a card per
  chat (its link, project, time, cost, progress) with a row per task, and a status bar on top; click
  a row for details. Paste, drop or attach (paperclip) images and documents in a task like in the
  chat (D-187): they're sent with it and stay with it, in the Files column, ⋯ → Files and the details.
  In a chat, ask Claude to queue tasks (for example one per spec in a folder):
  it uses `addon_tasks_add`. Known gaps: which add-on follows which chat is kept in memory, so after a
  restart running tasks catch up within a minute (the watcher); a task Claude didn't report on shows
  Claude's last answer instead. Needs testing on a real machine with real Claude Code.
- Workflows (D-177) can run **after you push** or **when a pipeline finishes**. Needs testing on a
  real machine: a real push and a real Azure DevOps pipeline (the e2e tests use a fake `az`).
- Add-on gallery (D-179): Tools → Add-on gallery, or Settings → Add-ons. Add a git URL or a folder,
  then Install. Needs testing on a real machine: a private git repository over https and ssh.
- Commit messages (Git → Write) use the quick model, Haiku by default (D-181; Settings → Claude Code → Quick model).
- Pipelines (D-180): each pipeline is one compact row; click it for the details dialog. They load when
  Jig starts (D-183) and opening the view shows them at once, refreshing in the background.
- Chat overview (D-184): a small card at the top right of each chat, beside the transcript (it never
  covers it), counts turns, tool calls, files changed, skills, subagents, add-ons, MCP calls and
  tokens. **Show details** opens a modal with every tool, skill, subagent, add-on, MCP server and file.
  Toggle it with the chart button in the chat's top bar; ⋯ → Chat overview… opens the details; setting
  `chat.overview`.
- How Claude worked for you (D-185): What Jig knows about me sums the overview's counts over 4 weeks
  of chats (skills, subagents, add-ons, MCP servers, most used tools; calls and chats each), and the
  weekly reflection reads it. Tool calls recorded before this have no skill/add-on tag, so they count
  only as tools.
- Repos: a row's branch is a dropdown to switch branches (D-172). Needs testing on a real machine with a dirty tree and remote-only branches.
- Layout (D-173, D-174): **View menu → Reset layout** puts every view back. Sidebars hold only daily
  views; Suggestions, Links, Releases and Workflows open as main tabs from the top bar menus. Drag
  any view's tab anywhere: another region, a sidebar's lower part (splits it), the main area, or the
  dashed edge target of a hidden sidebar/bottom panel. Top bar menus are merged into Chats, Code,
  Build and View; project actions are in the project switcher. Needs testing on a real machine:
  drag and drop with a mouse on Windows, and old layouts loading.

- **Phase 0–1 (done):** docs, plan, tooling; the Electron app with the typed host bridge, config in
  `~/.jig/config.json`, window state, host log in `~/.jig/logs/main.log`.
- **Phase 2 (done): design system & themes.**
  - Every colour, space, radius and type size is a token (`docs/reference/design-tokens.md`);
    `npm run check:tokens` rejects hard-coded colours and arbitrary values.
  - Themes: Jig Dark, Jig Light, your own files in `~/.jig/themes` (Jig or VS Code format, re-applied
    on save), themes from installed VS Code / Insiders / Cursor / VSCodium / Windsurf (plus VS Code's own
    built-in themes), and Open VSX search + install (theme JSON only). See `docs/guides/themes.md`.
  - Settings → Appearance: theme grid with selection only, follow the system light/dark mode, density,
    corners, font size, UI/code fonts. Code is highlighted with Shiki using the theme's own colours.
  - Base components in `apps/desktop/src/renderer/ui/` (buttons, inputs, menus, dialogs, …).
- **Phase 3 (done): workbench shell.**
  - No native menu bar on Windows/Linux; Jig's own top bar with the project switcher, **Tools** menu
    (every action, grouped, with a filter box), layout menu and settings.
  - Layout as data (`~/.jig/layout.json`): left/right/bottom regions (resizable, collapsible), views
    movable/hideable from their `⋯` menu, main-area tabs (reorder by drag, close, close others),
    restored on restart.
  - Projects: add a folder, switch, rename, recolour, remove (right-click or `⋯`), project dashboard.
  - Settings tab: Appearance, Layout, Claude Code, Terminal, Learning, About.
  - Toasts, keyboard shortcuts (`docs/reference/layout.md`).

- **Phase 4 (done): chat sessions.**
  - Sessions view (left sidebar, next to Projects): every session of every project with live status
    (idle / working / needs you / error). New session: `Ctrl+N`, the `+` in the Sessions header, or Tools.
  - Chat tab: streaming markdown, collapsed thinking, tool-call cards (click to see input/output),
    permission prompts (Allow once / Always allow / Deny), Claude's questions as clickable options,
    per-turn duration/tokens/cost, follow-ups queue while Claude works, Stop (or `Esc`), model and
    permission-mode menus, attach files (`@path`), rename/archive/delete/stop from the `⋯` menu.
  - Sessions persist and resume with Claude Code's own session id after a restart.
  - API keys are stripped from sessions by default; a warning shows if a session still bills an API key.
  - `JIG_ENGINE=fake npm run dev` gives scripted replies (try "run the tests", "ask me a question",
    "slow", "fail", "login"; the full list is in `docs/guides/testing.md`).

- **Phase 5 (done): terminals & scripts.**
  - Terminals in the bottom panel (`Ctrl+\``, or `+` in its header): PowerShell by default on Windows,
    themed, survive switching tabs; rename/stop/close from the right-click menu.
  - Scripts in the Scripts view (no longer on the project dashboard, D-153): npm/pnpm/yarn/bun
    scripts, `.ps1`/`.sh`, .NET launch profiles, `func start`, per folder; Run / Stop; groups start
    several at once; the status bar shows "N running".
  - Tools → Sign in to Claude Code… runs Claude Code's own sign-in in a private terminal; when you're
    signed in Jig says so and closes it (D-126). Get started shows whether you're signed in.

- **Phase 6 (done): add-on system.**
  - Add-ons are folders with `addon.json` (+ `ui.tsx`, `host.ts`, `README.md`) in `~/.jig/addons`
    (a git repository) or Jig's built-in `addons/`. They load into 17 slots (views, tabs, top bar,
    status bar, dashboard, Tools actions, context menus, chat toolbar and tool cards, prompts,
    watchers, settings pages, themes); see `docs/guides/writing-addons.md`.
  - Saving a file reloads that add-on; a crash shows "Turn off" in its place, never a broken app.
  - Host code runs in its own process with permission-checked `exec`/`fs`/`fetch`.
  - Settings → Add-ons: on/off, problems and token warnings, permissions, open folder, reload,
    history and roll back, and Delete for your own add-ons (D-122: kept in the history and its data
    kept; deleting your copy of a built-in brings the built-in back).

- **Phase 7 (done): built-in add-ons.**
  - **Git** (left sidebar, `Ctrl+Shift+G`): current branch with ahead/behind and fetch/pull/push,
    working changes with stage/unstage/discard and commit, branches (click → history, right-click →
    switch/compare/new branch). History, commit detail, diffs (side by side / inline) and compare open
    as tabs in the main window. Branch in the status bar.
    Updates live: on Windows and macOS within about a second of a file changing (watchers, only the
    repository that changed is looked at again); on Linux by a check every few seconds. Every
    repository is fetched in the background every 5 minutes (Settings → Git), so "behind" stays
    current; it never asks for a login.
  - **Open a Claude Code chat** (Chats header; D-150): your Claude Code conversations from the
    terminal, the desktop app or an IDE, filtered by title/folder/branch; opening one brings its
    history into a chat in No project that continues it as a copy.
  - **Repos** (click a repository: its commits to pull and push, a commit's files and diffs; D-149)
    (in the lower half of the left sidebar, D-173; drag its tab anywhere, D-174), like the Git plugin (D-143): every
    repository by its own name, a sync chip (pull, then push) and its branch; Arrange hides,
    reorders and groups them with dividers, once for all projects; "N to push/pull" in the status
    bar; right-click a project → Open in VS Code / Explorer.
  - **Notes** (right sidebar; D-147): short notes for the chat you're in (waiting on, where, to-do,
    note, link), like the notes plugin; Claude gets them with every message (D-151) and keeps them
    current on its own; its Notes tools are always loaded, never behind tool search (D-158).
  - **Pipelines** (right sidebar; D-148), like the pipelines plugin: the Azure DevOps pipelines of
    the repositories in your workspaces, per repository, with the newest run (chip, branch, why, who,
    changed parameters) and its stages; **Run** opens a modal form with the branch, a picker per YAML
    parameter and a checkbox per boolean, queued only on **Queue run**; notifications when your
    runs finish. New pipelines join their repository on their own and the form reads the YAML in
    Azure DevOps on the picked branch (D-166). Every organisation's other pipelines (D-125) under
    "More pipelines", with the same form.
  - **Scripts** (right sidebar), like the scripts plugin (D-142): what runs now; your groups (folded to their header until you unfold them; **All scripts** folds too) with
    Start/Stop (right-click a script → Add to group); every script as a tree of folder → repository
    → package (API / npm), scripts as ▶ chips. .NET projects offer their launch profiles (D-141);
    worktrees inside a folder are left out (D-127). Tools → Run a script… (`Ctrl+Shift+R`).

- **Phase 8 (done): builder, levels 1 and 2.**
  - Tools → **Build something…** (`Ctrl+Shift+B`), **Change this with AI…** in an add-on view's `⋯`
    menu or tab menu, **Fix with AI** on a crashed add-on, or ask in any chat ("make me a …").
  - The builder (a Claude Code session you can open) picks the lightest level: a layout or settings
    change, else an add-on — changing an existing one when it fits — validated (manifest, bundles,
    exports, design tokens, README; up to 3 fix rounds).
  - You review in the build tab: layout/settings changes, or the add-on running as a "(preview)" with
    its files, diffs and permissions. **Accept** applies it (add-ons: a commit in `~/.jig/addons`,
    roll back from Settings → Add-ons); **Discard** leaves nothing behind. Builds view in the bottom panel.
  - **Development requests** (D-119): when no add-on can do it, the build ends with a request for
    Jig's developers: title, user story, why, the proposed extension point, how the tool is then an
    add-on, acceptance criteria and a clickable mockup. The Build tab works it out with you (D-120):
    **1. Try it** (the demo runs right there), **2. Is this what you want?** (say what to change and
    the builder writes version 2, 3…; **This is what I want** confirms it), **3. Send it**: **Email to
    developers**, only for the confirmed version, saves the package zip in your Downloads folder
    (SPEC.md, PROMPT.md to paste into Claude Code in the Jig repository, mockup.html, context.json),
    shows it there and opens a new email to support@sprinta.se (fixed in Jig, not a setting) in your
    mail app; you attach the zip and send (D-123). Also Copy prompt and Show package.
  - Starting a build opens its chat beside the Build tab (split view), so you see the builder work.
  - With `JIG_ENGINE=fake` a scripted builder runs the real pipeline (try "move the terminals",
    "compact", "a pomodoro timer").

- **Phase 9 (done): learning and suggestions.**
  - Jig records locally what you do (prompts, commands in sessions and terminals, scripts, add-on
    actions, git operations, project switches) in `~/.jig/activity`; pause, exclusions, retention and
    delete-all in Settings → Learning. Secrets are masked and pasted blocks (responses, JSON, stack
    traces, logs) are kept only as their kind, never their content.
  - **Look for patterns now** (light bulb in the top bar → Suggestions, or Tools) and every Monday at
    10:00 (catch-up at launch): repeated commands, sequences and similar prompts are found without AI;
    only then one small Claude Code request picks at most 3 suggestions with evidence.
  - **Build it** starts the builder; **Not now** hides it for 14 days; **Never** blocks the pattern.
  - **Learning 2** (D-111):
    - **Notes from chats:** when you mention work you do by hand or outside Jig, frustration or a
      chore, Claude saves a short note; a "Noted for suggestions" card in the chat has Remove.
    - **Friction** is recorded without AI: Stop while Claude works, rewinds, denied permissions,
      corrections ("no, I meant…"), repeated tool errors, scripts that fail, long chats that end
      without a commit, and hopping between projects. Pastes per kind and
      "Claude's browser never used for UI work" are signals too.
    - **More kinds of suggestions**, each with its action: workflows (Draft a workflow), Claude Code
      setup, CLAUDE.md additions, routines, tips (at most one a week, with your own examples), and
      additions to your profile. **Did it help?** shows on built or adopted suggestions after a week.
    - **What Jig knows about me** (the person button in Suggestions, Tools, Settings → Learning): your
      profile (`~/.jig/profile.md`, editable), the notes (deletable), activity per kind and **How you
      worked** (lines by Claude vs by hand in your commits of the week, churn, fixes, chat time — an
      estimate).
    - **Profile interview** (D-169): when Jig opens and the profile is empty (and a project is active)
      a toast offers a chat where Claude asks one question at a time, follows up and fills the profile
      with `jig_update_profile`; once per launch, "Don't ask again" stops it; the same chat starts from
      **Fill it in with Claude** in What Jig knows about me. Needs testing with real Claude.
    - **Check-in** (Settings → Learning, off by default; offered once after two weeks): a short chat
      with 3–5 questions that adds what it learns to your profile.
    - **Workflows** (opens as a main tab: Chats menu → Show workflows, D-173/D-174; a new built-in add-on): lists of steps you
      repeat, per project. Each step is yours (a check), "ask me first" or done by Jig (a command, a
      script, a pipeline, a message to Claude). Run it step by step with the output shown; schedule it
      (while Jig is open); export it as a Claude Code skill; Move to the cloud asks Claude to make it a
      routine or a pipeline. Workflow suggestions open here as drafts.
    - **Claude's browser records the network:** Claude reads the page's requests (status, headers,
      bodies; credentials redacted) with `jig_browser_network`, and the browser view has a Network
      list — so API calls are debugged there instead of copied from your browser.
- **Phase 10 (done, reworked): no self-editing.** When no slot can do a request, the build ends with a
  proposal for the missing extension point (why, and the slot or API to add), with **Copy proposal** —
  Jig never changes its own code; you add the slot yourself (D-074).
- **Resizable panels:** drag the edge of the sidebars and the bottom panel (or focus the handle and use
  the arrow keys; double-click resets), the terminal list, the Settings list and the two sides of a Git
  diff. Sizes are remembered (`layout.json`).
- **Image previews:** a changed image in the Git view shows before/after side by side; images Claude
  reads or writes show a thumbnail in their tool card; both open an image tab (fit / 100%, pixel and
  file size, show in folder).
- **Screenshots and documents in chat:** paste (Ctrl+V) or drop images, PDFs, Word, Excel, PowerPoint
  (.docx/.xlsx/.pptx) and text files into the message box, or pick them with the paperclip. They show as
  thumbnails or chips (remove with ×), go to Claude with your message (PDFs as documents, Office files
  as text Jig extracts), and stay in the transcript (click to open).
- **Configure Jig from a chat:** ask Claude to change the theme, fonts, density, file icons, layout,
  add-ons on/off, a project's name or colour, or to find and install a theme. You approve each change
  (Claude Code's prompt) and a card in the chat shows what changed, with Undo. Billing and
  program-running settings stay in Settings only.
- **Compact chats** (D-159): each run of Claude's steps folds into one line ("Ran 3 commands, edited 1
  file"); click it for the cards, or switch the chat's top bar to Detailed for every card.
- **Plan usage, always visible:** the status bar shows a bar per window like the usage plugin
  (`5h ▰▱ 26% 2h 55m · wk ▰▱ 69% 4d 22h`, green, amber from 60 %, red from 85 %; D-152); hover it for a card with every window, a bar each and when it resets (click
  to refresh). The numbers come from Claude Code's own `/usage` data.
- **Projects you manage** (D-101, D-102): a project groups chats; folders never decide which chats are
  in it.
  - **New project…** (Projects view, top bar menu, Tools) asks for a name, a colour, a default
    workspace folder, a default Git repository, the model/effort/permission defaults for its chats,
    instructions for Claude (added to its system prompt in those chats) and starter prompts for its
    Home. ⋯ → Project settings… changes them.
  - **Chats:** the active project's group comes first and open, the other projects below (click to
    open), then "No project". Drag a chat onto a group to move it; pin a chat (hover → pin) to keep it
    on top, and drag pinned chats to reorder them; the chat's menu has Pin and Move to project.
    Removing a project moves its chats to "No project". The filter button in the header groups the list
    by project, status, day, or as one list (D-170).
  - **Home** uses the project's starter prompts. Its chat box has a folder picker (any workspace or
    one of its repositories; the project's default workspace first).
  - **Claude** can create projects, change their settings and move or pin chats from a chat (with
    Undo).
- **Project links** (section below Projects, and a card on Home): the project's places in groups you
  name (Stage, Prod…).
  - Each link is typed (resource group, website, database, Azure DevOps repo…), with its icon; the
    type and label come from the address.
  - Add one by hand (+), or tick resource groups or resources from your `az` login (cloud button).
    Drag links between groups; click opens your browser.
  - Claude can add or rearrange them from a chat (with Undo).
- **Arrange Scripts and Pipelines:** Arrange in each panel's header hides items, lets you drag them
  into your order and adds dividers (optionally titled). It's the same in every project. Scripts
  shows one group per folder, whatever the active project.
- **Releases** (opens as a main tab: Code menu → Show releases, D-173/D-174; a "N to release" item in the status bar): versions,
  changelogs and release notes per repository (D-110).
  - **Set up** a repository once: Jig shows what it found (version files, tags, changelog, conventional
    commits, tools such as GitVersion) and **Set up with Claude** opens a chat that proposes a release
    policy with reasons, or adopts what's there. **Use what's there / Use the defaults** writes it
    without a chat. The policy is `.jig/release.json` in the repository (commit it to share it).
  - **Planned releases:** the unreleased commits (with their type and AB# work items), **Prepare
    release** with the suggested version (the first release is the baseline), **Draft with Claude** for
    the bump's reason, the changelog and notes per audience, then **Release**: version file, changelog,
    commit "Release x", tag (with the notes), push.
  - **Continuous:** "Deployed to prod" tags the checked-out commit with the next version. Production
    pipelines (from the policy) are watched every 5 minutes: a deploy of a commit without a release
    warns (planned) or becomes the release (continuous).
  - **What's live** per environment and the release history (notes to copy, or publish as an
    artifact through a chat). Merged pull requests are listed with the unreleased commits; an optional
    release pipeline starts on the new tag; Git shows "N unreleased" next to the repository. Weekly reminders when the
    policy asks for them. Git's **Write** uses Conventional Commits when the policy says so.
- **Review comments on diffs** (Git → a changed file): click a line number to comment on it; the
  comments collect per repository and **Review (N) → Send to a new chat** hands them to Claude as one
  message.
- **A chat in its own worktree** (Tools → New chat in a worktree…): Claude works on a copy of the
  project's repository on a new branch (`jig/<what it's for>-<id>`), so your working copy isn't
  touched. The chat's ⋯ menu applies its changes to your working copy (uncommitted), opens the folder,
  or removes the worktree and branch (the chat is stopped and archived first; you can still read it).
- **Unsaved edits are kept safe:** a Preview tab with unsaved changes shows a dot on its tab; closing
  it (Ctrl+W, Close others, Close all) asks first, and Jig never closes it to make room for new tabs.
- **Sweep (Oct 29):** four reviews (renderer, main process, built-in add-ons, packages and docs) and
  their fixes: races in attempts, chats' message queue, add-on hooks and several add-ons (scheduled
  workflows, review comments, deploy tracking, pipeline tracking); safer inputs (IPC schemas, add-on
  zip size, browser popups); file saves that keep permissions and symlinks; shortcut labels that say
  ⌘ on macOS; keyboard access to rows and hover buttons; split view sends keys only to the focused
  pane.
- **Claude and add-ons** (D-115): add-ons can give Claude tools (slot `claude.tool`). Releases does:
  ask a chat "what changed since the last release?", "write the notes for 2.5.0", or "release 1.4.0"
  (that one asks first). Claude can also look inside any add-on and read, create, change or delete its
  stored data (e.g. a workflow, a pipeline arrangement), each change with a card and Undo; the
  add-on's views update.
  - **Data scope** (D-116): an add-on says whether its data is global, per project or per
    repository (`"storage": { "scope": "project" }`); the builder chooses it, `useStorage` keeps one
    copy per project/repository and follows the active one, and Settings → Add-ons shows it.
  - Workflows has tools too: Claude lists, reads, saves, deletes and runs your workflows from a chat.
  - **Claude recommends add-ons in the chat:** it knows your add-ons, and when you ask for something
    step by step that you'll do again (check the code, release notes, user stories, test cases…) it
    does it and offers once to save it as a workflow; it points to an add-on that already does what
    you ask, or offers to build one.
- **Drag views between sidebars:** drag a view's tab to reorder it, or onto another sidebar's tabs
  to move it there (the ⋯ menus still work).
- **Sharing add-ons:** Settings → Add-ons → ⤓ exports an add-on as a `.zip`; **Import add-on…**
  shows what a `.zip` is and what it may do, then installs it (replacing yours only after you confirm).
- **Split view:** two tabs side by side.
  - Right-click a tab → Open to the side, or drag it to the right part of the main area (or onto
    the other pane's tab bar).
  - Drag the divider to resize; closing a pane's last tab (or One pane) ends the split. It's kept
    with the layout.
- **Editing in Preview:** code and text files are editable (Markdown, HTML, JSON… in Source).
  - A full editor (D-118): the theme's own syntax colours, indentation guides, the file's own
    indentation, closing brackets, several cursors (Alt+click, Alt+drag, Ctrl+D), folding, find and
    replace, go to line (Ctrl+G), toggle comment, move lines; a status line with line/column,
    indentation, line endings, language, word wrap and whitespace. Settings → Editor.
  - `Ctrl+S` or Save writes the file. If it changes on disk while you have unsaved edits, a bar asks:
    Keep mine / Load theirs / Show diff. Closing a tab with unsaved edits asks first.
- **Files** (left sidebar, `Ctrl+Shift+E`): the project's files as a tree.
  - Changed files in git colours with their letter; ignored ones dimmed.
  - A filter; click for Preview; right-click to open in VS Code, ask Claude about the file, or copy
    the path.
  - The picker chooses the folder it follows, and the eye button shows others next to it (kept per
    project).
  - It updates by itself when files change.
- **Workspaces** (Settings → Workspaces, or the folder button in the Projects view): the folders Jig
  knows. A repos folder lists the repositories inside (three levels deep, set on the same page).
  - The Git view lists the project's repository, picked at its top; All repositories lists every one,
    changed first, each with its branch, commit box and changes.
  - The eye button shows other repositories next to it for a while (kept per project and
    repository), and the hide button on a row takes them away. Clicking a repository in the full
    list focuses it (status bar, Tools → Git actions).
  - Chats start in the project's default workspace, or anywhere you pick. Repos lists every
    workspace's repositories, whatever the project.
- **Jig's logo:** the amber corner jig (an L-shaped fence holding a square), with no tile behind it (D-157), is the app icon (installer, taskbar, window) and appears in
  the top bar's Jig menu and on the What Jig can do page, in the theme's colours.
- **Claude's terminals:** when Claude starts a dev server or watcher it runs in a Jig terminal you can
  see ("Claude: …") and stop. Claude can read any terminal of the project, including yours, to check a
  server's output.
- **The chat does what Claude Code does** (`docs/reference/chat.md`):
  - **Input:**
    - `/` for Claude Code's commands and skills, `@` for files and folders, `!` for shell commands,
      `#` to remember something in CLAUDE.md;
    - ↑ for earlier messages, Shift+Tab for modes, Ctrl+Enter to send into a running turn.
  - **What Claude does:**
    - its todo list as a checklist, and plans with Approve / Keep planning;
    - diffs on edits, subagent progress, and background tasks with Stop;
    - Edit and send again / Rewind on your messages.
  - **Chat settings:**
    - the model menu with Claude Code's own models and an Effort submenu;
    - chat ⋯ → MCP servers…, Folders for this chat…, Export as Markdown…;
    - Ctrl+F finds in the chat.
  - **With the fake engine, try:** "/usage", "make a todo list", "make a plan", "use a subagent",
    "start a background job", "edit README.md", "! ls".
- **Easier to reach (UI/UX sweep, D-094):**
  - **Starting and finding chats:**
    - **Home:** with no tab open, a project shows a box that starts a chat, starter prompts, recent
      chats with their status, and "Next steps" tiles. It is also the project dashboard.
    - **New chat** is a button in the top bar.
    - **Ctrl+K** opens the Tools menu.
    - **Tabs** show a dot when their chat works, needs you, failed, or finished while you looked
      elsewhere.
  - **In a chat:**
    - **Empty chats** show starter prompts and the message box's shortcuts.
    - **Hovering a message** shows Edit (your messages) and Copy without opening a menu.
    - **After a turn that changed files**, a bar shows them with **Review**, **Walk me through** and
      **Undo changes**.
  - **Wording:** "chat" everywhere you see it, instead of a mix of "session" and "chat".
- **Icons for add-ons:** add-ons use Jig's own icon set, Lucide:
  - names in `addon.json`, imports from `lucide-react`, and `<Icon name>` for icons chosen at runtime;
  - Settings → Add-ons warns about icon names Lucide doesn't have.
- **Routines** (Tools → Routines): your Claude Code routines, the prompts Claude Code runs on a
  schedule on the web.
  - The list shows each one's schedule in words, its last run and an on/off switch.
  - For the selected routine: **Run now**, its runs, and each run's messages.
  - **New routine…** and **Change with Claude…** open a chat; in any chat you can also ask Claude to
    make one.
  - Jig asks Claude Code for them, a small model call each time, so the tab loads on demand.
- **Artifacts:** when Claude publishes a page in a chat, its card has **Open in Jig** (Preview) and
  **Open on claude.ai**. Tools → Artifacts lists those, and on request every artifact on your claude.ai
  account; Claude Code reads one back to open it in Jig.
- **Claude's browser:** Claude opens your dev server (or any http/https/file page) in a real headless
  browser inside Jig, reads it, clicks and types, takes screenshots that show in the chat (the whole
  page, or phone/tablet/desktop sizes in one go), and reads the console. The view opens by itself
  (turn off Settings → Claude Code → Show Claude's browser when it's used to keep it closed); its size
  never limits Claude. The **Claude's browser** view
  (right sidebar, or Tools → Open Claude's browser) shows the
  page live with an address bar, back/forward/reload, desktop/tablet/phone sizes and the console; click
  and type on it to take over. Try it with the fake engine: `browse file:///path/to/page.html`.
- **Testing on a small model** (D-124): chats hand page testing to the `jig-tester` subagent, which
  uses Claude's browser on Haiku (Settings → Claude Code → Tester model) and reports PASS/FAIL per
  check with screenshots. Tools → Test something… or the flask in Claude's browser view starts a
  test chat on that model. Try it with the fake engine: Tools → Test something… → anything.
- **Images from tools:** screenshots and charts that a tool returns (an MCP browser, a plotting tool)
  show as thumbnails in the chat instead of "[image]".
- **Guided tours of changes:** Git → ✨ → Walk me through the changes (also a workspace repo's menu
  and the chat's ⋯). Claude orders the uncommitted changes for understanding and explains each step
  next to its highlighted diff; ←/→ to move.
- **Check before committing:** Git → ✨ → Check before committing. Claude lists secrets, debug output,
  unfinished code or likely bugs in the changes, under the commit box.
- **Turn a chat into a tool:** the chat's ⋯ → Turn this chat into a tool…. The builder gets what you did
  (requests, commands, changed files) to make something you can run with one click.
- **Write my standup:** Tools → Write my standup…. Done / Next / Blockers from your commits in every
  repository, uncommitted work and the chats you had since the last working day (or a week), with Copy.
- **Try several ways:** the split button in the message box (or Tools → Try a task several ways…)
  starts 2–4 chats on the same task. Each works in its own git worktree from your last commit, from a
  different angle (simplest, cleanest, most thorough, unconventional; all editable). The Attempts tab
  shows their progress and changes with diffs. **Let Claude judge** recommends one with strengths and
  weaknesses per attempt. **Keep this one** applies it to your working copy and removes the rest.
- **File previews:** right-click a file in Git → Preview, the eye on a chat tool card, an attachment, or
  Tools → Preview a file…. Markdown is rendered with Mermaid diagrams, relative images and links between
  files. HTML runs in a sandbox, with scripts off unless you turn them on. PDFs open in a viewer.
  CSV/TSV and Excel show as filterable tables, JSON as a tree, and notebooks with their outputs.
  Images, audio, video, Word/PowerPoint text, .mmd diagrams, patches and highlighted code also work.
  The preview follows the file while it changes, and Ask Claude opens a chat about it. Chats draw
  Mermaid blocks as diagrams too.
- **Ask Claude about a failed script:** when a script exits with an error, a toast offers **Ask Claude**:
  a new chat opens in the script's folder with the command, exit code and the end of the output typed
  in. Failed terminals also get a ✨ button in the list, and any terminal's menu has "Ask Claude about
  this output".
- **Desktop notifications:** while Jig is in the background, a system notification tells you a chat
  needs you, finished or failed (click it to go there; the taskbar button flashes when it needs you).
  Settings → Claude Code → Desktop notifications.
- **Claude in Git:** the commit box's **Write** button asks Claude for the commit message (from the
  diff, in the style of the repo's recent commits). Right-click a changed file → **Explain this change
  with Claude**, or a workspace repository → **Review changes with Claude**: a new chat opens with the
  request typed in, ready to send. Add-ons can do the same with `ctx.ai.ask` (permission `ai`); the
  builder knows about it.
- **Restore files and fork:** hover one of your messages → ⋯ → **Rewind to before this message** →
  **Only the files** shows which files Claude changed since then and puts them back (Claude Code's file
  checkpoints; Settings → Claude Code → File checkpoints). The same submenu rewinds the chat, or the
  chat and the files; **Edit and send again** rewinds and puts your message back in the box. The chat's ⋯ menu → **Fork chat** continues
  the conversation in a new chat, so you can try another approach and keep the original.
- **Next-message suggestions:** after a turn Claude Code proposes what you might send next. It shows
  as a chip above the message box (click to edit it, the arrow sends it) and as the box's placeholder
  (Tab takes it). Settings → Claude Code → Suggest the next message.
- **Context window and Compact:** each chat header shows how full the context window is (a small bar
  and %); hover for what fills it (messages, tools, system prompt, …), click for **Compact
  conversation** or **Compact with instructions…** (Claude Code's own `/compact`). From 70% a
  **Compact** button shows next to it; the chat's ⋯ menu has the same entries.
- **What Jig can do** (the "Jig" menu at the top left, the `?` in the top bar, Tools → What Jig can do,
  Settings → About; it is also what the main area shows when no tab is open): a page with screenshots of each part, a live grid of the 17 extension slots (which of your
  add-ons use each, an `addon.json` example, "Build something here"), your add-ons, the tools Claude
  gets to configure Jig with "Try in a chat" examples, your Claude Code skills (`~/.claude/skills` and
  the project's), build examples that open the Build dialog, and every keyboard shortcut.
- **File icon themes:** files and folders (Git, tabs, chat tool cards, builds, add-ons via `FileIcon`) use
  the icon theme your VS Code uses — e.g. Material Icon Theme — or any VS Code icon theme you pick in
  Settings → Appearance → File icons (or install from Open VSX); "Jig" keeps Jig's own icons.
- **Phase 11 (done): packaging & Windows.**
  - `npm run dist` packages Jig with electron-builder; on Windows it makes `Jig-Setup-<version>.exe`
    (per-user NSIS installer with Start menu shortcut and Jig's icon). Guide: `docs/guides/packaging.md`.
  - **Get started** (opens on an installed Jig's first start; Tools → Check your setup…): Claude Code,
    git, gh, az + Azure DevOps extension, VS Code `code`, with install links and Sign in to Claude Code….
  - **Check for updates…**: from a git clone, pull + build + restart; installed, the latest GitHub release.

## How to try it

```bash
npm install
npm run dev          # opens Jig
```

- Add a project: **Add project…** in the middle of the empty window, or the project switcher.
- Try themes: the gear (top right) → Appearance. Drop a VS Code theme `.json` into `~/.jig/themes`
  and it appears; edit it and Jig recolours as you save.
- Move a view: `⋯` in the sidebar header → Move to right sidebar.
- Try a proposal without Claude: `JIG_ENGINE=fake npm run dev`, Tools → Build something… → "change Jig
  itself: …" → the build shows the proposed extension point.
- Everything the fake engine can play (todo lists, plans, subagents, edits, the browser…):
  `docs/guides/testing.md` → The fake engine.

## Needs testing on your machine

Things the cloud build environment couldn't verify:

- **Checked on Windows 11 (Oct 29, first local run):**
  - `npm install` works (Node 24, Electron download, node-pty, the Agent SDK's win32 package).
  - A fresh clone used to fail `npm run check`: Git for Windows checks files out with CRLF
    (`core.autocrlf=true`), which Biome rejects. `.gitattributes` now keeps LF (D-121).
  - `npm run build` and `npm run dev` failed on Windows: the main-process build marked its own
    entry points (`C:\…`) as external npm packages. Fixed in `apps/desktop/scripts/build-config.mjs`.
  - Add-on UIs didn't bundle at all on Windows: the bundler took the entry `C:\…\ui.tsx` for a
    package import and refused it. Fixed in `main/addons/bundle.ts`.
  - The add-on file list Claude reads is sorted, so it's the same on NTFS and ext4.
  - `npm run e2e` passes on Windows: 95 passed, 6 skipped (screenshots and Linux-only ones), with the
    windows hidden.
  - Email to developers opened Office's "install Outlook" stub on a machine with only the new
    Outlook (`OUTLOOK.EXE` is registered even when classic Outlook isn't installed). It now saves the
    zip in Downloads and opens a plain `mailto:` email in your default mail app (D-123). Checked
    with the new Outlook: the email opens and Explorer shows the zip.
  - A submenu near the window's right edge (the bottom panel's ⋯ → Show below…) was pushed back
    over its parent menu and looked like it replaced it; it now opens on the parent's left.
  - The taskbar showed Electron's icon when Jig runs from a clone: Jig now has its own app id
    (`dev.jig.workbench`, as in the installer), so the taskbar shows Jig's icon.
  - A Jig with its own `JIG_HOME` (tests, a throwaway home) quit at once while your usual Jig was
    open: the one-instance lock was per Windows user. With `JIG_HOME`, Electron's data folder (and the
    lock) now lives in that home, so both run side by side.
  - `.cmd` programs in a folder with spaces didn't run at all (`az` in `C:\Program Files\…`, VS
    Code's `code`, `npm`): the program's path was quoted with `^"`, which cmd takes literally. It's
    now escaped with `^` the way cross-spawn does (`escapeProgramForCmd`). This broke Pipelines,
    Releases, Project links from Azure and Open in VS Code on Windows; Check your setup said az and
    code weren't installed. It also ignores az's "WARNING: updates available" line now.
  - VS Code's own themes (Dark Modern, Dark+, Light+…) were missing: newer VS Code keeps its
    built-in extensions in a folder named after the build (`Microsoft VS Coded62b1d5da
esources\…`),
    which Jig now finds (`builtinExtensionsDir`).
  - **Measured on Jon's machine** (built app, throwaway `JIG_HOME`, real profile, `E:
epos` as the
    workspace with 52 repositories):
    - Git view: all 52 repositories listed; **0** git processes from Jig in 60 s of idle (other
      tools on the machine ran ~120 in 30 s); a new file showed in ~0.7 s and left ~0.7 s after
      deletion.
    - Files view on `E:
epos`: a new file showed in ~1.5 s and left ~1.6 s after deletion.
    - Scripts: 3,088 scripts in 1,033 folders, found in 4–7 s; 2,551 of them came from git worktrees
      of one repository, which Scripts now leaves out (D-127).
    - Check your setup: Claude Code (bundled), git, gh, az + azure-devops, VS Code `code` all found.
    - Themes: Jig's 2, VS Code's built-in ones and the extensions' (25); file icons follow VS Code's
      Material Icon Theme.
    - `npm run dist` builds `Jig-Setup-0.1.0.exe` (247 MB, unsigned); the packaged app
      (`win-unpacked\Jig.exe`) starts, opens Get started and loads the built-in add-ons with its
      bundled esbuild (`e2e/packaged.spec.ts`). The installer itself wasn't run.
  - When a watched folder is deleted (a removed worktree, a renamed folder), Node on Windows reports
    the folder's own path over and over instead of an error, which kept Git's and Files' watchers
    busy for good. Those watches now close, and the views fall back to checking by themselves
    (`watchLost`), as they also do when a watch fails.
  - The theme could flip back to the previous one when a theme file and the theme setting changed
    together: two refreshes overlapped and the slower one, which had read the old setting, won. Only
    the latest refresh applies now.
  - e2e runs filled the desktop with "Claude finished: …" notifications from "Electron": the hidden
    test windows count as in the background. A hidden Jig (`JIG_HIDDEN`) now never notifies, and
    notifications carry Jig's logo. (Restarting Jig never notified about old chats: only a chat
    that stops working does.)
  - Signing in left you in an interactive Claude Code (first-run theme picker, then a chat) with
    nothing saying Jig was signed in too: it now runs `claude auth login`, which only signs in, and
    Jig confirms it and closes the terminal.
  - Examples and tests used real project names ("Podium" as the New project placeholder); they're
    neutral now, and AGENTS.md says so.
  - Unit tests wrote log lines into the real `~/.jig/logs/main.log`; `vitest.config.ts` now gives
    every test a temporary `JIG_HOME` unless it sets its own.
  - Workflow command steps lost their quotes in `cmd.exe` (`echo "a b"` printed `\"a b\"`): an
    add-on's `exec("cmd.exe", ["/d", "/s", "/c", line])` now passes the line as written
    (`resolveCommand` in `main/addons/winCommand.ts`). Scripts and terminals were already right.
  - The window controls (minimise, maximise, close) hung below the top bar: they were 40 px and the
    bar 2.5rem, which is 32.5 px at the default 13 px UI font. The bar now takes the controls' height
    (`env(titlebar-area-height)`), now 36 px, at any font size; an e2e test checks it.
  - A failed script always said "Exit code 1" on Windows (PowerShell's `-Command` replaces the
    program's code): scripts run in PowerShell now exit with the program's own code.
  - Saving in Preview failed while another program had the file open (Windows can't rename over
    it): it now writes into the file instead. CRLF is kept.

- **Phase 18 on Windows:**
  - Files: the watcher on a large repository (live refresh), Open in VS Code.
  - Editing in Preview: saving CRLF files, a file changed by Claude while you edit.
  - Releases: `az pipelines runs list` for production environments; tagging and pushing to Azure
    DevOps; a `Directory.Build.props` / `.csproj` version bump.
  - Workflows: command steps run in `cmd.exe` (`/d /s /c`); a schedule that fires while Jig is open.
  - Commands with quotes in `cmd.exe` (Scripts, Workflows, Claude's terminals): Jig now passes one
    command line (`/d /s /c "…"`) so `echo "a b"` keeps its quotes.
  - Saving a file in Preview while an antivirus scanner holds it (the save retries a few times).
  - Learning 2: "How you worked" on a real week of commits; the check-in chat with real Claude
    (`jig_read_profile`, `jig_update_profile`); Claude saving notes on its own (`jig_note_evidence`)
    with the real model.
  - Claude's browser network log on a real dev server (bodies of the first page's requests).

- **Real Claude Code sessions with your login** (phase 4): start a session, check streaming, tool
  cards, permission prompts, Always allow, interrupt, model switch, resume after restarting Jig, and that
  the header shows no "API key billing" badge. If Claude Code isn't signed in, check the banner.
  Note: in the cloud container one smoke test ran the real Claude Code with an empty HOME and no
  credentials in its environment, yet the container itself supplied a login, so one tiny request
  (~$0.02) was made. Jig read no credentials; this was not repeated and tests use the fake engine.
- **Themes from your real VS Code install**: open Settings → Appearance and check your installed themes
  appear (labels, dark/light) and look right. On Windows Jig reads `%USERPROFILE%\.vscode\extensions`
  and `%LOCALAPPDATA%\Programs\Microsoft VS Code\[<build>\]resources\app\extensions` (built-in themes).
- **Open VSX** search and install (open-vsx.org is blocked in the cloud container; tested with a mock).
- The top bar under the Windows window controls (the right padding comes from the Window Controls
  Overlay `titlebar-area-*` CSS variables) and the window-control colours following the theme.
- The native folder picker when adding a project.
- **Terminals on Windows**: PowerShell starts in the project folder, colours/fonts look right, resizing
  works, and **Stop** on a script really ends the dev server (node/dotnet child processes).
- **Script discovery** in your real repos (npm/pnpm, `.csproj`, Azure Functions folders).
- **Sign in to Claude Code…** with a real account: `claude auth login` in the terminal, then the
  "Signed in" toast, the terminal closing by itself, and Get started saying "Signed in with your
  Claude subscription".
- **Routines and artifacts with your real account:** the Routines tab lists your routines (check the
  schedule words and prompts), on/off and Run now work, runs and their logs show, and a routine Claude
  makes in a chat appears after the reload. Artifacts: Claude's Artifact tool exists in your Claude
  Code, Open in Jig shows the page, Load from claude.ai lists yours and opens one. If the tools are
  missing, the tabs should say so clearly.
- **The chat with a real Claude Code:**
  - the `/` list shows your skills and plugin commands;
  - `/usage` and custom commands print their output;
  - a plan in plan mode shows as a plan card;
  - subagent progress updates;
  - Edit and send again continues correctly (the rewind point);
  - MCP servers show their real status;
  - the Effort submenu matches your model;
  - `!` commands run in PowerShell on Windows.
- **Git live refresh on Windows:** in a workspace with many repositories, edit a file in one of them
  outside Jig; it should show in the Git view within about a second. Task Manager should show no steady
  `git` processes while nothing changes. (Linux, where the tests run, uses the polling fallback.)
- **Claude's browser with a real chat:** ask Claude to start your dev server and check a page. Check
  that the view follows, that clicks and typing on the picture reach the page (also on a HiDPI
  screen), that screenshots show in the chat, and that the browser window doesn't keep Jig running
  after you close it.
- **A real pattern run**: after a few days of use, press Look for patterns now and check the
  suggestions make sense (and that "Never" sticks). The weekly run on Monday 10:00 (or at the next
  launch after it).
- **A real build with Claude Code**: Tools → Build something… → e.g. "a status bar button that runs
  npm test in the active project". Check that the builder reads the catalog, prefers changing an
  existing add-on when you name one, passes validation, that the preview works, and Accept/Discard.
  Open the Builder chat to see what it did.
- **Add from Azure across tenants** (tested with a fake `az` only): check that every subscription you
  have shows with its resource groups, and which ones it says it couldn't read (a tenant may need
  `az login --tenant <id>` once).
- **Open a Claude Code chat** (tested with the fake engine only): check that your real Claude Code
  chats are listed (the desktop app's Code tab and terminal ones), that the history reads right
  (long chats with subagents and tools), and that sending a message continues it while the original
  stays as it was in the desktop app.
- **Pipelines with your Azure DevOps** (tested with a fake `az` only): check that your repositories'
  pipelines show with their newest run and stages, that the Run form's branch list and parameter
  pickers match the YAML, that Queue run starts the run you picked (try a harmless pipeline or
  "Deploy to: none") and that its notification comes; "More pipelines" for the rest. Needs `az login` and
  `az extension add --name azure-devops`.
- **Git on your real repos**: large histories (scrolling, filter), Windows paths with spaces, line
  endings in diffs, push with your credential manager (a sign-in window may appear — that is git's,
  not Jig's), Open in VS Code (needs the `code` command on PATH).
- **Add-ons on Windows**: the add-on host process (utilityProcess) starts, `api.exec("git", …)` works
  without a console window flashing, and file watching picks up saves in `%USERPROFILE%\.jig\addons`.

- **Updates from your clone with the launcher**: break the build on purpose in a throwaway commit (e.g.
  throw in `main/index.ts`), push it, then Tools → Check for updates… → Pull, build and restart: the
  launcher should start the previous build with the banner. Revert the commit and update again.
- **The Windows installer** (phase 11; only the Linux package could be built and run here): on
  Windows run `npm install` and `npm run dist`, install `apps/desktop/release/Jig-Setup-0.1.0.exe`
  (SmartScreen: More info → Run anyway), start Jig from the Start menu, check the icon, that Get started
  opens and finds Claude Code (the bundled `claude.exe`), git, az + the DevOps extension and `code`;
  start a session, open a terminal (PowerShell; try `cmd.exe` and Git Bash in Settings → Terminal), and
  check the built-in add-ons load (they are bundled with the packaged esbuild). Uninstall from Windows
  Settings → Apps.
- **Updates**: Check for updates… in your clone after a new commit on GitHub (Pull, build and restart),
  and in the installed app once there is a GitHub release (a private repository can't be checked
  without a login, so it says "Couldn't check").

- **Pasting a screenshot with real Claude Code**: Win+Shift+S, then Ctrl+V in a chat, ask "what's in this
  image?" — Claude should describe it (the image goes as an image block; only the fake engine was used
  here). Then attach a real PDF and a Word/Excel/PowerPoint file you use at work and ask for a summary;
  also try copying a file in Explorer and pasting it into the message box.
- **Try several ways with your real Claude Code**: three attempts on a small task in one of your repos;
  check the worktrees appear under `~/.jig/attempts`, the judge's verdict makes sense, and Keep applies
  cleanly and removes the worktrees (`git worktree list`).
- **Previews on Windows**: a PDF, a video (seeking) and an HTML page with scripts from your own repos;
  Markdown with images in a sibling folder.
- **Desktop notifications on Windows**: put Jig in the background during a long turn; a Windows
  notification should appear when it finishes (and the taskbar button flash on a permission prompt), and clicking it should bring Jig to the front and open that chat (`focusJig`: restores,
  shows, briefly sets always-on-top because Windows refuses focus to a background process; the
  notification is kept referenced, as Electron drops clicks on a collected one). Not yet tried on Windows.
- **Restore files and fork with your real Claude Code**: let Claude edit a file, then Restore files to
  before that message (the preview should list it); fork a chat and check the fork remembers the
  conversation while the original doesn't see the fork's messages.
- **Context meter with your real Claude Code**: after a few turns the % in the chat header should match
  `/context` in the CLI for the same session; Compact should shrink it and show "Conversation compacted
  (… → … tokens)".
- **The What Jig can do page**: open it with the `?` in the top bar; check your skills from
  `~/.claude/skills` are listed and that the screenshots look right on your screen.
- **Configuring from a real chat**: ask Claude Code (real login) to "switch to a light theme and make it
  compact" and "move the terminals to the right"; check the permission prompts, the change cards and
  Undo, and that "allow API keys" is refused.
- **Plan usage with your real login** (only the fake engine ran here): the status bar numbers and the
  card should match `/usage` in Claude Code; check the reset times, the per-model weekly windows of your
  plan, and that it updates after a chat. If it says "usage n/a" while you're signed in with a
  subscription, look at the card's message and Jig's log.
- **Your real repos folder as a workspace**: check that every repository is found (Projects shows the
  count; if one is missing tell me how deep it is), that the Git view stays fast with all of them, that
  file watching keeps it up to date on Windows, and that the scripts list isn't too long.
- **File icons with your VS Code**: Settings → Appearance → File icons should say "Same as VS Code
  (Material Icon Theme)" and the samples, Git list and tabs should match VS Code. Also try VS Code's
  default Seti (a font-based theme: only tested with unit tests) and a light colour theme (Material's
  light variants).

## Known gaps / notes

- In the cloud container Electron's binary download fails through the proxy; it was installed by
  hand. On a normal machine `npm install` downloads it.
- `docs/plan/01-app-skeleton.md` lists the bridge as `window.jig.invoke` + renderer `call()` (the
  envelope design); see its notes.

## Model defaults and desktop polish (2026-10-29)

- New chats default to native Opus planning / Sonnet execution and Plan mode. Settings → Claude Code exposes the chat, subagent fallback, helper and tester models; Use recommended defaults applies the preset to existing installations. Existing saved choices remain.
- Subagent fallback is Sonnet, add-on questions use Sonnet, tester/reflection stay Haiku. Explicit specialist choices remain available; this is not a quality guarantee or cost cap.
- Top-bar action groups each have a menu; the all-tools icon and Ctrl+K still search everything. Theme cards apply only on selection, with no hover preview. Menu/button text and toolbar icons increase one token step.
- Pipelines → Arrange hides/restores whole DevOps projects. Settings checks/save show progress/errors.
- Extra usage formats cents as currency (4000 EUR = €40.00).
- Windows builds include an explicit ICO and shell relaunch metadata. Needs testing after reinstalling; existing taskbar pins may need repinning.

- Markdown Preview renders safe embedded README HTML (headings, centered blocks and sized local images), instead of printing tags. Scripts and handlers are removed; chat HTML stays escaped.

Validation: `npm run check` passes (454 tests; 8 skipped). Focused fake-engine Electron regressions pass for model settings/action groups, pipeline gear navigation/project hiding, theme selection and Markdown HTML/local images. Screenshots regenerated. The packaged Windows app starts and loads its built-in add-ons, and the executable contains Jig’s icon. The pipeline gear failure was not reproduced in current source; verify the fresh installed build. Actual installed taskbar/pinned-shortcut appearance still needs reinstall verification.

Markdown table follow-up: preserve HTML spans, column widths and cell alignment; README screenshot galleries no longer lose their spanning rows. Ordinary GFM table alignment is retained too.

UI follow-up: larger panel view tabs and slightly smaller top-bar group labels. Open top-bar menus switch groups on hover; closed menus stay closed. Add from Azure gives Filter and Group matching label/input stacks so their inputs align.

Taskbar investigation: the installed executable, running-window icon handles and Start-menu shortcut all contain Jig’s logo, and there is no Jig taskbar pin. The reported Electron taskbar icon therefore remains a shell/grouping issue rather than a missing asset. Follow-up defers taskbar registration until window branding is ready, uses the executable icon for relaunch metadata and excludes browser helpers. Actual visible taskbar result still needs verification after installing this follow-up.

Menus remain open while a screenshot overlay takes focus. Git history from a project resolves its focused/only inner repository or offers a repository picker; it displays that repository’s current-branch commits. Git Settings keeps Every visible beside the interval select. Shared regular Button text returns to text-sm with centered icons, while panel tabs and toolbar icon buttons retain their separate sizes.

Settings follow-up: Claude Code model choices are dropdowns discovered without an AI prompt; the recommended preset is a primary button and subagent precedence lives in expandable help. Font fields offer bundled/system/custom choices and individual Reset buttons. Open VSX search runs after a 500 ms typing pause (at least two characters), with stale results ignored; Enter/Search remains available.

Repos hover actions now reserve their layout space; revealing fetch/pull/push/more no longer shifts repository text or changes row height.

The main Jig logo/name menu now includes the registered Jig actions (setup, updates, reload, settings, developer tools, all tools and About), replacing the duplicate top-bar Jig group. Development also sets explicit window-level taskbar icon/relaunch metadata, using its own identity.

Latest validation: `npm run check` passes with 459 tests (8 skipped). Additional fake-engine Electron regressions pass for merged/hovering menus, screenshot blur, workspace history, model pickers, font reset and automatic Open VSX search. The user requested a local development launch instead of another installer; use the existing Jig home and close the installed copy first. Taskbar visual verification remains open.

Live validation (2026-10-29): closed the installed copy and launched `npm run dev` from this checkout. The dev server is at http://localhost:5199/ and the app uses the existing `~/.jig` home; the visible local Electron window was verified. No follow-up installer was built.

Panel-tab refinement: labels (Chats, Files, Pipelines, etc.) use text-sm, one step smaller; icon and button dimensions remain unchanged. Applied to the live dev build through hot reload.

Dropdown/menu hover is clearer: an accent-tinted fill and inset accent outline identify the hovered or keyboard-selected row, also in the all-tools picker. Disabled rows stay unhighlighted.

Dropdown item labels use text-sm (matching the all-tools picker); icon sizes, row heights and the stronger hover highlight are unchanged.
