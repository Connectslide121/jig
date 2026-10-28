# Decisions

Every decision that shapes Jig, newest last. **Decided by** says who made it:

- **Jon** — decided by Jon.
- **Claude, agreed** — proposed by Claude and agreed by Jon in conversation.
- **Claude, on my own** — made by Claude while working autonomously. **These are the ones to review**;
  each says what to change if you disagree.

To change a decision, don't delete its entry: add a new one that supersedes it and mark the old one
`Superseded by D-xxx`.

---

### D-001 — Name: Jig
**Decided by:** Jon · **Date:** 2026-10-27
A jig is a custom tool you build to make a repetitive job faster and more precise, which is exactly
what the app does when it spots a pattern and builds a tool for it. Short English word, as requested.

### D-002 — Engine: Claude Code through the Claude Agent SDK, on the user's subscription
**Decided by:** Jon (requirement) / Claude, agreed (approach) · **Date:** 2026-10-27
Jon wants his Claude subscription quota, no API key or pay-as-you-go. Anthropic's docs (checked
2026-10-27): third-party apps may not offer Claude.ai login or intermediate credentials; signing in to
the **unmodified** Claude Code with your own subscription is allowed, and the Agent SDK / `claude -p`
draw from subscription limits when signed in with the plan. Therefore Jig launches the official Claude
Code (the SDK ships it), never handles credentials, has no login screen, and strips API-key variables
from the session environment by default.
Sources: code.claude.com/docs/en/legal-and-compliance; support.claude.com article 15036540.

### D-003 — Desktop shell: Electron
**Decided by:** Claude, agreed · **Date:** 2026-10-27
Jon is on Windows. Electron gives a Node host (needed by the Agent SDK, ptys, git), the most mature
Windows support and Playwright testing. Tauri means a Rust host; Electrobun is young on Windows.

### D-004 — Build in layers: layout/settings → add-on → app source
**Decided by:** Jon · **Date:** 2026-10-27
The builder always tries the lightest level first. Extension slots are the first attempt; changing
Jig's own code is the last resort. Where a level-3 change makes sense, it adds a new slot.
_Changed by D-074: the builder no longer changes Jig's code; it proposes the missing slot._

### D-005 — Consider existing add-ons before creating new ones
**Decided by:** Jon · **Date:** 2026-10-27
The builder (and the suggestion engine) must look at the existing add-ons and prefer modifying one
when that makes more sense than creating a new one.

