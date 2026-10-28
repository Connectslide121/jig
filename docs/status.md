# Status

_Last updated: 2026-10-28 (phases 2–11: every phase of the plan is done)._

## Continue here (next session)

1. Clone Jig and install: `npm install` (npm reads `.npmrc`, which sets `legacy-peer-deps`).
2. Clone ThinkRail beside it for reference: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`.
   Which parts to read for which phase: `docs/reference/reference-repos.md`.
3. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`.
4. Every phase in `docs/plan/README.md` is ✅. Next: work through "Needs testing on your machine" below
   on Windows (installer, real Claude Code sessions, a real build), then pick items from
   `docs/plan/99-backlog.md`.
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
    "slow", "fail", "login").

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
  - **Repos** (right sidebar): every project's repo with branch, changes, ahead/behind, last fetch;
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
    delete-all in Settings → Learning.
  - **Look for patterns now** (light bulb in the top bar → Suggestions, or Tools) and every Monday at
    10:00 (catch-up at launch): repeated commands, sequences and similar prompts are found without AI;
    only then one small Claude Code request picks at most 3 suggestions with evidence.
  - **Build it** starts the builder; **Not now** hides it for 14 days; **Never** blocks the pattern.
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
- **Workspaces:** add your repos folder as a project (Add project…) — Jig finds the repositories inside
  (three levels deep; Settings → Layout → Workspace search depth). The Git view lists every repository's changes in one panel (changed first, each with
  its branch, commit box and changes); click a repository to focus it (status bar, Tools → Git
  actions). Chats start at the workspace root, or in one repository (right-click it → New chat in this
  repository). Scripts of every repository show on the dashboard; the Repos view lists them all.
- **Jig's logo:** the amber corner jig (an L-shaped fence holding a square) on graphite is the app icon (installer, taskbar, window) and appears in
  the top bar's Jig menu and on the What Jig can do page, in the theme's colours.
- **Restore files and fork:** hover one of your messages → ⋯ → **Restore files to before this
  message…** shows which files Claude changed since then and puts them back (Claude Code's file
  checkpoints; Settings → Claude Code → File checkpoints). The chat's ⋯ menu → **Fork chat** continues
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

## Needs testing on your machine

Things the cloud build environment couldn't verify:

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
