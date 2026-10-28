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
folders skipped, cached until "Look for repositories again". _Update: Jon's repos are in subfolders,
so the default is now three levels, configurable 1–5 in Settings → Layout (`projects.repoScanDepth`)._ Chats start at the workspace root (or in
one repository from its menu). The Git view shows all repositories like VS Code's Source Control with
several repositories; one **focus repository** (set by clicking it, saved in `projects.json`) drives
the status bar and the Tools-menu Git actions, so the active project never has to change. Repositories
are not registered as projects of their own.

### D-076 — Plan usage comes from Claude Code's own /usage data, shown in the status bar and chat header
**Decided by:** Jon (always visible, built in, a hover card) and Claude, on my own (how) · **Date:** 2026-10-28
Jon wants his 5-hour and weekly limits visible at all times, built in, not in an add-on tab. Jig can't
call Anthropic's usage endpoint itself without reading the login (forbidden), so it asks Claude Code:
the Agent SDK's experimental usage call on a prompt-less Claude Code process (no message is sent, so no
limits are used), every 5 minutes, after chat turns and on Claude Code's rate-limit events. The meter
lives in the status bar (always visible) and as a ring in the chat header; both show a card on hover and
refresh on click. The SDK method is experimental: if it changes, the meter says "usage n/a" and nothing
else breaks.

### D-077 — Claude configures Jig through tools: approved, shown and undoable; some settings stay manual
**Decided by:** Jon (configure anything configurable from the chat) and Claude, on my own (how) · **Date:** 2026-10-28
Chats get tools to read and change everything already configurable: settings, themes (including
installing from Open VSX), layout, add-ons on/off, project name and colour. Changes apply at once rather
than as a builder preview, because they are small and reversible: Claude Code's permission prompt is
the OK (vision #6), and every change leaves a card in the chat with Undo (the inverse is stored with the
card, so it survives restarts). Read-only tools run without a prompt so Claude can look before it acts.
Three settings stay Settings-only — `engine.allowApiKey` (billing), `engine.claudePath` (which program
runs as Claude Code) and `updates.*` (shell commands Jig runs) — so a chat can never change billing or
make Jig run other programs.

### D-078 — "What Jig can do" is a core page with live data and generated screenshots
**Decided by:** Jon (a place that shows what Jig can do, with screenshots, a bit interactive) and
Claude, on my own (how) · **Date:** 2026-10-28
It is a core tab, not an add-on, so it is always there and can show the whole app (an add-on could not
read the other add-ons' manifests or the shortcuts). Lists that change — slots, add-ons, skills,
shortcuts — are read live, so the page doesn't go stale when slots or add-ons are added; only the
prose, the slot examples and the configure tool list are written by hand. Screenshots are produced by
an opt-in Playwright spec with the fake engine and a demo workspace, so they can be regenerated after
UI changes instead of being taken by hand. Examples act instead of just describing: "Try in a chat"
opens a chat with the text in the composer (not sent, so nothing happens without you) and build
examples open the Build dialog. Skills are found by reading only SKILL.md front matter.

### D-079 — Context window from Claude Code's /context; Compact is Claude Code's /compact; About is the welcome screen
**Decided by:** Jon (show context usage, a quick Compact button; the about page as the empty state and
always in a menu) and Claude, on my own (how) · **Date:** 2026-10-28
The context meter uses Claude Code's own `/context` data (`getContextUsage`), read after each turn, so
the number matches the CLI and includes system prompt, tools and memory files, not only messages;
Jig does not estimate tokens itself. Compact sends Claude Code's `/compact` as a message (so it queues
like one and Claude Code does the summarising; Jig adds no slash command of its own, AGENTS.md). The
button appears from 70% so it is there when it matters without crowding the header; the meter's menu
and the ⋯ menu always have it. The welcome screen is the What Jig can do page, and a "Jig" menu (the
logo at the top left) holds help, setup, updates and settings, so the page is one click away in every
state.

