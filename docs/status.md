# Status

_Last updated: 2026-10-28 (phases 0–17: every phase of the plan is done; the latest are routines and artifacts, Claude's browser and the chat at Claude Code's level)._

## Continue here (next session)

1. Clone Jig and install: `npm install` (npm reads `.npmrc`, which sets `legacy-peer-deps`).
2. Clone ThinkRail beside it for reference: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`.
   Which parts to read for which phase: `docs/reference/reference-repos.md`.
3. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`.
4. Phases 0–18 in `docs/plan/README.md` are ✅ (phase 18 was Jon's list: file explorer, editing in
   Preview, projects you manage, arranging panels, split view, project links, Releases, Learning 2
   with Workflows). What's left of it is in `docs/plan/99-backlog.md`. Next: try phase 18 on Windows
   ("Needs testing on your machine" below) and ask Jon what comes next.
5. Run `npm run check` before every commit; keep plan, docs and decisions true.

## What works today

- **Phase 0–1 (done):** docs, plan, tooling; the Electron app with the typed host bridge, config in
  `~/.jig/config.json`, window state, host log in `~/.jig/logs/main.log`.
- **Phase 2 (done): design system & themes.**
  - Every colour, space, radius and type size is a token (`docs/reference/design-tokens.md`);
    `npm run check:tokens` rejects hard-coded colours and arbitrary values.
  - Themes: Jig Dark, Jig Light, your own files in `~/.jig/themes` (Jig or VS Code format, re-applied
    on save), themes from installed VS Code / Insiders / Cursor / VSCodium / Windsurf (plus VS Code's own
    built-in themes), and Open VSX search + install (theme JSON only). See `docs/guides/themes.md`.
  - Settings → Appearance: theme grid with hover preview, follow the system light/dark mode, density,
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
  - Scripts on the project dashboard: npm/pnpm/yarn/bun scripts, `.ps1`/`.sh`, `dotnet run`/`watch`,
    `func start`, per folder; Run / Stop / Restart; groups such as "Start local" start several at once;
    the status bar shows "N running".
  - Tools → Sign in to Claude Code… opens a private terminal with Claude Code for `/login`.

- **Phase 6 (done): add-on system.**
  - Add-ons are folders with `addon.json` (+ `ui.tsx`, `host.ts`, `README.md`) in `~/.jig/addons`
    (a git repository) or Jig's built-in `addons/`. They load into 16 slots (views, tabs, top bar,
    status bar, dashboard, Tools actions, context menus, chat toolbar and tool cards, prompts,
    watchers, settings pages, themes); see `docs/guides/writing-addons.md`.
  - Saving a file reloads that add-on; a crash shows "Turn off" in its place, never a broken app.
  - Host code runs in its own process with permission-checked `exec`/`fs`/`fetch`.
  - Settings → Add-ons: on/off, problems and token warnings, permissions, open folder, reload,
    history and roll back.

- **Phase 7 (done): built-in add-ons.**
  - **Git** (left sidebar, `Ctrl+Shift+G`): current branch with ahead/behind and fetch/pull/push,
    working changes with stage/unstage/discard and commit, branches (click → history, right-click →
    switch/compare/new branch). History, commit detail, diffs (side by side / inline) and compare open
    as tabs in the main window. Branch in the status bar.
    Updates live: on Windows and macOS within about a second of a file changing (watchers, only the
    repository that changed is looked at again); on Linux by a check every few seconds. Every
    repository is fetched in the background every 5 minutes (Settings → Git), so "behind" stays
    current; it never asks for a login.
  - **Repos** (a collapsible section at the bottom of the Git panel; its ⋯ menu moves it to its own
    tab, and any view can be shown below another the same way): every project's repo with branch, changes, ahead/behind, last fetch;
    fetch/pull/push; "N to push/pull" in the status bar; right-click a project → Open in VS Code /
    Explorer.
  - **Pipelines** (right sidebar): Azure DevOps through your `az` login; set up in Settings →
    Pipelines; run on a branch, open in the browser, notifications when your runs finish.
  - **Scripts** (right sidebar): every script of every project; Tools → Run a script… (`Ctrl+Shift+R`).

- **Phase 8 (done): builder, levels 1 and 2.**
  - Tools → **Build something…** (`Ctrl+Shift+B`), **Change this with AI…** in an add-on view's `⋯`
    menu or tab menu, **Fix with AI** on a crashed add-on, or ask in any chat ("make me a …").
  - The builder (a Claude Code session you can open) picks the lightest level: a layout or settings
    change, else an add-on — changing an existing one when it fits — validated (manifest, bundles,
    exports, design tokens, README; up to 3 fix rounds).
  - You review in the build tab: layout/settings changes, or the add-on running as a "(preview)" with
    its files, diffs and permissions. **Accept** applies it (add-ons: a commit in `~/.jig/addons`,
    roll back from Settings → Add-ons); **Discard** leaves nothing behind. Builds view in the bottom panel.
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
    - **Check-in** (Settings → Learning, off by default; offered once after two weeks): a short chat
      with 3–5 questions that adds what it learns to your profile.
    - **Workflows** (left sidebar, Tools → Show workflows; a new built-in add-on): lists of steps you
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
- **Plan usage, always visible:** the status bar shows `5h 42% · wk 18%` and each chat header has a ring
  for the 5-hour window; hover either for a card with every window, a bar each and when it resets (click
  to refresh). The numbers come from Claude Code's own `/usage` data.
