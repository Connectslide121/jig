# Status

_Last updated: 2026-10-27, second session (phases 2–3)._

## Continue here (next session)

1. Clone Jig and install: `npm install` (npm reads `.npmrc`, which sets `legacy-peer-deps`).
2. Clone ThinkRail beside it for reference: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`.
   Which parts to read for which phase: `docs/reference/reference-repos.md`.
3. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`.
4. Continue the plan at the first phase that is not ✅ in `docs/plan/README.md`.
5. Run `npm run check` before every commit; tick plan items as they land.

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

## How to try it

```bash
npm install
npm run dev          # opens Jig
```

- Add a project: **Add project…** in the middle of the empty window, or the project switcher.
- Try themes: the gear (top right) → Appearance. Drop a VS Code theme `.json` into `~/.jig/themes`
  and it appears; edit it and Jig recolours as you save.
- Move a view: `⋯` in the sidebar header → Move to right sidebar.

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
- **Pipelines with your Azure DevOps** (not testable here): Settings → Pipelines → Check Azure CLI,
  enter the organisation, Load from Azure DevOps, pick projects; check the list, Run…, the browser
  links, and the notification when a run finishes. Needs `az login` and
  `az extension add --name azure-devops`.
- **Git on your real repos**: large histories (scrolling, filter), Windows paths with spaces, line
  endings in diffs, push with your credential manager (a sign-in window may appear — that is git's,
  not Jig's), Open in VS Code (needs the `code` command on PATH).
- **Add-ons on Windows**: the add-on host process (utilityProcess) starts, `api.exec("git", …)` works
  without a console window flashing, and file watching picks up saves in `%USERPROFILE%\.jig\addons`.

## Known gaps / notes

- In the cloud container Electron's binary download fails through the proxy; it was installed by
  hand. On a normal machine `npm install` downloads it.
- `docs/plan/01-app-skeleton.md` lists the bridge as `window.jig.invoke` + renderer `call()` (the
  envelope design); see its notes.