### D-080 — The logo is redrawn as geometry; amber is the only brand colour
**Decided by:** Jon (the logo design, keep the amber/graphite style) and Claude, on my own (how) ·
**Date:** 2026-10-28
Jon picked a generated image (a J of a bar and a hook with a gap, amber on graphite). It is redrawn as
exact shapes on a 1024 grid instead of shipping the raster: crisp at every size, in Jig's exact theme
colours (the image's orange was off), and the same shapes give the in-app SVG logo, which takes the
theme's accent and canvas colours. The window icon is set too, so Jig running from a clone shows it.
Amber stays the only brand colour; the other colours are reserved for status (docs/brand/README.md).

### D-081 — The README is the landing page, with screenshots generated from the app
**Decided by:** Jon (treat the README as the landing page, with screenshots) and Claude, on my own (how) ·
**Date:** 2026-10-28
The README sells and explains Jig first (what it is, a tour with screenshots, building tools, the slots,
credentials, install) and links to `docs/` for everything else. It reuses the screenshots generated by
`e2e/screenshots.spec.ts` (same files as the What Jig can do page), so both stay current with one
command instead of hand-made images drifting apart.

### D-082 — The logo is an abstract corner jig, not a letter
**Decided by:** Jon (no J, something abstract that fits the jig idea; picked option A) · **Date:** 2026-10-28
The J from D-080 read as "J Jig" next to the name in the top bar. Of four abstract marks Claude drew
(corner jig, rails, clamps, fence with a round piece), Jon chose the corner jig: an L-shaped fence
holding a square piece in its corner. It is the most literal picture of a jig and stays clear at 16 px;
the clamps and the round-piece variants looked like the "copy" and "profile" icons when small. The
rest of D-080 stands: geometry on a 1024 grid in Jig's own colours, amber the only brand colour.

### D-083 — AI features use Claude Code's own capabilities first
**Decided by:** Jon (add AI features; they fit the project best) and Claude, on my own (which and how) ·
**Date:** 2026-10-28
New AI features build on what Claude Code already does instead of re-implementing it: next-message
suggestions are Claude Code's prompt suggestions (nearly free, they reuse the prompt cache), restoring
files uses its file checkpoints, forking a chat uses its session fork. Where Jig asks Claude for
something itself (a commit message, a review), it goes through Claude Code too (a one-shot query or a
chat opened with a draft), never the API directly. Each feature has a visible button or menu entry, and
the ones that change behaviour have a setting (`engine.promptSuggestions`, `engine.fileCheckpoints`).

### D-084 — Add-ons can ask Claude (`ctx.ai.ask`, permission `ai`)
**Decided by:** Claude, on my own · **Date:** 2026-10-28
Add-ons get a one-shot question to Claude through Claude Code (`oneShot`: no tools, one turn), behind a
new `ai` permission that is shown before an add-on is accepted and checked again in the host. No tools
means an answer can never change anything, so the permission only costs plan usage. It makes
AI-powered tools a normal thing to build (the builder's instructions mention it), and the Git add-on
uses it first, for commit messages. Anything that needs tools or a conversation opens a chat with a
draft instead (`ctx.openChat({ draft })`), so you see and send the request yourself.

### D-085 — Protected settings hold for the builder too; `terminal.shell` is protected
**Decided by:** Claude, on my own (from a code review) · **Date:** 2026-10-28
D-077 kept billing and program-running settings out of chats, but the builder's `stage_settings` and
Accept didn't check them, so a build could switch on API-key billing or change the update command.
Both now refuse protected settings. `terminal.shell` is added to the list: it is the program every new
terminal and script runs. `engine.defaultPermissionMode` stays changeable from a chat (the change goes
through Claude Code's permission prompt and shows an Undo card).

### D-086 — One Preview tab; binary files through granted `jig-file:` folders; Mermaid bundled
**Decided by:** Jon (an md previewer and other previewers) and Claude, on my own (how) · **Date:** 2026-10-28
All formats share one tab type so every entry point (Git, chat, add-ons, links between files) opens
the same thing. Text comes over IPC. PDF, media and HTML pages need real URLs, so they come from a
`jig-file:` protocol that only serves folders a preview was opened in (the file's project, else its
folder), so a page can load its own CSS and images and nothing else. HTML runs in a sandboxed frame
that is never same-origin, with scripts off unless turned on. PDFs use Chromium's own viewer
(`plugins: true`) instead of bundling pdf.js. Mermaid (12.1.0) is a dependency because Claude writes
diagrams in it all the time; it loads only when a diagram is shown.

### D-087 — "Try several ways": parallel attempts in git worktrees, judged by Claude, applied uncommitted
**Decided by:** Jon (original AI features) and Claude, on my own (the feature and how) · **Date:** 2026-10-28
Asking for the same change several times is the cheapest way to get a better result from an agent, but
doing it by hand means juggling branches. Each attempt gets its own git worktree (real isolation; the
same mechanism the builder uses) and an angle, so the attempts differ on purpose. The judge is a
one-shot question with no tools, so it can only read the diffs. Keeping an attempt applies its diff to
the working copy uncommitted, after `git apply --check`: you review and commit as usual, and nothing is
merged or committed behind your back. Attempt chats run in *Accept edits*, since they edit Jig's copy,
not yours.

### D-088 — Tours, pre-commit checks and standups are one-shot answers; a chat becomes a tool through the builder
**Decided by:** Jon (original AI features) and Claude, on my own (which and how) · **Date:** 2026-10-28
Tours, checks and standups only read (diffs, git logs, chat titles), so they are one-shot questions
with no tools that return JSON or Markdown Jig shows in its own UI: fast, nothing changes, nothing to
approve. A tour is ordered for understanding and pinned to hunks, which is what a reviewer needs and
what a plain chat answer can't show. "Turn this chat into a tool" reuses the builder instead of a new
mechanism: Jig writes the goal from the transcript (requests, commands, changed files) and the builder
picks the shape, so a manual workflow becomes a button the way any other tool does.

### D-089 — The IPC boundary checks the sender and the arguments
**Decided by:** Claude, on my own (from the code review; Jon: "do them") · **Date:** 2026-10-28
Add-on UI code runs in the renderer and shares `window.jig`, so the host can't trust argument types
from TypeScript alone. The router now accepts calls only from Jig's own page (main frame, `jig-app://`
or the dev server) and only plain-object arguments. The methods that reach the file system, programs,
URLs, prompts or terminals have exact schemas. `app.openPath` no longer runs executables. Schemas live
in one file next to the router, so a new risky method gets one there (AGENTS.md).

### D-090 — Claude's browser is an offscreen page inside Jig
**Decided by:** Jon ("go ahead") on Claude's proposal · **Date:** 2026-10-28
Claude should check the web UI it builds itself: open the dev server, click through, take screenshots,
read the console. Jig gives it one real Chromium page, owned by the main process as a hidden offscreen
window with its own session (no Node, sandboxed, downloads and permission requests refused, only
http/https/file). Claude drives it with `jig_browser_*` tools on the `jig` MCP server, sending real
input events rather than synthetic DOM events, so pages behave as with a person; screenshots come back
as tool images and show in the chat. The user watches the same page live in the Claude's browser view
(frames only while it is visible) and can take over with mouse and keyboard. We chose this over an
external Playwright MCP server because it needs no install, the user sees what Claude does, and the
page lives in Jig's own Electron (`docs/reference/browser.md`). Hidden helper windows are excluded from
"all windows" (events, focus, quitting) through `main/appWindows.ts`.

### D-091 — The chat does everything Claude Code's terminal does
**Decided by:** Jon ("at least as good as Claude Code, all the features and more"); the details by Claude, on my own · **Date:** 2026-10-28
The chat follows Claude Code's own input and output (`docs/reference/chat.md`):
- **Input:** `/` lists Claude Code's commands and skills, `@` files, `!` shell and `#` memory. The
  `/` and `@` keys open pickers, with ↑/↓ history and Shift+Tab modes. Typing while Claude works
  queues the message; Ctrl+Enter sends it into the running turn.
- **Output:** todo checklists, plan approval, diffs, subagent progress, background tasks, MCP
  status, and rewinding the conversation.

D-006 still holds:
- Jig invents no command names. `/model`, `/mcp`, `/add-dir`, `/export`, `/clear`, `/rewind` and
  `/permissions` are Claude Code's names, mapped to Jig's menus so habits carry over.
- Every entry of the `/` picker and every input mode is also in the **+** menu or the chat ⋯ menu.

Technical choices:
- **Rewind** resumes the same Claude Code session at the last message of the turn before
  (`resumeSessionAt`, recorded on each turn's result). Rewinding to before the first message starts
  a new conversation.
- **`!` output** goes to Claude in Claude Code's own `<bash-input>/<bash-stdout>` form with the next
  message, not as a turn of its own.
- **Model list and commands** come from the running Claude Code (it starts for the chat when you
  first open them), so new models and skills appear without a Jig update.

### D-092 — Routines and artifacts go through Claude Code's own tools
**Decided by:** Jon (asked for routines and artifacts in Jig); how, by Claude, on my own · **Date:** 2026-10-28

Claude Code manages routines (`RemoteTrigger`) and artifacts (`Artifact`) with its own claude.ai
sign-in. Jig must never read or forward that login (principle 2), and must not sign in to claude.ai
itself. So it can't call those services directly or show claude.ai pages inside the app.

Instead:
- **Chats** use the tools as they are. Jig adds cards with Open Routines / Open in Jig.
- **Tabs** use `Engine.callTool`: a hidden Claude Code session limited to one tool, told to make one
  exact call. A `PreToolUse` hook and `canUseTool` both refuse anything else, and Jig reads the tool's
  raw result.
- **The cost** is a small model call (Haiku) per tab action, so tabs load on demand and cache for five
  minutes.
- **Creating and editing routines** happens in a chat, because Claude knows the service's fields and
  you approve the call.
- **Artifacts open in Jig's Preview:** from the local file Claude published, or from the page Claude
  Code reads back. **Open on claude.ai** always goes to your browser.

Rejected:
- Embedding claude.ai in a web view: it needs a claude.ai login inside Jig.
- Calling the APIs with Claude Code's stored token: it reads credentials.

### D-093 — One icon set: Lucide, for Jig and add-ons
**Decided by:** Jon (add-ons should use Jig's icons); details by Claude, on my own · **Date:** 2026-10-28
Jig's UI uses Lucide (`lucide-react`), and add-ons share the same copy, so their icons look like Jig's:
- **Manifests** name icons in Lucide's kebab case. An unknown name shows a puzzle piece, and Settings →
  Add-ons warns about it. The check runs in the UI because Lucide is bundled there, not in the main
  process.
- **`@jig/sdk/ui`** adds `Icon` and `iconByName` for names chosen at runtime.

No second icon library, so the look stays consistent and add-ons stay small.

### D-094 — A Home to start work from, and "chat" everywhere
**Decided by:** Claude, on my own (Jon asked for a UI/UX sweep: easier to reach, not everything behind
menus) · **Date:** 2026-10-28

What the sweep found, and what changed:
- **The long "What Jig can do" page was the empty main area even after you had a project.** Daily
  work starts with a chat, so with a project the main area is now a **Home**:
  - a box that starts a chat;
  - recent chats, next steps, and the dashboard widgets.

  It replaces the project dashboard's own page, so there is one place. "What Jig can do" stays the
  first-run page and is one click away.
- **Starting a chat was only Ctrl+N or a small +.** **New chat** is now a labelled button in the top
  bar, and Ctrl+K opens Tools.
- **You couldn't tell from the tabs which chat needs you.** Tabs now show status dots.
- **Small but frequent actions were behind ⋯ menus.**
  - Edit and Copy on a message show on hover.
  - After a turn, its changed files come with Review, Walk me through and Undo.
- **The UI said both "session" and "chat".** User-facing text now says "chat" (new chats are titled
  "New chat"); code and IPC names keep "session".

Kept in menus on purpose: rarely used chat actions (MCP servers, folders, export, fork, archive), and
everything in the Tools menu.

### D-095 — Claude's browser: the view opening by itself is a setting; screenshots at several sizes
**Decided by:** Jon (asked for headless use that doesn't bother him), details by Claude, on my own ·
**Date:** 2026-10-28

The page was already offscreen, but the first `jig_browser_open` opened the Claude's browser view,
which took the right sidebar. Now:
- Whether the view opens by itself is the setting `browser.showWhenUsed` (Settings → Claude Code).
  First off by default; Jon then chose **on**: once it was clear the view only shows a picture of an
  offscreen page with its own size (so a small side panel never limits Claude and nothing pops up),
  he prefers to see it, with the setting to hide it.
- `jig_browser_screenshot` takes `fullPage` (the window grows to the page's height for the capture,
  at most 8000 px) and `sizes` (phone, tablet, desktop: one image per size in one call, then the size
  goes back), so responsive checks need one tool call and never move anything on screen.

Not done: a second, separate headless engine (Playwright). Electron's offscreen page is already a full
Chromium, shares the live view and needs nothing installed.

### D-096 — Model and permission mode live in the message box
**Decided by:** Jon (the header wrapped them and they configure the AI, so they belong with the input)
· **Date:** 2026-10-28

The model/effort and permission-mode menus moved from the chat header into the bottom row of the
message box, after the +, attach and "try several ways" buttons and before Send. The text area now
spans the full width above that row. The header keeps the title, status, context, usage, find and ⋯.

### D-097 — The Git view refreshes the repository that changed, from file watchers
**Decided by:** Claude, on my own (Jon: as close to real time as possible, without costing much with
many repositories in a workspace) · **Date:** 2026-10-28

Before, every Git view ran `git status` on every repository every 5 s while Jig was visible, besides
watching `.git`. With 30 repositories that is 6 `git status` a second, all the time. Now:
- **What is watched:**
  - **The working folder** on Windows and macOS. One recursive `fs.watch` uses one system handle
    there (ReadDirectoryChangesW / FSEvents), whatever the size of the repository. `node_modules` is
    left out.
  - **The git folder:** HEAD, the index and refs.
- **What a change refreshes:** only that repository (`changed {cwd}` → `status` for that one), at
  most once a second during a burst (a build writing files). Edits show within about 0.3 s.
- **Polling is only a safety net:**
  - every 60 s where the working folders are watched;
  - on Linux, where a recursive watch means one inotify watch per folder, it isn't used. There the
    check runs every 5 s for one repository, and for a workspace 1 s per repository, up to 30 s.

  Focus still refreshes (a workspace at most every 10 s).
- **Shared watches:** they are counted per repository and closed when the last view of it goes.

### D-098 — Git: what we took from VS Code, and what we didn't
**Decided by:** Claude, on my own (Jon: "do everything that you think is an improvement" after
comparing with VS Code) · **Date:** 2026-10-28

VS Code's Git extension works like D-097: file watchers and a debounced `git status` per repository,
with no polling of files. We added what it has and we lacked:
- **One `git status` at a time per repository.** A call while one runs waits for one more run after
  it, shared by every caller meanwhile (`singleFlight`). Bursts in a big repository never pile up git
  processes, and the answer is never older than the call.
- **Fetch in the background, on by default** (Settings → Git: every 3–60 minutes, default 5).
  VS Code asks first; we turn it on because the fetch can't interrupt you:
  - no prompts or login windows (`GCM_INTERACTIVE=never`, no askpass, no terminal prompt);
  - one repository at a time, oldest fetch first;
  - it reads only (refs), and never pulls or changes your working copy.
- **Long change lists capped** at 500 files per group with "Show all", like VS Code's
  `git.statusLimit`. The view stays fast when a folder is missing from `.gitignore`; group actions
  still cover every file.

Not taken:
- **Watching folders on Linux.** Node's recursive watch there adds an inotify watch per folder and
  can't leave `node_modules` out; doing it well needs our own walker that reads `.gitignore`. Jon uses
  Windows, so Linux keeps the polling fallback (backlog).
- **Dropping the 60 s safety net.** It costs one `git status` per repository per minute and covers
  what watchers miss (network drives, some sync tools).
- **Turning on git's `core.fsmonitor`.** That is the user's git configuration; Jig uses it when it's
  set.

### D-099 — A view can sit below another as a collapsible section
**Decided by:** Jon (Repos at the bottom of the Git panel, expandable and collapsible, like GitLens in
VS Code's Source Control) and Claude, on my own (made general) · **Date:** 2026-10-28

Rather than merging the Repos add-on into Git, the layout learned sections. Any view can be shown
below another view in its tab:
- The layout has `sections` (host → views) and `closedSections`. Each section has a header that
  collapses it and a height you drag.
- A view's ⋯ menu has **Show below…**, and a section's has **Move to its own tab**.
- An add-on asks for it in its manifest with `"under": "<view id>"`. Repos does, below Git.
- Claude and the builder can do it too (layout op `below`).

Repos stays its own add-on, so it can still be turned off, changed by the builder, or put back in a
tab. Sections are one level deep.

### D-100 — Git in a workspace lists the repository you work in, plus the ones you choose
**Decided by:** Jon (a long list of every repository is hard to scan; show podium while working on
podium, add elearning while integrating it, per project, reachable from the panel) and Claude, on my
own (tied to the focus repository) · **Date:** 2026-10-28

A workspace's Git list follows the **focus repository** (D-075), which is the repository you work in:
- **Picker** (`podium ▾`) at the top of the panel: switches it, or chooses **All repositories**.
- **Eye button:** shows others next to it.
- **Hide button** on a shown repository's row: takes it away again.

The extra repositories are remembered per focus repository, so going back to podium brings its set
back, and they are stored per project in the Git add-on's storage. Only the listed repositories are
watched and checked, which also makes a big workspace cheaper. Every repository is still visible at a
glance in the Repos section below.

A new workspace with no focus repository lists all. Clicking a repository there focuses it (status bar,
Git actions) and keeps listing all; only the picker narrows the list.

### D-101 — Answers for phase 18 (Jon's list)
**Decided by:** Jon · **Date:** 2026-10-28

Settled before building:
- **Files:**
  - its own tab in the left sidebar;
  - what it shows is chosen per project from the panel, like Git: a default folder plus others,
    with the picker and eye button.
- **Editing:**
  - Preview's code and text files are always editable;
  - if the file changes on disk while you have unsaved edits, Jig asks: Keep mine / Load theirs /
    Show diff.
- **Projects:**
  - managed by you, not folders;
  - one default workspace each, and a new chat can start in any;
  - per project: model, effort and permission mode, project instructions (appended), starter prompts;
  - Git, Files and Home follow the active project, and the Chats list shows all projects grouped;
  - chats without a project go in a "No project" group;
  - no migration, since Jig had never been used.
- **Learning 2:**
  - Claude saves evidence on its own and shows a card with Remove;
  - the check-in is off by default and offered once;
  - at most one coaching tip a week.
- **Workflows:**
  - stored in Jig, per project;
  - steps are marked manual, auto or ask me;
  - triggers run while Jig is open, and "Move to the cloud" turns a workflow into a routine or an Azure
    DevOps pipeline.
- **Scripts and Pipelines:** hide, reorder and dividers from the panel, the same for every project.

### D-102 — Left follows the active project, right is global
**Decided by:** Jon · **Date:** 2026-10-28

A guideline for the redone projects (phase 18), not a hard rule. It gives where things go a meaning,
and exceptions are fine when they make sense:
- **Left panel follows the active project:** Git, Files and Home.
- **Right panel is global:** Scripts, Pipelines, Suggestions, Claude's browser.

Details:
- **Chats** shows the active project's chats first (pinned on top), then the other projects grouped
  below, still draggable. This replaces "every project, grouped" from D-101.
- **Repos** stays below Git on the left and stays global, the one exception.
- **A view keeps its behaviour wherever you move it.** The guideline decides only where views start.
  New views, add-ons included, lean on it: project-scoped views usually start on the left, global
  ones on the right, unless something else makes more sense.