### D-006 — Menus, not slash commands
**Decided by:** Jon · **Date:** 2026-10-27
Every capability is visible in a menu or as a button. Prompts are buttons. Plain language in chat also
works. Jig adds no slash commands of its own (Claude Code's own still work in the chat).

### D-007 — Add-ons are full React in the app, not sandboxed iframes
**Decided by:** Claude, agreed · **Date:** 2026-10-27
Full React gives native look and placement anywhere a slot allows; iframes can't change layout and feel
embedded. Safety comes from preview + accept, git history, per-add-on disable, an error boundary per
contribution, and running add-on host code in a separate process. An iframe runtime stays possible
later for add-ons written by other people.

### D-008 — Pattern detection: on demand + weekly schedule (default Monday 10:00)
**Decided by:** Jon · **Date:** 2026-10-27
No nightly AI run. A "Look for patterns now" button plus a configurable weekly run, default Monday
10:00. Recording (no AI) is continuous. A missed scheduled run happens at the next launch (Claude, on
my own: so a week is never silently skipped — change in Settings → Learning if unwanted).

### D-009 — Design system with tokens; any VS Code theme can be applied
**Decided by:** Jon (wish) / Claude, agreed (approach) · **Date:** 2026-10-27
VS Code themes are mapped onto Jig's tokens; syntax colours are used as-is via Shiki. Themes recolour;
layout, spacing and typography stay Jig's.

### D-010 — Theme sources: local VS Code installs, Open VSX, files — not the Microsoft Marketplace
**Decided by:** Claude, agreed · **Date:** 2026-10-27
The Microsoft Marketplace terms limit its use to Microsoft's products (to be re-confirmed); most themes
are also on Open VSX. Only theme JSON is extracted from a `.vsix`; nothing from an extension runs.

### D-011 — Build fresh; borrow ideas from ThinkRail, not a fork
**Decided by:** Claude, agreed · **Date:** 2026-10-27
ThinkRail (JetBrains, Apache-2.0) is built around the `pi` engine; replacing it means rewriting its core
while it changes daily. Jig is written from scratch around Claude Code, borrowing ideas (theme token
model, worktrees, token-usage checks). No ThinkRail code is copied; if code is ever copied, its
Apache-2.0 licence and NOTICE must be included.

### D-012 — npm workspaces with `legacy-peer-deps`
**Decided by:** Claude, on my own · **Date:** 2026-10-27
npm comes with Node, so nothing extra to install on Windows. npm 10's arborist crashes
(`Cannot read properties of null (reading 'edgesOut')`) resolving Vitest's `@types/node` peer range, so
`.npmrc` sets `legacy-peer-deps=true`; peer dependencies are therefore listed explicitly (e.g. the Agent
SDK's `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk`). **If you prefer pnpm or bun**, switching is
cheap now and harder later.

### D-013 — Own build scripts (esbuild + Vite), not electron-vite
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Fewer moving parts and full control over the dev loop that level-3 self-modification will drive.
Main is bundled as ESM, preload as CJS (sandboxed preloads must be CJS), renderer with Vite.

### D-014 — Dependency versions: exact, at least two weeks old; security patches excepted
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Supply-chain hygiene: fresh releases are where compromised versions show up. Exceptions are made for
security fixes: Electron 44.10.0 (certificate mitigation advisory) and zod 4.6.7 (memory exhaustion
advisory) are newer than two weeks.

### D-015 — A fake engine for development and tests
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Tests and this autonomous build never use real Claude credentials. `FakeEngine` replays scripted
events through the same `Engine` interface. Real-engine behaviour must be verified on Jon's machine
(listed in `docs/status.md` → "Needs testing on your machine").

### D-016 — Activity log as JSONL, not SQLite
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Avoids a native module (fewer Windows build problems); data volume is small (thousands of events per
week) and mining reads a few weeks at a time. Can move to `node:sqlite` later if needed.

### D-017 — Add-on host code runs in an Electron `utilityProcess`
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Agent-written host code can hang or crash; a separate process per add-on keeps the app responsive and
lets Jig kill/restart it. The host API it gets is limited by the manifest's permissions.

### D-018 — Azure DevOps and git through the user's own CLIs
**Decided by:** Claude, on my own (follows principle 3) · **Date:** 2026-10-27
Pipelines use `az pipelines` / `az devops` with the user's `az login`; git uses the `git` CLI. Jig stores
no tokens. If `az` turns out too slow for listing, the add-on can get a token from
`az account get-access-token` per call and use the REST API — still no stored secrets.

### D-019 — Git: lean multi-repo overview in Jig; GitLens via a VS Code tab
**Superseded by D-022.** · **Decided by:** Claude, agreed · **Date:** 2026-10-27
Running VS Code extensions inside Jig would mean re-implementing the VS Code API. Instead a built-in
add-on shows the user's own VS Code (`code serve-web`) in a tab, where GitLens works as usual. Jig's own
Repos view stays a cross-repo overview (status, push/pull, latest commits), which GitLens does not do.

### D-020 — Commit identity and attribution
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Commits use Jon's name and email (it is his repository) and carry no AI attribution trailers, matching
Jon's instructions in his other repositories. Change with `git config` if you prefer otherwise.

### D-021 — State in `~/.jig`, overridable with `JIG_HOME`
**Decided by:** Claude, on my own · **Date:** 2026-10-27
One folder that is easy to back up, inspect and delete. On Windows that is `C:\Users\<you>\.jig`.

### D-022 — Jig's own Git tab; no VS Code tab, no VS Code extensions
**Decided by:** Jon · **Date:** 2026-10-27
VS Code extensions (e.g. GitLens) can't run inside Jig without re-implementing the VS Code API, and
embedding VS Code (`code serve-web`) was rejected. Jig builds its own Git tab focused on what Jon uses:
commit history per branch, diffs, and clicking a commit or file to see the detail in the main window.
Rebase, graph and blame are out of scope.

### D-023 — No native menu bar; Jig's own top bar and menus
**Decided by:** Jon (raised) / Claude, on my own (details) · **Date:** 2026-10-27
Electron apps get a native File/Edit/View menu bar by default. Jig hides the OS title bar (window
controls are drawn over Jig's top bar on Windows) and removes the menu bar on Windows/Linux, so every
menu is Jig's own and themed (principle 4). On macOS a minimal application menu stays, because
Cmd+C/V/X/A/Z/Q only work through menu roles there. Copy/paste in inputs keeps working on Windows
without a menu.

### D-024 — Push to `origin/main` at the end of each phase
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Cloud sessions run in throwaway containers, so finished work is pushed so it isn't lost. Commits stay
small and coherent. Change to a branch + pull-request flow if you prefer reviewing before it lands.

### D-025 — Planning first; implementation continues in a new session
**Decided by:** Jon · **Date:** 2026-10-27
The first session finished the plan (and phase 1, which was already built when this was decided). The
next session starts from `docs/status.md` → "Continue here", with ThinkRail cloned beside Jig as
reference (`docs/reference/reference-repos.md`).

### D-026 — Theme ids and duplicates
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Ids are `jig-dark`/`jig-light`, `user:<file-slug>`, `vscode:<publisher.name>/<theme-slug>` and
`openvsx:<namespace.name>/<theme-slug>`, so a saved setting survives editor updates (the version is not in
the id). When the same extension is installed in several editors, or an editor left an old version
behind, the newest folder found first wins. Change in `apps/desktop/src/main/themes/sources.ts`.

### D-027 — Shiki with its JavaScript regex engine
**Decided by:** Claude, on my own · **Date:** 2026-10-27
No WASM to load and nothing to relax in the CSP; grammars load on demand. Shiki's Oniguruma (WASM)
engine is more exact for a few rare grammars — switch in `renderer/lib/highlight.ts` if a language
highlights wrongly.

### D-028 — Base components live in the app (`renderer/ui/`) and are re-exported to add-ons
**Decided by:** Claude, on my own · **Date:** 2026-10-27
One implementation of Button, Menu, Dialog, … used by Jig and (as `@jig/sdk/ui`, phase 6) by add-ons, so
agent-written add-ons look native and follow the tokens. Menus are global (one open at a time, opened
with `openMenu`/`contextMenu`), which makes right-click menus from add-ons trivial.

### D-029 — The Tools menu has a filter box, but stays a menu
**Decided by:** Claude, on my own · **Date:** 2026-10-27
With many add-ons the Tools menu gets long, so it has a filter box at the top. Everything is listed and
clickable before you type anything, grouped (Build, Sessions, Projects, …, then add-ons) — it is not a
command line and there are no commands to remember (D-006). `Ctrl+Shift+P`-style "command palette"
shortcuts are deliberately not bound to it.

### D-030 — One view at a time per side region, with tabs in the region header
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Stacked, resizable sections inside a sidebar are fiddly and need drag-to-resize per section. A region
shows one view; the region header has a tab per view (icon + title), right-click → move/hide. Change in
`renderer/workbench/Region.tsx` if you prefer stacked sections.

### D-031 — Main-area tabs stay mounted once opened; Settings is a single tab
**Decided by:** Claude, on my own · **Date:** 2026-10-27
So chats, terminals and diffs keep their scroll position and state when you switch tabs (hidden with
CSS, not unmounted). Tabs are only mounted when first shown, so a restored layout with many tabs starts
fast. Tab types can be `singleton` (Settings): opening it again reuses the tab.

### D-032 — Project colours are token names
**Decided by:** Claude, on my own · **Date:** 2026-10-27
A project's colour is one of `accent`, `info`, `success`, `warning`, `danger`, `muted`, so it follows
the theme (and the token rule) instead of being a fixed hex. New projects get the first unused one.

### D-033 — Keyboard shortcuts (all also in menus)
**Decided by:** Claude, on my own · **Date:** 2026-10-27
`Ctrl+,` settings, `Ctrl+B` / `Ctrl+Alt+B` / `Ctrl+J` toggle left / right / bottom, `Ctrl+W` close tab,
`Ctrl+Tab` cycle tabs, `Ctrl+Shift+I` developer tools (VS Code-like, so they feel familiar). Later phases
add `Ctrl+N` new session and ``Ctrl+` `` new terminal. Every shortcut is an action in the Tools menu.

### D-034 — Jig keeps its own follow-up queue
**Decided by:** Claude, on my own · **Date:** 2026-10-27
A message sent while Claude works waits in Jig (visible above the composer, removable) and is sent when
the turn ends, instead of being pushed into Claude Code mid-turn. Predictable, and you can take a
message back. Change in `main/sessions/manager.ts` (`send`).

### D-035 — One Claude Code process per session, started on the first message
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Restoring a layout with many chat tabs doesn't start many processes; a process starts when you send and
is resumed with Claude Code's own session id after a restart. Processes stay alive until you stop them
(session menu), archive/delete the session or quit Jig. An idle timeout can be added if memory becomes
an issue.

### D-036 — Jig caches transcripts; Claude Code stays the source of truth
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Jig stores its normalised transcript (last 3000 items) in `~/.jig/sessions/<id>.json` so sessions open
instantly with tool cards and permission history; the conversation itself is resumed from Claude Code's
own session file. Deleting a session in Jig leaves Claude Code's file alone.

### D-037 — Models offered in the menu
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Default, Opus, Sonnet, Haiku (Claude Code's aliases, so they follow new model versions) and "Other
model…" for any id. The session header shows what Claude Code actually reports.

### D-038 — An in-process activity bus
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Sessions, terminals, scripts (and later git, add-ons, project switches) publish activity to
`main/activity/bus.ts`; the activity log subscribes. Features don't know about recording, and a failing
recorder can't break them.

### D-039 — "Sign in to Claude Code" opens a private terminal with the official binary
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Jig starts Claude Code itself (`engine.claudePath`, else the binary shipped with the Agent SDK) in a Jig
terminal marked private, and you type `/login` there. The sign-in is Anthropic's own flow; nothing typed
in a private terminal is recorded, and Jig never stores or reads the result.

### D-040 — Scripts on the project dashboard; one terminal per script
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Run/Stop/Restart and groups live on the dashboard's Scripts card and the status bar; a script has at
most one terminal (running it again focuses it; a finished run is replaced) so the panel doesn't fill up.

### D-041 — Terminals are not restored after a restart
**Decided by:** Claude, on my own · **Date:** 2026-10-27
A restored terminal would be a new shell anyway (processes can't survive Jig quitting), and restarting
dev servers on launch could surprise you. Script groups make starting them again one click.

### D-042 — Add-on CSS is generated at runtime with Jig's tokens
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Jig's own stylesheet only contains classes Jig uses, so a user add-on's classes wouldn't exist. When an
add-on loads, the host runs Tailwind's compiler over its source with only the token `@theme` (never the
raw fallback colours) and serves the result as `jig-addon://<id>/ui.css`. Add-ons can use any token
utility, and themes still recolour them. (`tailwindcss` became a runtime dependency.)

### D-043 — Your copy of an add-on replaces the built-in one
**Decided by:** Claude, on my own · **Date:** 2026-10-27
A folder in `~/.jig/addons` with the same id as a built-in add-on is used instead of it. That is how
the builder "changes an existing add-on" when it is a built-in one: it copies it into your add-ons
(with history) and edits the copy; deleting your copy brings the built-in back.

### D-044 — Add-on permissions are declared and enforced by the API, not a sandbox
**Decided by:** Claude, on my own (follows D-007) · **Date:** 2026-10-27
`exec`, `exec:<name>`, `fs:read`, `fs:write`, `net`, `terminal`, `chat` are shown in Settings → Add-ons
and the builder's preview, and the host API refuses what isn't declared. Host code runs in its own
Node process and could still import Node modules directly: it is code you reviewed and accepted. A real
sandbox belongs to the backlog item for add-ons written by other people.

### D-045 — Add-ons share Jig's React, components and icons
**Decided by:** Claude, on my own · **Date:** 2026-10-27
`react`, `react-dom`, `lucide-react`, `@jig/sdk` and `@jig/sdk/ui` imports in an add-on UI are mapped to
the app's own modules; any other bare import is a build error. Add-ons stay tiny, can't bring a second
React, and look native. Icons in manifests are lucide names.

### D-046 — A new add-on view opens its region once
**Decided by:** Claude, on my own · **Date:** 2026-10-27
When a view of one of your add-ons is placed for the first time, its region expands and shows it, so a
freshly built tool is visible. After that the layout is yours (collapse it and it stays collapsed).
Built-in add-on views don't do this, so Jig's first start stays calm (Projects stays in front).

### D-047 — Built-in add-ons are self-contained folders
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Each built-in add-on keeps all its code in its own folder (Repos has its own small git runner instead
of importing the Git add-on's), so copying one into `~/.jig/addons` to change it (D-043) always works.

### D-048 — Git operations follow your git configuration
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Pull is a plain `git pull` (your `pull.rebase`/`ff` settings apply); push sets the upstream on a
branch's first push (`-u origin <branch>`); commits take the message on stdin (`-F -`) so multi-line
messages are kept; "Commit" with nothing staged stages everything first (the button says so). Discard
on an untracked file deletes it, after a confirmation.

### D-049 — Running `.cmd` programs on Windows
**Decided by:** Claude, on my own · **Date:** 2026-10-28
`az` and `code` are batch files on Windows, which can't be started without a shell. The add-on host
finds programs through PATH/PATHEXT and runs `.cmd`/`.bat` files through `cmd.exe /d /s /c` with
cross-spawn-style quoting (`main/addons/winCommand.ts`, tested). Executables still run directly.

### D-050 — The Views menu opens a view
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Top bar → layout button → Views lists every view with a check for the ones not hidden; clicking one
shows and focuses it (like VS Code's View menu). Hiding is done from the view's own `⋯` menu.

### D-051 — The Pipelines watcher only follows runs you started from Jig
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Notifying about every run in every project would be noise; runs started from Jig are checked every
minute until they finish. The view itself refreshes every 30 s while visible.

### D-052 — The builder is a normal Claude Code session you can open
**Decided by:** Claude, on my own · **Date:** 2026-10-28
A build runs as a Claude Code session of kind `builder` (hidden from the Sessions list, opened with
"Builder chat") in *Accept edits* mode inside the job's worktree, so file edits there don't prompt but
anything else (commands) asks you in that chat. You can follow it, answer its questions and nudge it.

### D-053 — Layout changes are staged as operations and applied to the current layout
**Decided by:** Claude, on my own · **Date:** 2026-10-28
A level-1 build stores operations ("move Terminals to the right"), not a snapshot, and applies them on
Accept to the layout as it is then — so rearranging things while the build waits doesn't get undone.

### D-054 — Three validation rounds, then the build fails
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Problems found by `finish` go back to the builder up to three times; after that the job fails (you can
still open its chat). Keeps a stuck builder from looping on your quota.

### D-055 — Level-2 previews are the real add-on, loaded from the worktree
**Decided by:** Claude, on my own · **Date:** 2026-10-28
While a build waits, its add-on is loaded from the worktree in place of the live one (views say
"(preview)"), so you try the real thing before accepting. Accept merges the branch into
`~/.jig/addons` (history, rollback); Discard deletes worktree and branch.

### D-056 — No AI call when nothing repeats
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Mining runs first, without AI; the Claude Code query only happens when at least one pattern passes the
thresholds. A quiet week costs no quota. Thresholds: commands 5× on 2 days, sequences 3× on 2 days,
similar prompts 3× on 2 days, over the last 28 days (`packages/learning/src/mine.ts`).

### D-057 — The first start doesn't run the weekly reflection at once
**Decided by:** Claude, on my own · **Date:** 2026-10-28
On the very first launch there is nothing recorded yet, so the first run is the next scheduled one
(Monday 10:00). After that, a missed scheduled run happens at the next launch (D-008).

### D-058 — "Not now" snoozes for 14 days; a pattern gets one suggestion
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Snoozed suggestions come back after two weeks. A pattern that already has a suggestion (new, snoozed or
built) isn't given to the next reflection again; "Never" blocks the pattern permanently.

### D-059 — Reflection uses a small model and no tools
**Decided by:** Claude, on my own · **Date:** 2026-10-28
The weekly reflection is one Claude Code request with no tools, no settings sources and `haiku` by
default (Settings → Learning → Model), so it is cheap and can't touch files.

### D-060 — Level 3 is a stage of the same build, started by an explicit button _(superseded by D-074)_
**Decided by:** Claude, on my own · **Date:** 2026-10-28
A build that needs Jig's source records a proposal (reason + plan) and waits. Only **Let the builder
change Jig's code** starts the level-3 session; it is a new builder session (with its own instructions
and tools) in a worktree of Jig's repository, but the same build job, so the history stays in one place.

### D-061 — The level-3 worktree links node_modules; dependency changes get a real install _(superseded by D-074)_
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Installing Electron and friends for every change is slow, so the worktree links the repository's
`node_modules` (junctions on Windows). When `package.json`/`package-lock.json` change, the links are
removed and the install command runs in the worktree; after Accept it runs in the repository too.

### D-062 — Safe mode turns off your own add-ons only
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Built-in add-ons (Git, Repos, Pipelines, Scripts) ship with Jig's code, so they are as trusted as the
build itself; safe mode only skips add-ons in `~/.jig/addons`. It doesn't change `addons-state.json`.

### D-063 — Accept merges into your current branch and refuses a dirty checkout _(superseded by D-074)_
**Decided by:** Claude, on my own · **Date:** 2026-10-28
The change is merged with `--no-ff` (one merge commit, easy to revert: Undo is `git revert -m 1`). If the
source repository has uncommitted changes to tracked files, Accept stops and says so instead of mixing
your work with the builder's. Jig doesn't push; that stays yours.

### D-064 — Protected paths: launcher, builder core, Claude Code start-up, AGENTS.md _(superseded by D-074)_
**Decided by:** Claude, on my own · **Date:** 2026-10-28
`apps/launcher/`, `main/builder/`, `main/selfmod/`, `main/engine/claude.ts` (credentials rules) and
`AGENTS.md`. A change touching them can only be accepted after a separate confirmation dialog listing
the files (`confirmProtected`).

### D-065 — The packaged app has no asar archive
**Decided by:** Claude, on my own · **Date:** 2026-10-28
esbuild (bundling add-ons as they load) and Tailwind (add-on CSS) read files from `node_modules`, and
the Claude Code binary and node-pty must be real files. With asar every one of them needs an unpack
rule and a path rewrite; without it the packaged app behaves like the dev build. The cost is a bigger
install folder, which is fine for a personal tool.

### D-066 — First-run checks ask tools for their version, never for their login
**Decided by:** Claude, on my own · **Date:** 2026-10-28
"Is Claude Code signed in?" could only be answered by reading its credentials or asking it about them,
which the credentials rule forbids. Get started shows that Claude Code is there (its `--version`) and
offers **Sign in to Claude Code…**; the sign-in state shows when your first session starts (Claude Code
reports `not_signed_in`). The same goes for gh and az: only versions and whether the Azure DevOps
extension is installed. Get started opens by itself only in an installed Jig (dev runs and tests don't).

### D-067 — Updates: pull + build from a clone, the GitHub release page when installed
**Decided by:** Claude, on my own · **Date:** 2026-10-28
No electron-updater and no silent updates: Jig changes itself only when you press a button. From a git
clone, **Pull, build and restart** fast-forwards, builds and restarts through the launcher (with the
previous build as fallback). An installed Jig compares with the latest GitHub release of
`Connectslide121/jig` and opens its page; downloading and running the installer stays yours.

### D-068 — The installer is unsigned and per user
**Decided by:** Claude, on my own · **Date:** 2026-10-28
There is no code-signing certificate, so SmartScreen asks once. A per-user NSIS install needs no admin
rights and keeps the app beside `%USERPROFILE%\.jig`.

### D-069 — Pane sizes live in layout.json; handles are 8px and keyboard-accessible
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Sidebar and bottom-panel sizes were already in the layout; sizes of panes inside views and tabs (the
terminal list, the Settings list, the two sides of a Git diff) now go into `layout.json` `panes` too,
so they survive restarts and the builder can see them. Every drag handle is an 8px hit area on the
border with an accent line on hover, arrow keys resize, double-click resets, and a side region can't
squeeze the main area below 320px.

### D-070 — Images reach the UI as data URLs through the host, image types only
**Decided by:** Claude, on my own · **Date:** 2026-10-28
The renderer can't read files, so `files.image` reads an image (by extension, at most 25 MB) and returns
a `data:` URL, which the UI's Content Security Policy already allows. No new protocol is needed, and
nothing but images can be read this way. Git versions of an image come from `git show <rev>:<path>`
through the add-on API, which now returns binary output as base64 (`encoding: "base64"`).

### D-071 — File icons: VS Code icon themes, defaulting to VS Code's own choice; Material isn't bundled
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Jon uses Material Icon Theme in VS Code and wants the same icons. Rather than copying one icon set,
Jig reads the VS Code icon-theme format, so any theme works (Material, Seti, Catppuccin icons…).
The default, "Same as VS Code", reads only `workbench.iconTheme` from VS Code's `settings.json` and
uses that theme from VS Code's extensions folder, so it matches without setup. Material (MIT, ~5 MB
of SVGs) isn't bundled: it's already in your VS Code, and Open VSX can install it otherwise; without
any theme Jig uses its own lucide icons.

### D-072 — Pasted screenshots go to Claude as image blocks, kept as files per session
**Decided by:** Claude, on my own · **Date:** 2026-10-28
An `@path` mention would make Claude spend a Read tool call and depends on Claude Code's prompt
parsing; image content blocks in the user message are what Claude Code itself sends for a pasted
image. The bytes are written to `~/.jig/attachments/<session>/` (not into `sessions/*.json`) so the
transcript can show them later; they are deleted with the session. Only Claude's image types (PNG,
JPEG, GIF, WebP) up to 5 MB are accepted, with a clear message otherwise.

### D-073 — Documents: PDFs go to Claude whole; Office files are sent as text Jig extracts
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Claude reads PDFs natively (Claude Code passes `document` blocks), so PDFs are sent as they are. It
doesn't read Word, Excel or PowerPoint files, so Jig extracts their text itself (`packages/documents`,
pure, no Office or Python needed): structure is kept where it matters (headings, lists, tables, one
CSV per sheet, slides with notes) and the text is marked "extracted by Jig". Images inside Office
files are not sent. Old binary formats (.doc/.xls/.ppt) are refused with "save as .docx/.xlsx/.pptx"
rather than adding a converter. Supersedes the image-only part of D-072.

### D-074 — No self-editing: the builder proposes extension points, Jon changes Jig's code
**Decided by:** Jon · **Date:** 2026-10-28
Jig's builder never edits Jig's own source. Self-editing meant rebuilding Jig after every such change,
running from a personal clone that drifts from upstream, and a risk of breaking startup — while Jon can
change the code himself whenever the slots aren't enough. When no layout change, setting or add-on can do
a request, the builder calls `propose_extension_point` and the build ends with a proposal (why, and the
smallest slot or API that would make it an add-on), which can be copied. Removed: the level-3 flow
(worktree of Jig's repo, checks, preview instance, merge, protected paths, Undo). Kept: the launcher, its
ready heartbeat, fallback and safe mode — now used by "Pull, build and restart" updates — under
Settings → Updates (`config.updates`). Supersedes D-060, D-061, D-063, D-064 and the level-3 part of
D-004.

### D-075 — Workspaces: a folder of repositories is one project, with a focus repository
**Decided by:** Jon (the workstyle) and Claude, on my own (the details) · **Date:** 2026-10-28
Jon opens his repos folder as one workspace in VS Code so he can look across repositories and see every
Git status, script and pipeline whatever he works on. Jig does the same: a project folder that isn't a
repository lists the repositories inside it — **two levels deep** (covers `repos/api` and
`repos/client-a/api`; Jon didn't say which layout he uses), not inside repositories, hidden and build
folders skipped, cached until "Look for repositories again". Chats start at the workspace root (or in
one repository from its menu). The Git view shows all repositories like VS Code's Source Control with
several repositories; one **focus repository** (set by clicking it, saved in `projects.json`) drives
the status bar and the Tools-menu Git actions, so the active project never has to change. Repositories
are not registered as projects of their own.