- **Projects you manage** (D-101, D-102): a project groups chats; folders never decide which chats are
  in it.
  - **New project…** (Projects view, top bar menu, Tools) asks for a name, a colour, a default
    workspace folder, a default Git repository, the model/effort/permission defaults for its chats,
    instructions for Claude (added to its system prompt in those chats) and starter prompts for its
    Home. ⋯ → Project settings… changes them.
  - **Chats:** the active project's group comes first and open, the other projects below (click to
    open), then "No project". Drag a chat onto a group to move it; pin a chat (hover → pin) to keep it
    on top; the chat's menu has Pin and Move to project. Removing a project moves its chats to "No
    project".
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
- **Releases** (right sidebar, Tools → Show releases; a "N to release" item in the status bar): versions,
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
  or removes the worktree and branch.
- **Sharing add-ons:** Settings → Add-ons → ⤓ exports an add-on as a `.zip`; **Import add-on…**
  shows what a `.zip` is and what it may do, then installs it (replacing yours only after you confirm).
- **Split view:** two tabs side by side.
  - Right-click a tab → Open to the side, or drag it to the right part of the main area (or onto
    the other pane's tab bar).
  - Drag the divider to resize; closing a pane's last tab (or One pane) ends the split. It's kept
    with the layout.
- **Editing in Preview:** code and text files are editable (Markdown, HTML, JSON… in Source).
  - CodeMirror in the theme's colours, with find (`Ctrl+F`); `Ctrl+S` or Save writes the file.
  - If the file changes on disk while you have unsaved edits, a bar asks: Keep mine / Load theirs /
    Show diff.
  - Gap: closing the tab drops unsaved edits without asking.
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
- **Jig's logo:** the amber corner jig (an L-shaped fence holding a square) on graphite is the app icon (installer, taskbar, window) and appears in
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
  Settings → About; it is also what the main area shows when no tab is open): a page with screenshots of each part, a live grid of the 16 extension slots (which of your
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

- **Phase 18 on Windows:**
  - Files: the watcher on a large repository (live refresh), Open in VS Code.
  - Editing in Preview: saving CRLF files, a file changed by Claude while you edit.
  - Releases: `az pipelines runs list` for production environments; tagging and pushing to Azure
    DevOps; a `Directory.Build.props` / `.csproj` version bump.
  - Workflows: command steps run in `cmd.exe` (`/d /s /c`); a schedule that fires while Jig is open.
  - Learning 2: "How you worked" on a real week of commits; the check-in chat with real Claude
    (`jig_read_profile`, `jig_update_profile`); Claude saving notes on its own (`jig_note_evidence`)
    with the real model.
  - Claude's browser network log on a real dev server (bodies of the first page's requests).

- `npm install` on Windows (Electron download, `@lydell/node-pty` prebuilt binary, the Agent SDK's
  `win32-x64` package).
- The window's title-bar overlay (Windows window controls drawn over Jig's own top bar).
- **Real Claude Code sessions with your login** (phase 4): start a session, check streaming, tool
  cards, permission prompts, Always allow, interrupt, model switch, resume after restarting Jig, and that
  the header shows no "API key billing" badge. If Claude Code isn't signed in, check the banner.
  Note: in the cloud container one smoke test ran the real Claude Code with an empty HOME and no
  credentials in its environment, yet the container itself supplied a login, so one tiny request
  (~$0.02) was made. Jig read no credentials; this was not repeated and tests use the fake engine.
- **Themes from your real VS Code install**: open Settings → Appearance and check your installed themes
  appear (labels, dark/light) and look right. On Windows Jig reads `%USERPROFILE%\.vscode\extensions`
  and `%LOCALAPPDATA%\Programs\Microsoft VS Code\resources\app\extensions` (built-in themes).
- **Open VSX** search and install (open-vsx.org is blocked in the cloud container; tested with a mock).
- The top bar under the Windows window controls (the right padding comes from the Window Controls
  Overlay `titlebar-area-*` CSS variables) and the window-control colours following the theme.
- The native folder picker when adding a project.
- **Terminals on Windows**: PowerShell starts in the project folder, colours/fonts look right, resizing
  works, and **Stop** on a script really ends the dev server (node/dotnet child processes).
- **Script discovery** in your real repos (npm/pnpm, `.csproj`, Azure Functions folders).
- **Sign in to Claude Code…** opens Claude Code in a terminal and `/login` works there.
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
- **Pipelines with your Azure DevOps** (not testable here): Settings → Pipelines → Check Azure CLI,
  enter the organisation, Load from Azure DevOps, pick projects; check the list, Run…, the browser
  links, and the notification when a run finishes. Needs `az login` and
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
  notification should appear when it finishes (and the taskbar button flash on a permission prompt).
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
