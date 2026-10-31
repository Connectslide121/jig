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
**Decided by:** Jon (a long list of every repository is hard to scan; show shop while working on
shop, add elearning while integrating it, per project, reachable from the panel) and Claude, on my
own (tied to the focus repository) · **Date:** 2026-10-28

A workspace's Git list follows the **focus repository** (D-075), which is the repository you work in:
- **Picker** (`shop ▾`) at the top of the panel: switches it, or chooses **All repositories**.
- **Eye button:** shows others next to it.
- **Hide button** on a shown repository's row: takes it away again.

The extra repositories are remembered per focus repository, so going back to shop brings its set
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

### D-103 — The activity log never keeps pastes or secrets
**Decided by:** Jon (fix it now) and Claude, on my own (how) · **Date:** 2026-10-28

The activity log recorded every chat message in full, including pasted API responses whose headers
can hold tokens. Now everything recorded passes through `@jig/learning`'s sanitizer first:
- **Secrets** are masked in every event, whatever its kind: headers, bearer tokens, JWTs, known key
  formats, credentials in URLs, secret-looking names, connection strings and private keys.
- **Pasted blocks in a chat message** (6+ lines or 600+ characters) are replaced by
  `[pasted <kind>, N lines]`. The kinds are counted in `detail.pasted`, which is the signal for
  phase 18's "you paste API responses a lot" suggestions.

It is rule-based with no AI, so it can miss an unusual secret format. The log stays local, has its
"never record" list, and can be deleted at any time. Chats themselves (Claude Code's own transcripts)
are not changed: they are the conversation.

### D-104 — How projects-you-manage is built
**Decided by:** Claude, on my own (Jon trusted my judgement for phase 18) · **Date:** 2026-10-28

- **`projects.json` holds workspaces and projects.** A project's `path` is its default workspace.
  `ProjectInfo` and `AddonProject` keep describing that folder (`isGitRepo`, `repos`), so add-ons and
  every "the project's folder" use stay as they were. `focusRepo` becomes the project's default Git
  repository.
- **Two ways to make a project:**
  - "New project…" opens a dialog;
  - `projects.add {path}` (Get started, tests, quick use) adds the folder and a project named after
    it.

  Several projects can share a workspace.
- **Chats keep their folder (`cwd`) and get an optional `projectId`** that only you set, by dragging,
  the menu, or Claude with `jig_move_chat`. Removing a project moves its chats to "No project"
  instead of stopping them.
- **The project's defaults are applied when a chat is created** (model, effort, permission mode).
  Its instructions are read each time Claude Code starts for the chat, so edits apply to the next
  turn after a restart of the chat's process.
- **Repos lists workspaces, not projects** (each repository once). Clicking a repository activates
  the project whose default workspace holds it: the active one first, else the first such project.
- **The Chats list** opens the active project's group and "No project", and keeps other projects
  collapsed until clicked. With many projects the list stays short.
- **Scripts still follow the active project's default workspace for now.** Making the Scripts panel
  global (D-102) comes with arranging it (phase 18, item 5).

### D-105 — Files is a built-in add-on that follows the project
**Decided by:** Claude, on my own (Jon: its own tab on the left, chosen per project from the panel)
· **Date:** 2026-10-28

The explorer is the built-in add-on `addons/files`, like Git, Repos and Scripts (D-047). It needed no
core code beyond `useWorkspaceList()`, and the builder can change it like any add-on.
- **What it shows:** the project's default workspace, unless the picker chose another folder. The
  eye button adds folders next to it. All of this is kept per project in the add-on's storage.
- **Not changed through the project's settings:** the project's settings stay core data, and the
  view's choice belongs to the view, which is the same split as Git's shown repositories.
- **Ignored files are shown, dimmed,** as in VS Code, and the filter leaves them out.
- **No file operations** (new, rename, delete). Claude and your editor do those; the explorer is for
  finding and looking. They can be added later.

### D-106 — Editing in Preview: CodeMirror, saves guarded by the file's time
**Decided by:** Claude, on my own (Jon: always editable; ask on conflicts) · **Date:** 2026-10-28

- **CodeMirror 6, not Monaco:** it is much smaller, and its languages load on demand. Its colours are
  Jig's tokens (keywords accent, strings success, numbers warning, …), so it matches every theme
  without its own palette. It isn't the theme's exact token colours, which Shiki keeps for read-only
  code.
- **`files.write` writes only where Jig already works:** inside a workspace, or a file you opened in
  Preview. Add-on UI shares the renderer, so a write anywhere would be too much. Saves pass the time
  the file was read (`expectedMtimeMs`), so a change on disk is never overwritten silently.
- **Conflicts ask:** Keep mine / Load theirs / Show diff. The diff is a small LCS line diff
  (`shared/lineDiff.ts`), with no dependency.
- **Not done:** a warning when closing a tab with unsaved edits. Edits live in the tab, so closing
  drops them. That is the next small improvement if it bites.

### D-107 — Split view: one tab list, a right-pane list on top
**Decided by:** Claude, on my own (Jon: two panes side by side; drag to the edge or Open to the side)
· **Date:** 2026-10-29

`main.tabs` stays the single list of tabs, so opening, closing, the tab limit and every existing
caller work as before. `main.split` adds which tabs are on the right, which pane has focus, and the
other pane's active tab. `main.active` is always the focused tab, which is what features mean by
"the active tab".
- New tabs open in the focused pane, and clicking anywhere in a pane focuses it.
- A pane never stays empty: the split ends instead.
- Two panes only, side by side, as Jon chose; no grid.
- Tab bodies stay mounted across panes, so a chat keeps its state when moved.

### D-108 — Arranging lists is an add-on capability (`ArrangeList`)
**Decided by:** Claude, on my own (Jon: hide, reorder and dividers in Scripts and Pipelines, from the
panel, the same in every project) · **Date:** 2026-10-29

Instead of two one-off implementations, `@jig/sdk` has pure helpers (`arrange`, `moveKey`, …) and
`@jig/sdk/ui` has `ArrangeList`. Scripts and Pipelines use them, and any add-on (or the builder) can.
- Each panel stores its arrangements in its own storage, one per group: per folder for Scripts, per
  Azure DevOps project for Pipelines.
- A divider with nothing visible under it isn't shown.
- New items appear after the arranged ones, so nothing disappears silently.
- Scripts is now one group per workspace folder, whatever the active project (the right side is
  global, D-102).

### D-109 — Project links are project data, with types from a fixed list
**Decided by:** Claude, on my own (Jon: grouped links per project, typed with a label and an icon, set
by hand and from chats; a section below Projects and on Home) · **Date:** 2026-10-29

- **Stored on the project** (`links` in `projects.json`), so Claude's configure tools change them like
  any project setting, with Undo.
- **Types are a fixed list in Jig** (`shared/links.ts`: resource group, website, App Service,
  database, key vault, Azure DevOps repo/pipeline/board, docs, API, …). Each type has a Lucide icon and
  a label.
  - A link's own label is optional; it defaults to the Azure resource's name, the repository, or the
    host.
  - The type is guessed from the address (Azure portal resource ids, Azure DevOps paths).
- **"Add from Azure…"** asks the user's `az` in the main process (`links.azure`), like Pipelines does
  in its add-on. It lists resource groups, or a group's resources, to tick. Jig stores no tokens.
- **The Links view is core** (`jig.links`), a section below Projects (D-099), because it is project
  data. Drag links between groups; group menus rename, reorder, remove.

### D-110 — Releases: a built-in add-on driven by a release policy in the repository
**Decided by:** Claude, on my own (Jon: start versioning where there is none, adopt it where there is,
stay disciplined but quiet; projects differ — some only deploy; Jon trusted my judgement on the
open points) · **Date:** 2026-10-29

- **An add-on (`addons/releases`), not core:** it only needs public slots (a view, a tab, the status
  bar, watchers, `ai`, `openChat`), so it is also an example for the builder.
- **The policy is `.jig/release.json` in the repository**, committed, so colleagues get the same rules.
  Shape in `addons/releases/lib/policy.ts` (style planned/continuous/none, scheme, version file or
  `managedBy` tool, tag format, changelog, audiences, commit convention, cadence, environments).
- **No AI in the background.** Detection, badges, deploy checks, reminders and writing files/tags are
  plain code. Claude is used only when you start it: the setup chat (`ctx.openChat` with a drafted
  prompt that includes what detection found) and "Draft with Claude" (`ctx.ai.ask`, once per release).
  Without Claude, the version comes from the commits and the changelog from a pure draft.
- **Releasing commits only the files it changes** (version file and changelog), then an annotated tag
  whose message holds the notes; push is a switch, on by default. A tool such as GitVersion
  (`managedBy`) keeps the number: Jig never edits files then.
- **Deploys:** environments marked `manual` get a "Deployed to …" button; pipeline environments are
  watched every 5 minutes through the user's `az`. The first look at a pipeline only remembers where it
  is, so old runs never notify. A production deploy of a commit without a release warns (planned) or
  becomes the release (continuous: the next CalVer/patch tag, pushed). Deploys are logged in the
  add-on's storage for "What's live"; a running changelog file for continuous projects is not written
  (it would need a commit per deploy) — the tag messages are the log.
- **Git's Write follows `commitConvention: "conventional"`** by reading the same file.

### D-111 — Learning 2: notes from chats, friction, a profile, kinds of suggestions, check-ins
**Decided by:** Jon (the list in phase 18 item 4, D-101: Claude saves evidence without asking and shows
a card; at most one tip a week with his own examples; check-in off by default and offered once) and
Claude, on my own (the details below) · **Date:** 2026-10-29

- **Notes are a Jig tool, not a second AI call.** `jig_note_evidence` is read-only (no prompt) and
  costs nothing extra: Claude calls it during the turn. Notes live in `evidence.json`, with the
  activity log's exclusions and masking; the card's Remove deletes the note (it reuses the change card
  with an `evidence` undo).
- **The profile is a Markdown file** (`profile.md`) with fixed headings, so it reads well, diffs well and
  Claude can add bullets under a heading (`appendToSection`). The reflection proposes additions as one
  suggestion; check-ins add them through `jig_update_profile` (a card with Undo, not read-only).
- **Friction is recorded where it happens** (session manager, terminals) as activity of kind
  `friction`; the miner turns repeats into patterns like any other, so no new pipeline is needed.
  "Long chats with no commit" and "hopping between projects" came later, derived from the log
  (`derivedFriction`) rather than recorded.
- **Suggestion kinds** are a closed list with one action each. Actions that need Claude open a chat
  with a drafted first message instead of acting silently. A workflow suggestion opens the Workflows
  add-on's editor with a draft (tab `addon.workflows.workflow`, params `draft`).
- **Did it help?** is computed without AI from the activity after the suggestion was acted on (its
  patterns' rate after vs the 4 weeks before; ≤ half = helped).
- **Lines by Claude vs by hand** are matched by line-content hashes: Claude's Edit/Write calls record
  hashes (never content) per file, and only the user's own commits (`--author` = user.email) are
  measured. It is labelled an estimate everywhere and is never pushed as a notification.

### D-112 — Workflows: a built-in add-on, steps marked yours / ask me / Jig's
**Decided by:** Jon (phase 18 item 4d: stored in Jig per project, private; manual / assisted /
automated; triggers while Jig is open; Move to the cloud) and Claude, on my own (the format and run
history, open in the plan) · **Date:** 2026-10-29

- **An add-on (`addons/workflows`)**, using public slots only (a left view, a tab, actions, a
  watcher), so it is an example for the builder too.
- **Format:** JSON in the add-on's storage, `workflows:<projectId>`; runs in `runs:<workflowId>`
  (the last 20). Not a file in the repository: workflows are personal (Jon's decision). **Export as
  skill** is the way to share one (`.claude/skills/<name>/SKILL.md`).
- **Step kinds:** check, command (the platform shell in the project folder, output captured), script
  (Jig's script discovery, in a terminal), pipeline (`az pipelines run`), Claude (a new chat with the
  message, sent), wait. A check and a wait are always yours.
- **Schedules run only while Jig is open.** A workflow runs unattended only when every step is an
  automatic command or pipeline; otherwise the schedule notifies you. **Move to the cloud** asks
  Claude in a chat (a routine for judgement, a pipeline for builds), never silently.
- **Suggestions → workflows:** a "workflow" suggestion opens the editor with a draft (tab
  `addon.workflows.workflow`, `params.draft`); lines that look like commands become command steps
  ("ask me first"), others checks.

### D-113 — Sharing add-ons as zip files, installed after a trust prompt
**Decided by:** Claude, on my own (backlog: "sharing add-ons with colleagues"; Jon: add things, ask
before changing how things work) · **Date:** 2026-10-29

- **A plain `.zip`** of the add-on folder (`<id>-<version>.jig-addon.zip`), so it can go by mail,
  Teams or a shared drive. No registry or marketplace, nothing online.
- **Import shows before it installs:** name, version, description, files and permissions; nothing in
  the package runs during the import. Unsafe paths (`..`, absolute) are refused; packages over 20 MB
  are refused.
- **Imported add-ons are like your own:** in `~/.jig/addons/<id>`, recorded in the add-on history, so
  a replaced add-on can be rolled back. They run with the normal add-on process isolation; a real
  sandbox for other people's add-ons stays in the backlog.

### D-114 — A chat in its own worktree is a separate action, not an option on every chat
**Decided by:** Claude, on my own (backlog: "Git worktree per chat"; Jon: add, don't change how things
work) · **Date:** 2026-10-29

- **New chat in a worktree…** (Tools) next to New chat; normal chats are unchanged. It reuses the
  worktree helpers of "Try several ways" (`attempts/git.ts`).
- The worktree lives in `~/.jig/worktrees/<id>` on branch `jig/<name>-<id>` from the repository's
  HEAD (the project's default repository). Which chats have one is kept in `worktree-chats.json`, so
  the chat itself (SessionMeta) didn't change.
- **Apply** brings everything since the start (commits on the branch and uncommitted work) into the
  working copy as uncommitted changes, refusing when it doesn't apply cleanly — you review and commit
  as usual. **Remove** deletes the worktree and the branch; the chat stays.

### D-115 — Add-ons give Claude tools; Claude manages add-ons' data
**Decided by:** Jon (approved: Claude tools for Releases, and Claude seeing and changing any add-on's
data) and Claude, on my own (the shape below) · **Date:** 2026-10-29

- **A new slot, `claude.tool`** (manifest key `tools`): `id`, `description`, simple `params` (string,
  number, boolean, object, array; optional; enum), `readOnly`, `run` (a `host.ts` export). Tools are on
  the `jig` MCP server as `addon_<add-on>_<id>`, so they share Jig's permission handling: read-only
  ones run without asking, the rest go through Claude Code's prompt. The host function gets the
  arguments plus `chat` (`cwd`, `projectId`). Switched-off add-ons and add-ons with errors give none;
  the set is replaced when add-ons change and new chats get it (a running chat keeps its tools).
- **Releases is the first user**: overview, changes, history (read-only), release, record_deploy,
  set_policy (ask first). Without `repo` they use the chat's repository.
- **Add-on data:** `jig_get_addon` (manifest, files, README, data keys), `jig_get_addon_data`
  (read-only), `jig_set_addon_data` and `jig_delete_addon_data` (ask first, a change card with Undo:
  `ConfigUndo` `addonData`). After a change the add-on gets the event `storage`; `useHostCall`
  reloads by itself, so views follow without each add-on doing anything.
- The builder can now give an add-on Claude tools too, since it writes manifests with any slot.
- **Workflows has tools** (list, get, save, delete, run). `run` runs only Jig's automatic command and
  pipeline steps and stops at the first step that needs the user or Claude, so a chat can't skip a
  step the user marked as theirs.
- **Recommending add-ons in chats** (Jon): every chat's appended context lists the switched-on add-ons
  (one line each) and tells Claude to offer, once and briefly, a workflow for a repeated step-by-step
  request, an existing add-on that fits, or a build. No extra AI call: it's part of the chat's turn.

### D-116 — An add-on declares where its data lives: global, per project or per repository
**Decided by:** Jon (the builder should be able to limit an add-on's data to a project, a repository
or keep it global) and Claude, on my own (the shape) · **Date:** 2026-10-29

- **Manifest:** `"storage": { "scope": "global" | "project" | "repo" }`, default global. "repo" is
  the active project's default repository (else its folder).
- **One file per add-on, scope in the key** (`@project(<id>) <key>`, `@repo(<path>) <key>`), so
  exporting, history, Claude's data tools and Undo keep working unchanged.
- **The UI follows the active one automatically** (`ctx.storage`, the new `useStorage` hook); an
  add-on can still reach another scope with `{ scope, id }`. Host code is explicit, because it can't
  know which project is active.
- **The builder chooses the scope** (its instructions explain when), and Settings → Add-ons shows it.
- The built-in add-ons keep their own keys (`workflows:<projectId>`, `deploys:<path>`): moving them
  would mean migrating data for no visible gain.


### D-117 — Sweep rules: unsaved tabs, the focused pane, duplicate add-on tool names
**Decided by:** Claude, on my own (Jon asked for a sweep of improvements, cleanup and bug fixes) ·
**Date:** 2026-10-29

- **Unsaved tabs:** a tab reports unsaved work with `setTabDirty(tabId, label)`
  (`renderer/workbench/dirty.ts`). Closing it asks first, and tab eviction (the tab limit) skips it.
  Preview is the only tab that edits files today; a new editing tab uses the same call.
- **The focused pane:** tab bodies get `focused` next to `active`. `active` = showing in its pane
  (polling, "seen"); `focused` = the pane you work in, so keyboard shortcuts (Ctrl+F, a tour's arrow
  keys, the message box taking focus) go to one tab only when two panes are side by side.
- **Removing a worktree chat stops and archives the chat first**, because its folder is about to go
  (Windows can't delete a folder a running process holds, and the next message would fail).
- **Add-on tool names:** `addon_<addon>_<tool>` can collide (`a-b`+`c`, `a`+`b_c`); the first add-on
  keeps the name. Renaming every tool to a collision-free form would change names Claude and
  permission rules already know, for a case that needs two oddly named add-ons.
- **Not changed (needs Jon):** an add-on tool's `readOnly` (runs without asking) is still trusted for
  every add-on, built-in or not. Honouring it only for built-in add-ons would be safer, but it
  changes how user add-ons behave. Jon kept it for every add-on: D-128.

### D-118 — The code editor: complete, in the theme's own syntax colours, without language servers
**Decided by:** Jon (the editor should be as complete as possible, with highlighting; maybe not
autocompletion) and Claude, on my own (how) · **Date:** 2026-10-29

- **Still CodeMirror 6** (D-106), with what a good editor has: closing brackets, several cursors and
  column selection, indentation guides (`@replit/codemirror-indentation-markers`), folding, find and
  replace, go to line, toggle comment, move lines, and a status line.
- **Colours come from the theme's `tokenColors`**, the same data Shiki uses for code blocks: each
  kind of code (keyword, string, function…) is given TextMate scopes, resolved the way VS Code does
  (most specific selector wins), and mapped to CodeMirror's tags. Running Shiki inside the editor
  would match exactly, but re-tokenising with TextMate grammars on every keystroke is slow on big
  files; the mapping gets the theme's colours with CodeMirror's incremental parsers. A theme with
  almost no syntax colours falls back to Jig's tokens.
- **Indentation follows the file** (tabs or the common number of spaces); `editor.tabSize` is only for
  files without any. Line endings are kept (D-106) and shown.
- **Settings** (`editor.wordWrap`, `showWhitespace`, `closeBrackets`, `tabSize`) are ordinary settings,
  so a chat can change them too, and the status line toggles them.
- **No completion and no language servers:** the editor is for reading and fixing; Claude does the
  heavy edits, and VS Code is one click away.

### D-119 — Development requests: what the builder can't make goes to the developers by email
**Decided by:** Jon (a package with a spec, a clickable reference and a prompt, emailed with one
click to support@sprinta.se so other users can send requests) and Claude, on my own (how) ·
**Date:** 2026-10-29

- **It grows out of D-074's proposal.** `propose_extension_point` now also takes a title, a user story,
  acceptance criteria, how the tool is built as an add-on afterwards, and a mockup: one
  self-contained HTML page (no external URLs; Jig opens it in Preview, whose HTML view is sandboxed).
- **The package** (`~/.jig/dev-requests/<build>/`, zipped): README.md, SPEC.md, PROMPT.md (the spec
  inside, plus "follow AGENTS.md, add it as an extension point, tests and docs"), mockup.html,
  context.json (Jig's version, the OS, the add-ons that were on — nothing from chats or files).
- **One button opens a new email with the zip attached** (replaced by D-123: the zip is saved in
  Downloads and a plain `mailto:` email says to attach it). A `mailto:` link can't carry an attachment,
  so Jig tries, in order: classic Outlook's command line on Windows (`/m … /a`), the default mail app
  through AppleScript on macOS (Outlook or Mail), `xdg-email --attach` on Linux, an unsent `.eml`
  (`X-Unsent: 1`, which Outlook opens as a new message) and, last, a `mailto:` without the attachment
  and the zip shown in its folder. The user always sees the email and presses Send: Jig sends
  nothing by itself and stores no mail credentials.
- **The address** was first a protected setting; D-120 fixed it in the code.

### D-120 — A development request is tried and confirmed before it's sent; the address is fixed
**Decided by:** Jon (the address must not be editable, or anyone could change it; the user should try
a clickable demo, iterate and validate before sending) and Claude, on my own (how) · **Date:** 2026-10-29

- **The address is a constant** (`DEV_REQUEST_EMAIL` in `shared/devRequest.ts`), not a setting: no one
  can change it from Settings or a chat. Changing it means changing Jig's code.
- **Three steps in the Build tab:** try the demo (the mockup runs live in a sandboxed frame, never
  same-origin, so it can't reach Jig), say what to change (the builder session gets the feedback and
  calls `propose_extension_point` again: version 2, 3…), confirm with **This is what I want**.
- **Only a confirmed version can be sent.** Confirming stores a hash of the request as written; any
  revision changes it, so it must be confirmed again, and `devRequests.email` refuses otherwise.
- **The demo lives in Jig, not on claude.ai.** Publishing it as a claude.ai Artifact would put the
  user's idea online before they decide to send it; the same HTML goes in the package as
  `mockup.html` for the developers.

### D-121 — The repository keeps LF line endings on every OS
**Decided by:** Claude, on my own (a fresh Windows clone failed `npm run check`) · **Date:** 2026-10-29

- **`.gitattributes` sets `* text=auto eol=lf`** (images binary). Git for Windows defaults to
  `core.autocrlf=true`, which checked every file out with CRLF and made Biome reject all of them.
- **Unit tests don't depend on the machine's git config:** `vitest.config.ts` sets
  `core.autocrlf=false` for the git the tests spawn (`GIT_CONFIG_COUNT`), since tests compare files
  byte for byte after `git apply`. Jig itself keeps the user's setting: applying an attempt or a
  worktree chat writes line endings the way the user's own checkouts do.
- **Unit tests get 30 s** (`testTimeout`): tests that spawn git dozens of times took over 5 s on
  Windows under the full suite's load.

### D-122 — You can delete your own add-ons; built-in ones only turn off
**Decided by:** Jon (wanted Delete in Settings → Add-ons) and Claude, on my own (how) · **Date:** 2026-10-29

- **Only add-ons in `~/.jig/addons`** get a Delete button (after a confirmation). Built-in add-ons
  are part of Jig and can only be turned off; a build preview can't be deleted either.
- **Deleting is a commit** in the add-ons repository, so the add-on stays in its git history and
  nothing is lost for good.
- **Its stored data is kept** (`addon-data/<id>.json`), so importing or rebuilding it later finds the
  same data. It is small, and data is what users would least want gone by accident.
- **Deleting your copy of a built-in** brings the built-in back; the dialog says so.

### D-123 — "Email to developers" saves the package in Downloads and opens a plain email
**Decided by:** Jon (a `mailto:` link, and the package to download and attach, instead of guessing
the mail app) · **Date:** 2026-10-29 · **Replaces** D-119's list of ways to attach the zip.

- **Why:** on Windows the classic-Outlook route started Office's "install Outlook" stub on a machine
  with only the new Outlook (`OUTLOOK.EXE` is registered even when classic Outlook isn't installed),
  and the `.eml` route was registered to the same stub. Guessing the mail app was fragile everywhere.
- **Now, on every OS:** the zip is copied to the Downloads folder and shown in Explorer / Finder, and
  a `mailto:` link opens a new email to `DEV_REQUEST_EMAIL` in the default mail app. Its first line
  says to attach the zip ("[Before sending: attach … Jig saved it in your Downloads folder.]") and the
  toast in Jig says the same. You attach it and press Send; Jig still sends nothing itself.
- The Outlook command line, AppleScript, `xdg-email` and `.eml` code is removed.

### D-124 — Testing runs on a small model: the jig-tester subagent and Test something…
**Decided by:** Jon (testing in the browser on Opus is overkill; option A of the proposal: Haiku,
not a second engine or a local model) and Claude, on my own (how) · **Date:** 2026-10-29

- **Every chat with Jig's tools gets a `jig-tester` subagent** (Agent SDK `agents`): Claude's browser
  tools plus Read/Grep/Glob (it tests, it never changes code), its own test protocol, no CLAUDE.md,
  on `engine.testerModel` (default `haiku`). `jigContext` tells Claude to hand page testing to it, so
  an Opus chat keeps coding while the clicking-through runs on Haiku.
- **Tools → Test something…** (and the flask button in Claude's browser view) asks what to test and
  starts a chat on the tester model with the same protocol, on the page open in Claude's browser
  unless the request names a URL.
- **Still Claude Code only** (vision principle 1): pi or a local model were weighed and left out.
- **Builder and other special chats** keep their own tools and get no tester.

### D-125 — Pipelines shows every Azure DevOps organisation you belong to
**Decided by:** Jon (all his organisations' pipelines in the view) and Claude, on my own (how) ·
**Date:** 2026-10-29

- **The organisations come from your own `az` login:** Azure DevOps' profile API (who you are) and
  accounts API (where you're a member), through `az rest --resource <Azure DevOps>`. No token is
  stored or held by Jig; `az` does the call.
- **Default: every organisation, every project.** Settings → Pipelines turns that off, adds
  organisations by URL, and narrows an organisation to chosen projects (none chosen = all). The
  first version's single organisation and projects carry over as a listed organisation.
- **It stays cheap:** organisations and projects are asked for once an hour, pipelines every
  10 minutes, latest runs on each refresh but not for projects without pipelines, 4 `az` processes
  at a time (each starts Python). Measured with two organisations and 10 projects: about 25 s the
  first time, 6 s per refresh.
- **Runs keep their organisation** (Run…, tracking, links). Arrangements are per organisation and
  project, falling back to the earlier per-project ones.
- **e2e tests get a fake `az` that is signed out**, so no test reaches the real Azure CLI login.

### D-126 — Jig asks Claude Code whether it's signed in, and signs in with `claude auth login`
**Decided by:** Jon (signing in was confusing: after /login he was left in Claude Code with nothing
saying Jig was signed in too) and Claude, on my own (how) · **Date:** 2026-10-29

- **Sign in to Claude Code…** runs `claude auth login` (Claude Code's own sign-in, nothing else) in a
  private terminal, instead of an interactive Claude Code where you type `/login`. It ends by itself.
- **When it ends, Jig asks Claude Code** `claude auth status --json` and keeps only whether you're
  signed in and the method ("your Claude subscription"), never the email, organisation or any
  credential (vision principle 2 holds: Claude Code does the login, Jig only asks yes or no). Signed
  in → a toast and the terminal closes; not → a toast with Try again.
- **Get started shows it too** ("Signed in with your Claude subscription" / "Not signed in"), so the
  Claude Code check is only green when Jig's chats can actually run. The fake engine never asks.

### D-127 — Scripts leaves out git worktrees inside a folder
**Decided by:** Claude, on my own (Jon: "do what's best") · **Date:** 2026-10-29

- On Jon's machine 2,551 of 3,088 scripts came from about 20 worktrees of one repository, each
  repeating its scripts. Script discovery now skips a folder whose `.git` is a worktree's file
  (`gitdir: …/worktrees/<name>`, `isWorktreeGitFile`), and workspace repositories that are worktrees.
- **A worktree you add as a project of its own still shows its scripts** (the project's root is never
  skipped), so nothing is out of reach. Submodules (`gitdir: …/modules/…`) are unaffected, and the
  Git view still lists worktrees: they have changes of their own.

### D-128 — Builder-made add-ons may mark their Claude tools read-only; no separate mockup attachment
**Decided by:** Jon · **Date:** 2026-10-29

- **`readOnly` stays trusted for every add-on**, built-in or yours (D-117's open point): a tool that
  says it only reads runs without a permission prompt, also when the builder made the add-on. The
  builder already reviews with you before an add-on is accepted.
- **Development requests keep one attachment, the zip** (D-123): `mockup.html` isn't attached on its
  own; it is inside the zip, and you attach that yourself.

### D-129 — Native model defaults and desktop polish
**Decided by:** Jon (Opus planning/Sonnet execution, cheaper subagents, grouped top-bar menus, project hiding, balanced toolbar control sizes and theme selection without hover previews); Claude, on my own (implementation) · **Date:** 2026-10-29

Use Claude Code's `opusplan` with Plan mode for new chats, Sonnet as a non-forced subagent fallback and for add-on questions; keep explicit specialist choices and Haiku tester/reflection. Preserve explicit saved defaults and offer an apply-preset button. Native routing avoids a second orchestration loop; lower cost cannot guarantee unchanged quality. Show requested subagent models without misrepresenting them as confirmed runtime models. Reuse registered action groups and Menu in the top bar, existing arrangements for DevOps project hiding, and currency decimal metadata for minor-unit overage amounts. Ship a Windows ICO and matching taskbar relaunch metadata.

### D-130 — Render safe HTML inside Markdown file previews
**Decided by:** Jon (README preview shows literal HTML); Claude, on my own (implementation) · **Date:** 2026-10-29

Opt Markdown file previews into rehype-raw followed by rehype-sanitize using its GitHub-style allowlist. Preserve image sizes and alignment while retaining existing jig-file grants. Chat messages keep escaping raw HTML. This renders ordinary repository READMEs without enabling scripts or Node access.

### D-131 — Preserve the Markdown library’s table layout attributes
**Decided by:** Jon (broken README table layout); Claude, on my own (implementation) · **Date:** 2026-10-29

Keep react-markdown/remark-gfm and the existing HTML sanitizer. Forward sanitized table/cell props instead of discarding spans, widths and alignment in custom components. Tables fill the available width and retain a horizontal scroll wrapper; do not force equal-width columns on ordinary data tables.

### D-132 — Balance panel tabs and use native-style menu-bar hover switching
**Decided by:** Jon (sizes, hover switching and Azure field alignment); Claude, on my own (implementation) · **Date:** 2026-10-29

Increase panel view tabs separately from base buttons; reduce top-bar action-group labels one type step. Give the shared Menu state an optional menu-bar identity and switch on hover only when that same menu bar is already open. Align Filter/Group in Add from Azure with matching label/input stacks, preserving the rest of the dialog layout.

### D-133 — Register the Windows taskbar button after window branding
**Decided by:** Claude, on my own (Jon still sees Electron in the taskbar) · **Date:** 2026-10-29

Read-only inspection of the installed process confirms correct executable/window icons and relaunch identity, without a stale Jig pin. Defer main-window taskbar registration until ready-to-show, keep maximize/show after branding, use the executable icon resource matching the installed shortcut, and exclude hidden browser helpers. These address shell grouping/startup behavior; do not claim the taskbar report fixed until visually confirmed.

### D-134 — Keep menus for screenshots and resolve project history to repositories
**Decided by:** Jon (screenshots, workspace history, shared button sizing and clipped interval label); Claude, on my own (implementation) · **Date:** 2026-10-29

Do not dismiss shared menus on window blur; retain Escape, action and outside-click dismissal. Project history resolves the focused or only repository and otherwise offers a repository menu. Keep regular Button text at text-sm with leading-none and non-shrinking icons; panel tabs and icon-only controls stay independently sized. Give the Git fetch interval a compact select and a non-shrinking labelled control.

### D-135 — Settings pickers, font reset and automatic theme search
**Decided by:** Jon (model/font pickers, visible preset button, reset and dynamic search); Claude, on my own (implementation) · **Date:** 2026-10-29

Populate model pickers through a no-prompt SDK control request instead of a hard-coded catalogue; preserve saved custom model IDs and offer native opusplan as a policy. Make the preset a primary button and collapse detailed model precedence. Font pickers offer the bundled/system families and optional custom input with per-field Reset. Debounce Open VSX search by 500 ms with a two-character minimum and stale-response guards; Enter/Search can run immediately.

Development uses `dev.jig.workbench.development` as its Windows taskbar identity; installed builds retain `dev.jig.workbench`, matching the installer. This prevents development Electron from seeding the installed app’s taskbar group cache.

### D-136 — Keep repository rows still on hover
**Decided by:** Jon · **Date:** 2026-10-29

Use visibility for Repos row actions instead of toggling display. The controls reserve the same space before and during hover, and remain available on keyboard focus.

### D-137 — One main Jig menu
**Decided by:** Jon · **Date:** 2026-10-29

Derive the main logo/name menu’s Jig-wide actions from the registry, retain the help links, and omit the separate Jig group button. No actions are lost or duplicated manually.

### D-138 — Smaller panel-tab labels with the approved icon size
**Decided by:** Jon · **Date:** 2026-10-29

Reduce panel view-tab labels from text-base to text-sm; preserve h-7 controls and size-4 icons. This balances the label against the icon without shrinking the clickable area.

### D-139 — Clearer menu hover and keyboard selection
**Decided by:** Jon (hover is hard to see); Claude, on my own (token treatment) · **Date:** 2026-10-29

Use an accent-soft fill and inset accent outline for active shared-menu and all-tools rows. This distinguishes the row from the elevated menu surface without moving content or hard-coding a theme colour. Disabled items stay unhighlighted.

### D-140 — Smaller dropdown labels
**Decided by:** Jon · **Date:** 2026-10-29

Use text-sm instead of text-base for shared menu item text, matching the all-tools picker. Keep icon dimensions, h-7 row height and accent hover treatment.

### D-141 — .NET scripts are the launch profiles, as Visual Studio's start button
**Decided by:** Jon (Scripts like his scripts plugin) and Claude, on my own (how) · **Date:** 2026-10-30

- A `.csproj` offers its launch profiles of kind `Project` (`Properties/launchSettings.json`, read
  leniently: BOM, comments, trailing commas): `dotnet run --project X.csproj --launch-profile <name>`,
  with the profile's address as the script's `url` (for **open**). A Functions app offers
  `func start` with each profile's arguments (its `--port`), else plain `func start`.
- A web, worker or console project without profiles still gets one `dotnet run`; a class library
  gets nothing, and `dotnet watch` entries are gone. On Jon's `E:\repos` that took the list from 540
  (after D-127) to 421, and the backends listed are the ones he actually starts.

### D-142 — Scripts: a running list, real groups and a tree, like the scripts plugin
**Decided by:** Jon (the plugin's layout; groups with Start/Stop instead of dividers; he only runs
a frontend and a backend per repository) and Claude, on my own (how) · **Date:** 2026-10-30

- **Groups replace dividers** in Scripts. A group is a named set of scripts from any project
  (`<project folder>|<script id>`), global, with Start (members not running) and Stop (running ones).
  Scripts join a group from their right-click menu; a member whose script is gone shows as "(gone)"
  and leaves with a click.
- **The list is the plugin's tree:** top folder → repository → package, tagged API / npm / script,
  scripts as ▶ chips that turn into green ■ stop chips. A **Running** section on top has open (the
  launch profile's address), show terminal and Stop.
- **Hiding stays** (right-click → Hide it; the eye shows hidden ones), reusing the per-folder
  `arrangement` so scripts Jon already hid stay hidden. The drag-to-reorder arrangement is gone from
  Scripts; Pipelines and other lists keep `ArrangeList`.

### D-143 — Repos like the Git plugin: short names, a sync chip, one arrangement for all projects
**Decided by:** Jon (rows like the Git plugin; only the repository's name, not `repos/…`; group,
divide and reorder them, globally) and Claude, on my own (how) · **Date:** 2026-10-30

- A row is the repository's own folder name (parents only where two names clash), a sync chip
  (`↓n ↑m`, `n changed` or ✓; pressing it pulls, then pushes) and its branch.
- Arrange uses the shared `ArrangeList` with one global `arrangement`: hide, drag, dividers (a titled
  divider is the group), and a divider can go right above any row (also in Pipelines' Arrange).
- Loading anywhere is one centered spinner (`Spinner center`), and filter fields are a
  `SearchInput` whose magnifier sits beside the text: the Files filter's icon covered the text
  because the base `Input`'s padding won over the caller's (`cn` only joins classes).

### D-144 — "Don't ask" can be chosen in any running chat; the builder's chat opens beside the build
**Decided by:** Jon (couldn't pick Don't ask in the builder chat; wants the builder chat open by
itself) and Claude, on my own (how) · **Date:** 2026-10-30

- Claude Code refuses to switch a session to `bypassPermissions` unless it was started with
  `allowDangerouslySkipPermissions`, which Jig only set for chats *started* in that mode, so picking
  "Don't ask" later failed in every chat. Every session now starts with it allowed; it only makes
  the mode available, and a chat still starts in the mode you chose.
- Starting a build opens its Build tab and, beside it in split view, the builder's chat; the
  Builder chat button opens it there too.
- Releases' **Set up** is a real bordered button with its own hover (from Jon's builder change,
  built in).

### D-145 — A build names the add-on it changes and shows only the builder's edits
**Decided by:** Jon (couldn't tell which add-on a build was about; a one-line change showed 13 files
"added") and Claude, on my own (how) · **Date:** 2026-10-30

- The Build tab and the chat's build card say **Changes Releases** / **New add-on: Pomodoro**
  instead of "Changes an add-on" (`kindText`).
- Changing a built-in add-on copies it into the build's worktree as your own copy; that copy is now
  its own commit, kept as the job's `base`, and the files and diffs are compared with it, so only
  what the builder changed shows. Accept still brings the whole copy into your add-ons.

### D-146 — Scripts redesigned: a filter, group cards, scripts as rows
**Decided by:** Jon ("like the plugin" means its structure; redesign freely; he couldn't find the
group's start button) and Claude, on my own (how) · **Date:** 2026-10-30

- The plugin's structure stays (running, groups, folder → repository → package); the look is Jig's:
  a filter on top, a green Running box, groups as cards with a primary **Start** (or **Start the
  rest**) and **Stop**, and scripts as rows (▶/■, name, what it runs, ⋯) instead of wrapping chips.
- **Every group shows here**: groups made on a project's dashboard ("+ Group" on Home) used to live
  only there, which is likely why Jon saw no Start button; they now appear as cards too, marked as the
  project's, with the same Start and Stop.

### D-147 — Notes is a built-in add-on: per-chat notes you and Claude write
**Decided by:** Jon (the notes plugin, built in) and Claude, on my own (how) · **Date:** 2026-10-30

- The notes plugin's model: kinds (wait, where, to-do, note, link), waits and to-dos tick off, Claude
  writes them on its own for what the chat must keep in mind, never as a log.
- **Two small add-on API additions** made it possible as an add-on rather than core code: tools
  receive the calling chat's id (`chat.sessionId`), and views can follow the chat in front
  (`useActiveChat()` in `@jig/sdk/ui`).
- **Claude reads the notes with a tool** (`addon_notes_list`, described as "read before working")
  instead of in every turn's system prompt, which a Claude Code chat fixes when it starts. The
  writing tools only touch the chat's notes and run without asking.

### D-148 — Pipelines come from your repositories, like the pipelines plugin, with a Run form
**Decided by:** Jon ("structured like the one in the plugin, with the same pickers, and test checkbox
etc") and Claude, on my own (how) · **Date:** 2026-10-30

- **What's listed:** the pipelines of the Azure DevOps repositories checked out in your workspaces
  (each checkout's `origin`; a repository with worktrees once), grouped per repository; "(old) …"
  and disabled pipelines are left out. They are looked for once and kept (storage `found`); the
  header's "Find pipelines again" looks again. This replaces D-125's organisation-wide list as the
  main view; that list stays under **More pipelines in your organisations**, loaded only when
  opened, without the ones already shown (Settings → Pipelines still chooses its organisations).
- **Each pipeline:** the newest run as a chip (✓ 12m, ▶ Running 35m, ◷ Queued…), its branch, why
  (CI, manual…), who, the parameters it changed from the YAML's defaults, and its stages (skipped
  ones left out). One `az pipelines runs list` per Azure DevOps project; a finished run's stages are
  asked for once. Refreshed every 20 s while a run runs, else every minute, only while Jig is in front.
- **Run form** (a modal since D-167; first inline under the pipeline): the branch (the default first, then the checkout's and
  origin's), a picker per YAML parameter with `values`, a checkbox per boolean ("Run tests"), a text
  field otherwise, and a summary ("Runs Shop CI on develop with Deploy to: production"). Nothing is
  queued until **Queue run** is pressed; the run is then tracked and notifies when it finishes.
- **Why the checkout:** the YAML's parameters are read from the file in your checkout, so the form
  matches what you have; a pipeline outside your workspaces has no form (More pipelines runs it on a
  branch with the defaults).
- The add-on now also asks for `exec:git` and `fs:read` (the remote, the branches, the YAML).

### D-149 — Repos shows a repository's commits under its row, like the Git plugin
**Decided by:** Jon ("the git panel should show the commits somewhere, maybe in the repos panel") and
Claude, on my own (how) · **Date:** 2026-10-30

- Clicking a repository's name in Repos opens its commits under the row (it used to open the Git
  view; that is now in its ⋯ menu): the commits to pull, then the branch's latest, each marked to
  push or pushed, a commit's files and a file's diff, all inline, one repository at a time.
- Built in the Repos add-on, not by opening the Git add-on's history tab: that tab belongs to a
  project, and Repos lists repositories that may not be one.

### D-150 — Open a Claude Code chat in Jig
**Decided by:** Jon ("can we bring our claude code sessions to jig… I'm only interested in a few";
"the imported chat should go to no project") and Claude, on my own (how) · **Date:** 2026-10-30

- **Chats → Open a Claude Code chat…** lists the conversations Claude Code saved on this computer
  (its terminal, the Claude desktop app's Code tab, an IDE), newest first, with folder, branch, age
  and size, and a filter. Ones already in Jig say **In Jig** and open that chat.
- **Through Claude Code, not its files:** the Agent SDK's `listSessions` and `getSessionMessages`
  read Claude Code's own transcripts (the engine's `savedSessions` / `savedMessages`); the fake
  engine has two scripted ones.
- **Opening one** makes a chat in **No project** (Jon drags it to a project) in the conversation's
  folder, with its history rebuilt through the live chat's normalizer and reducer: what you typed,
  Claude's replies and thinking, tool calls with results; subagents' inner messages and what Claude
  Code adds to user messages (reminders, command wrappers) are left out.
- **As a copy:** its first message resumes the conversation as a branch (Claude Code's fork, like
  Jig's own Fork), so the original in the desktop app or terminal is never written to by both.
- The renderer only names a session id; the folder and title come from Claude Code's list.

### D-151 — Add-ons can tell Claude something with every message; Notes does
**Decided by:** Jon ("I want Claude to be more aware of the notes add-on, so it uses it actively")
and Claude, on my own (how) · **Date:** 2026-10-30

- **New slot `claude.context`** (`contributes.context: { run }`): host code called with `{ chat }`
  before each message of a chat; its text goes with the message inside `<jig-context>`, under the
  add-on's name, not shown in the transcript. Like the output of `!` commands, which already goes
  with the next message. A chat's system prompt is fixed when Claude Code starts, so per-turn
  context can only travel with the message.
- **Guarded:** up to 4000 characters per add-on, 3 s at most, failures left out; chats only (not the
  builder's or other kinds of session).
- **Notes uses it** like the notes plugin's every-turn prompt: the notes as they stand, and the rule
  for keeping them current without being asked. This replaces D-147's "Claude reads them with a
  tool" (the tool stays, for reading them again).

### D-152 — Usage as bars, Sync like VS Code, Repos in columns
**Decided by:** Jon (each item asked for) and Claude, on my own (how) · **Date:** 2026-10-30

- **Usage:** the status bar shows a bar per window (5-hour, week) with the share used and the time
  left, coloured like the usage plugin's footer: green, amber from 60 %, red from 85 % (it was 75 /
  90 %, which left a 69 % week green). The ring on the chat header is gone: the status bar is
  always visible.
- **Git Sync:** a Sync button with ↓/↑ counts in the Git view's header (Pull and Push moved to ⋯),
  and VS Code's full-width **Sync Changes ↓1 ↑2** / **Publish Branch** where the commit box is when
  there is nothing to commit. Sync pulls with your own pull settings, then pushes.
- **Repos rows** in fixed columns (name, changes, sync, branch) so everything lines up; no column
  labels (Jon: not needed).

### D-153 — The project dashboard has no Scripts card
**Decided by:** Jon ("remove scripts from the project dashboard, we have a new very nice scripts
panel") · **Date:** 2026-10-30

- Scripts are listed, run and grouped in the Scripts view only (D-146). The dashboard's card
  (`ScriptsPanel`, with its own group dialog) is removed; the "N running" status bar item stays.
- Groups made on the dashboard before stay in `~/.jig/scripts.json` and keep showing in the Scripts
  view as the project's, with Start and Stop.

### D-154 — HTML templates and fragments open as source
**Decided by:** Jon (an Angular template rendered as a broken page: "what the hell is this") and
Claude, on my own (how) · **Date:** 2026-10-30

- Preview renders an `.html` file only when it is a page: it has `<!doctype>`, `<html>`, `<head>`
  or `<body>`, and no template syntax. Component templates (`*.component.html`, Angular control flow
  and bindings, `{{ }}`, Vue, Jinja/Liquid, Razor) and fragments mean something only inside their
  app, so they open as Source; Preview stays one click away. Decided once per tab, when the file
  loads (`isHtmlPage`, `shared/preview.ts`).

### D-155 — Angular templates get Angular's grammar in the editor
**Decided by:** Jon (asked for better highlighting; chose CodeMirror's Angular grammar over Shiki in
the editor) and Claude, on my own (how) · **Date:** 2026-10-30

- An `.html` file that is an Angular template (`*.component.html`, or Angular control flow,
  `*ng…`, `[prop]=`, `(event)=`) opens with `@codemirror/lang-angular` (already in Jig through
  `@codemirror/language-data`): interpolation, bindings and their expressions are coloured by the
  theme like code. `{{ }}` alone doesn't decide it (Vue, Jinja).
- `lang-angular` 0.1.4 (the newest) doesn't know the control-flow blocks, so `@if`, `@else`,
  `@for`, `@empty`, `@switch`, `@case`, `@defer`, `@let`… are marked with the theme's keyword style
  by a small decorator (`editorSyntax`).
- Shiki in the editor (VS Code's exact grammars) stays an option if this isn't enough.

### D-156 — Each HTML element in a colour of its own; no Shiki in the editor
**Decided by:** Jon ("buttons have a color, divs another color, aside another, nav another… if we
can get it without the Shiki changes, revert them") and Claude, on my own (how) · **Date:** 2026-10-30

- In markup files (HTML, Angular, Vue, XML) every tag (its name and brackets) CodeMirror's grammar
  finds gets a colour by its name (FNV-1a hash), opening and closing tag alike. No fixed slots for
  common elements: Jon wanted more variety than that gave.
- The colours are a wheel of twelve hues, 30° apart, starting at the theme's tag colour, at the
  average saturation and lightness of the theme's own syntax colours (greys left out), so they
  fit dark and light themes. A theme with almost no syntax colours gets Jig's accent, info,
  success, warning and danger. Only the visible part of the file is coloured.
- Shiki (VS Code's grammars) in the editor was built and tried, then reverted: it was only wanted
  for this, and it colours whole files (about 10 ms per KB), needing a worker.

### D-157 — The logo without its tile
**Decided by:** Jon ("remove the dark bg, just have the actual icon, the orange one, so it takes up
more space… I don't want the black card or tile") · **Date:** 2026-10-30

- The app icon (installer, taskbar, window) is the amber corner jig alone on a transparent
  background, scaled to fill the image with a small margin; the graphite rounded square is gone.
  The About page's logo follows. `make-icon.mjs` writes the `.ico` with every size Windows shows
  (16–256 px), each drawn at its size.

### D-158 — Notes' tools are always loaded, and Claude checks the notes before ending a turn
**Decided by:** Jon ("the notes add-on is not being used much by Jig chats, or not at all… it should
actively use it always") and Claude, on my own (how) · **Date:** 2026-10-30

- **Why it wasn't used:** Jon's Jig chats received the notes and the rule with every message
  (D-151), but Claude Code deferred Jig's MCP tools behind its tool search: Claude saw only their
  names and had to look a tool up before writing a note, so it didn't.
- **Add-on tools can be `alwaysLoad`** (manifest; `JigTool.alwaysLoad`, passed to the SDK's `tool()`
  as `_meta['anthropic/alwaysLoad']`): always in Claude's prompt, never deferred. Each costs prompt
  space every turn, so it is for a few tools Claude must use on its own. Notes' four tools use it.
- **The per-turn rule** now also asks Claude, before it ends every turn, whether the turn started a
  wait, settled a decision, moved work to a branch or left something for later, and to write the
  note then.

### D-159 — Chats are compact by default, with a switch to Detailed
**Decided by:** Jon ("it shows too much… the same conversation in Claude Code shows a lot fewer
cards. I want a toggle, compact by default… in the chat topbar") and Claude, on my own (how) ·
**Date:** 2026-10-30

- **Compact** folds each run of steps between messages (tool calls not waiting for permission,
  thinking) into one line that says what they did, counts failures and shows what runs now; it
  opens to the cards. Messages, questions, permission prompts, plans, results, the changed-files
  bar and notices stay. **Detailed** is the previous view.
- The line reads like Claude Code's: "Ran a command · List the repos" (a single command's own
  description), "Created plan.md +253", "Edited cart.ts and total.ts +4 −1", "Received a message".
  In a chat opened from Claude Code, a subagent's hand-back ("Another Claude session sent a
  message", `<agent-message>`, `<task-notification>`) becomes such a step ("Message from
  subagent"), not a message of yours.
- One setting for all chats (`chat.view`, default `compact`), switched from every chat's top bar
  (where the usage ring was). E2E tests start in Detailed (the fixture writes it), one test covers
  Compact.

### D-160 — claude.ai connectors are off in chats by default
**Decided by:** Jon ("I get this every time I start a chat, I want to set the MCP servers globally, I
don't want any of those flagged") and Claude, on my own (how) · **Date:** 2026-10-30

- Claude Code loads the connectors of the claude.ai account (Asana, Atlassian, Box, Canva, Figma,
  HubSpot, Intercom, Linear, Microsoft 365, monday.com, Notion…) into every chat, and Jig put a
  warning card in the chat for each one that needed sign-in: eleven cards at the start of Jon's chats.
- `engine.claudeAiConnectors` (Settings → Claude Code, default **off**) sets
  `ENABLE_CLAUDEAI_MCP_SERVERS=false` for chats, so Claude Code doesn't load them and nothing is
  flagged. MCP servers from Claude Code's own settings (`~/.claude.json`, project `.mcp.json`) are
  unchanged, and a failing one is still flagged.
- Applies to new chats and to ones started again; a chat already running keeps its servers.

### D-161 — Claude's questions are asked step by step
**Decided by:** Jon ("not a big fan of this questions UI… better to have it step by step, with a
nicer UI") and Claude, on my own (how) · **Date:** 2026-10-30

- All questions used to be on one card, with options as small wrapping chips and a permanent text
  field under each. Now `QuestionCard`: one question per step, a progress strip you can click, each
  option a full-width row (circle or square, label, description, "Recommended" badge for a label
  ending in "(Recommended)"), "Something else…" opening its own field, Back / Skip / Next, and a
  single Answer at the last step that sends all answers (Claude's tool takes them together).
- Answering logic is pure and tested (`question.ts`); the fake engine has "several questions".

### D-162 — "How you worked" counts Claude Code's whole history, not only Jig's chats
**Decided by:** Jon (his week showed 138 lines by Claude and 145,533 "by hand", though he had written
no code himself) and Claude, on my own (how) · **Date:** 2026-10-30

- **Cause:** Jig only recorded the lines of Claude's Write/Edit calls in chats run inside Jig;
  everything Claude did in the terminal, the desktop app or an IDE counted as by hand.
- **Now** it also reads the conversations Claude Code saved (`Engine.savedToolUses`): the whole
  transcript and its subagents', streamed (`getSessionMessages` follows only the current thread and
  loses what a compaction folded away: 611 of 1,468 tool calls in the longest chat). Write, Edit
  and MultiEdit count per file; the long lines of commands and of any file Claude wrote count in
  every file (scripts carry code in strings). Each chat is read once per Jig run (about 11 s for
  four weeks on Jon's machine).
- **Generated files** (lock files, minified code, maps, snapshots) are left out: `package-lock.json`
  alone was 11,000 lines.
- **Limits, said on the card:** work done on another computer or with another tool leaves no
  transcript here and counts as by hand (on Jon's week: 42,638 lines by Claude, 94,463 by hand,
  most of the rest founding commits that came from elsewhere); chat time counts Jig's chats only.

### D-163 — Opening a chat makes its project the active one
**Decided by:** Jon ("if I select a chat from a project that is not the active one, the active
project should switch") and Claude, on my own (how) · **Date:** 2026-10-30

- A chat tab that comes to the front (`ChatTab`, once when focused and its chat is known) and the
  Chats list's own selection (`showProjectOf`) set the chat's project as the active one, so the
  Git panel, Files, new chats and the top bar match the chat in front. Done in the tab, not at each
  of the dozen places that open chats; the list handles a click on a chat whose tab is already open.
- Not on every change: moving the chat to another project, or choosing a project while the chat is
  open, doesn't switch back. A chat in No project changes nothing.

### D-164 — The model picker names Opus Plan Mode like the button does
**Decided by:** Jon ("it should say the nicer Opus Plan Mode in both") · **Date:** 2026-10-30

- Claude Code's model list doesn't contain the `opusplan` alias, so the picker showed the chat's
  model as a raw `opusplan` line while the button said "Opus Plan Mode". Jig now adds the aliases
  Claude Code accepts but doesn't list (`ALIASES` in `menus.ts`: Opus Plan Mode) to the list, in the
  chat's picker and the one outside chats; the raw-id line stays only for a model you typed under
  "Other model…". The fake engine's list leaves it out, as Claude Code's does.


## D-165: The running tool glows; a code block's bar sticks

- Status: accepted
- The tool Claude is running now gets `.jig-working` (global.css): a breathing accent border and glow with
  a light sweep across the row, off while it waits for you and with reduced motion. A code block's title
  bar with Copy is `sticky top-0` (the block clips with `overflow-clip`, not `overflow-hidden`, which
  would stop it sticking) and Copy is always visible.

## D-166: Pipelines finds new pipelines by itself and every pipeline gets the real Run form

- Status: accepted
- **Decided by:** Jon ("like in DevOps the form is intelligent, based on the pipeline"; no hardcoded
  favourites or forms), built by Claude. Replaces the "no form outside your workspaces" part of D-148.
- **Discovery:** the repositories' pipelines are found again after 4 minutes (was 6 hours), when the view
  is open every 5 minutes, and when **More pipelines** is opened, so a pipeline created in Azure DevOps
  joins its repository's list without a button press. A pipeline seen before keeps its repository and YAML
  file (one `az pipelines show` only for new ones); the checkout's YAML is read each time.
- **The form reads the pipeline, not a list:** the parameters come from the pipeline's YAML in Azure DevOps
  (`az devops invoke --area git --resource items`, on the branch picked in the form), so another branch's
  parameters show when you pick it, and queueing passes only parameters that exist on that branch. The
  checkout's copy is the first guess while it loads and the fallback when a branch isn't pushed.
- **More pipelines:** Run on a pipeline whose repository isn't checked out opens the same form
  (`describe` → `az pipelines show` + the YAML; branches from `az repos ref list`) instead of a
  branch prompt with the defaults (`runOther` is gone).
- The YAML is saved with `az devops invoke … --out-file` (plain text) and read from the file: on Windows az prints
  in the console code page, which broke "ö" and "·" in labels when read from its output.
- Parameters the form can't offer (`object`, `step`, `job`, `stage` and their lists) keep their YAML
  defaults, and a blank value isn't passed, so the YAML's own default applies.

## D-167: No layout shifts, a hard rule; the Run form is a modal

- Status: accepted
- **Decided by:** Jon ("i really hate layout shifts. this should be a really hard rule in all our
  sessions"). Written into `AGENTS.md` (UI rules) and the workspace `AGENTS.md`.
- Nothing on screen moves when something opens or loads: forms and pickers are modals (`Dialog`), loading
  content reserves its space. Pipelines' **Run form** (D-148, D-166) is now a modal, also while it loads.

## D-168: Working on Jig means editing its source directly

- Status: accepted
- **Decided by:** Jon ("whenever I'm working on the Jig project, I want to work on its source code").
- Coding agents in this repository, including a chat running inside Jig, change Jig's code themselves and
  don't hand it to the in-app builder. D-074 stands for the builder (it never edits Jig's source) but
  doesn't stop Jon's own agents.

## D-169: An empty profile gets an interview chat, offered with a toast

- Status: accepted
- **Decided by:** Jon ("a toast when it's empty, not spamming, whenever Jig opens; then AI asks questions
  and follow-ups and fills it out"; a chat tab is good enough). **Claude, on my own:** a normal chat
  rather than a dedicated view, once per launch, "Don't ask again", and no toast in the fake engine.
- When Jig opens and the profile has nothing under its headings (`profileIsEmpty`) and a project is
  active, a toast offers **Start the interview**, **Not now** or **Don't ask again**. The interview is a
  new chat whose first message (`profileInterviewPrompt`) tells Claude to ask one question at a time,
  follow up, and save facts with `jig_update_profile` every couple of answers. The same chat starts from
  **Fill it in with Claude** in What Jig knows about me, so it's also reachable without the toast.

## D-170: The Chats list has four groupings, and pinned chats keep your order

- Status: accepted
- **Decided by:** Jon (chats under a project looked aligned with it, wanted pinned chats reorderable and
  more ways to group). **Claude, on my own:** the four groupings, keeping the order in settings.
- The Chats header's filter button switches `chatList.view`: **By project** (default, D-102), **By
  status** (Pinned, Needs you, Working, Error, Idle), **By day** (Pinned, Today, Yesterday, Last 7 days,
  Older) or **One list**. Outside the project view each chat shows its project's square. Chats are
  indented a full step under their group header so the dot no longer lines up with the project square.
- Dragging a pinned chat onto another pinned chat puts it in front of it. The order is
  `chatList.pinnedOrder` (ids), not a field on the chat, so reordering doesn't count as activity and
  change a chat's "last updated". Pinned chats not in the list follow, newest first. Pure logic in
  `features/sessions/grouping.ts`.

### D-165 — Reinstalling keeps the user's shortcuts

Running a new installer removed Jon's taskbar pin and added a desktop shortcut. electron-builder only
keeps existing shortcuts when the installer has no folder page (`allowToChangeInstallationDirectory:
false`); otherwise it recreates the Start menu shortcut, which drops the pin. So the installer now has a
fixed folder and `createDesktopShortcut: false`; the Start menu shortcut remains. Decided by Jon;
the exact mechanism is Claude's. Verify by installing over an existing install with a pinned Jig.

## D-171: Background tasks look busy

- Status: accepted. Decided by Jon ("it looks idle"); the look is Claude's.
- While a chat's turn is Done but commands or subagents still run in the background, their row shows a
  spinner and "Working in the background", and each task chip gets `.jig-working` (the glow of D-165).

## D-172: `develop` is the default branch; Repos switches branches

- Status: accepted. Decided by Jon; the implementation is Claude's.
- Work happens on `develop`, which is the repository's default branch (`main` stays for stable code).
  Changing the default on GitHub needs repository admin rights (Settings → Branches).
- In the Repos add-on a row's branch is a dropdown that switches branches, like the Git view's (local
  branches, remote ones as tracking branches). Host methods `branches` and `switchBranch` in
  `addons/repos/host.ts`.

## D-173: Split sidebars replace "below another view"; daily views only in sidebars; Reset layout

- Status: accepted. Decided by Jon ("the side panels are too crowded", "a split sidebar slot … not
  tied to under another add-on", a button to put every view back); the model and names are Claude's.
- Each sidebar can be split: `left2` / `right2` are its lower half, with their own tabs and height.
  Width and collapsed stay with the sidebar (`columnOf`). Replaces D-099's sections (a view below
  another, in its tab): any view can go to a lower half, without a host view, by dragging its tab
there (D-174 removed the menu entries: a split is made by drag and drop only). Old
  layouts' sections move to the lower half on load; manifests' `under` is ignored.
- Only daily views start in a sidebar (Projects, Chats, Files, Git, Repos, Scripts, Pipelines,
  Browser, Notes). Views used now and then start hidden (`hidden` in a manifest, `startHidden` for
  core views): Suggestions, Links, Releases, Workflows, opened from their actions in the top bar
  menus (as main tabs since D-174). Notes stays in the sidebar because it follows the chat you're in. This applies to new placements; Reset
  layout applies it to an existing layout.
- **Reset layout** is in the top bar's layout menu (and Settings → Layout, and an action); it asks
  first, then restores the default layout, keeping open tabs.

## D-174: Fewer top bar menus; views open as main tabs; drag any view anywhere

- Status: accepted. Decided by Jon ("we have too many menus, we can probably merge some", views not in
  the sidebars "should open as a new tab in the main window", "drag and drop any window to any of the
  slots"); which groups merge and which views stay in sidebars is **Claude, on my own** (Jon: "You
  decide").
- Top bar menus: **Chats** (Chats, Claude, Workflows), **Code** (Git, Files, Terminals, Pipelines),
  **Build**, **View** (Layout, Appearance). Groups keep a heading inside the merged menu. Project
  actions are in the project switcher, Jig's in the Jig menu. Add-ons' own groups keep their own menu.
- A view that isn't in a region opens as a main tab (`jig.view`, `params.viewId`); the same view is
  never in a region and a tab at once (`normalizeLayout` closes the tab). The pure `showView` used by
  the builder and settings tools still places a view in a region.
- Drag a view's tab to any region's tab bar, a sidebar's lower part (splits it), the main area, or
  the edge target of a region that isn't showing. Splitting a sidebar is drag-only: the "Move to lower
  … sidebar" menu entries are gone.

## D-175: Named layouts; Learning also notices how you arrange views

- Status: accepted. Requested by Jon ("do everything" of the suggested improvements); the design is
  **Claude, on my own**.
- `layout.json` gains `saved`: named copies of the arrangement (regions, sizes, tabs per region; not
  the open chats). **View → Layout → Layouts** saves the current one, switches and manages them;
  Settings → Layout lists them; chats can save and use them (`layout` ops `save` / `use` in the
  builder and configure tools). Switching keeps open tabs that aren't views.
- Learning records UI habits as activity kind `"ui"` (an action run from a menu or Go to, a view
  opened as a tab, a view moved), only ids and regions, never content. The `view-habit` pattern
  suggests placing a view you keep opening or moving the same way. Keyboard shortcuts are not
  recorded (Ctrl+Tab and Mod+W would drown the signal).

## D-176: Go to (Ctrl+P): one place to jump to chats, views, actions and files

- Status: accepted. Requested by Jon; the design is **Claude, on my own**.
- **Ctrl+P / ⌘P** (and the magnifier in the top bar) opens Go to, a fixed-size overlay: chats,
  views, actions and the active project's files (searched through `files.search`). Ranking is pure
  (`workbench/quickOpen.ts`): prefix and word-start matches first, then recent use. It doesn't
  replace the Tools menu (actions only) nor the chat's `/` picker (Claude Code's commands).

## D-177: Workflows run on events: after you push, when a pipeline finishes

- Status: accepted. Requested by Jon; the design is **Claude, on my own**.
- Two new triggers beside the schedule: **After you push** (optionally one branch; seen in the
  upstream's reflog, "update by push" entries) and **When a pipeline finishes** (any result,
  succeeded or failed; through your `az`). Add-on hosts have no event subscriptions, so the
  scheduler's check (each minute) compares a mark per workflow and trigger with the last one it saw;
  the first look only remembers, so adding a trigger never fires on old events. Runs say "on an
  event" in the history.

## D-178: The chats board

- Status: accepted. Requested by Jon; the design is **Claude, on my own**.
- **Chats board** (button in the Chats view, action in the Chats menu): every chat across projects
  in columns — Needs you, Working, Unread, Errors, Recent (last 7 days, at most 30) — with a summary
  of totals and cost. Columns come from the chats' states (`features/sessions/board.ts`); it's a
  view of chats, nothing is dragged between columns.

## D-179: The add-on gallery

- Status: accepted. Requested by Jon; the design is **Claude, on my own**.
- **Add-on gallery** (Tools, Settings → Add-ons): browse add-ons from sources you add — a git
  repository over https/ssh, cloned with your own git (no prompts, `GIT_ALLOW_PROTOCOL=https:ssh`)
  into `~/.jig/cache/galleries`, or a folder. A source's add-ons are its folders with an
  `addon.json`, at the top or under `addons/`. Install / Update shows the permissions first and goes
  through the same package checks as importing a `.zip` (links aren't packed); it's committed to
  `~/.jig/addons` like any change.
- `addonGallery.sources` is a protected setting (D-077): it decides where code comes from, so chats
  can't change it; installing only works from a source in the list. There's no central catalogue:
  a team shares a repository.

## D-180: Compact pipeline cards with details in a dialog

- Status: accepted. Decided by Jon ("the card for each pipeline is too busy … let me see details in
  a modal"); what stays on the row is **Claude, on my own**.
- A pipeline is one line: name, the last run's age (the Run button and ⋯ on hover, in the same slot)
  and the state icon at the far right. Clicking it (or ⋯ → Details…) opens a dialog with the run
  (branch, reason, who, parameters, times), its stages and the open/run buttons.

## D-181: Commit messages on Haiku (a quick model for short answers)

- Status: accepted. Decided by Jon ("for the commit messages AI function, do we use haiku? We should");
  the setting's shape is **Claude, on my own**.
- New setting `engine.quickModel` (default `haiku`, Settings → Claude Code → Quick model). Add-ons ask
  for it with `ctx.ai.ask(prompt, { quick: true })`; without `quick` they get `engine.helperModel`
  (Sonnet). The Git add-on's Write (commit message) uses quick; Check before committing and reviews
  keep the helper model, because they need more judgement.

## D-182: The task queue (Tasks add-on) and add-ons that run chats

- Status: accepted. Requested by Jon ("queue multiple tasks … structured way of showing it all … maybe
  in a table … let me decide what task should start a new session", "links to the chats", "Claude
  should be able to create a list as well"); the design is **Claude, on my own**.
- A built-in add-on, **Tasks** (Chats → Task queue, opens as a main tab), not core code: you queue
  prompts; the add-on's host runs them in order, each in a new chat or continuing the chat of the task
  before it (chosen per task); Claude reports each with the `addon_tasks_report` tool (outcome done /
  partial / failed / blocked, summary, things to know, follow-ups). The table links every task to its
  chat; follow-ups go into the queue with one click. "Stop when a task fails" (on by default) pauses
  the queue after a failed, blocked or broken task. Claude can fill the queue (`addon_tasks_add`, not
  read-only, so you approve it, and it starts the queue only when you say so).
- Instructions reach the task's chat through `contributes.context` each turn while the task runs, not
  in the prompt, so the transcript shows only your prompt. The task is saved as running before its
  message is sent so the first turn already gets them.
- New host API `api.chats` (`create`, `send`, `get`; the `chat` permission, checked in the host and
  again in main): add-ons can start and follow chats. Main tells the add-on that created, sent to or
  asked about a chat when its status changes (host export `chatChanged`); this is in memory, so the
  add-on catches up with `get` (Tasks: a watcher every minute). `bypassPermissions` can't be asked
  for. `ctx.openChat({ sessionId })` opens an existing chat.
- New permission modes default to "Accept file edits" in the add dialog, so an unattended queue doesn't
  stop at every edit; commands still ask, and a task that needs you shows "Needs you" and notifies.

## D-183: Pipelines load when Jig starts; watchers can run at start

- Status: accepted. Decided by Jon ("I want the pipelines to load when jig opens, not every time the
  pipelines tab opens … refresh in the bg when the tab opens, without locking the ui"); the mechanism
  is **Claude, on my own**.
- Watchers get `atStart` (manifest): besides every interval, they run once 3 s after the add-on loads
  (so at Jig's start, without slowing it). A general hook for warming caches, not a pipelines special.
- Pipelines' `refresh` watcher (at start, every 5 minutes) finds the pipelines and their newest runs
  and saves them (`found`, `latest`). The view starts from what it showed last (in memory) or the saved
  copy, and refreshes in the background with only the header's small spinner. The full-panel spinner
  stays only for the very first time, when nothing was ever saved.
- Cost: `az pipelines runs list` once per Azure DevOps project every 5 minutes while Jig runs, even with
  the view closed; with no Azure DevOps remotes it only reads `git remote` of each checkout.

## D-184: A chat overview card, with the details in a modal

- Status: accepted. Decided by Jon ("an overview of the sessions, with how many tool calls, skills used
  etc … and a show detail button to expand it to a modal with a full detail view"; then "I want it to
  be part of the window", "a small card, not a full height sidebar", and "show how many add-ons were
  used"). How it fits is **Claude, on my own**:
  - A small card at the top right of the chat, in its own narrow column beside the transcript: part of
    the chat's layout, so it never covers what Claude says, and only as tall as its content. The
    composer originally kept the full width (superseded by D-189).
  - It counts turns, tool calls, files, skills, subagents, add-ons, MCP calls and tokens. An add-on
    counts as used when Claude calls one of its tools (`mcp__jig__addon_<id>_<tool>`, matched against
    the installed add-ons' tools) or Jig's tools for its data (`jig_get_addon_data`…, by `addonId`).
  - The numbers come from the transcript Jig already has (`chatStats()` in `shared/chatStats.ts`, pure
    and unit-tested); nothing new is recorded or asked of Claude Code.
  - On by default; the chart button in the chat's top bar, the card's × and setting `chat.overview`
    turn it off. ⋯ → Chat overview… opens the details modal directly.

## D-185: Jig learns how Claude works for you across chats

- Status: accepted. Decided by Jon ("this could also be logged as what Jig learns about how you work,
  like a global stats, to help with suggestions"). How it works is **Claude, on my own**:
  - Each recorded `session.tool` event gets `detail.chat` and, when the call used a skill, subagent,
    add-on or other MCP server, `detail.use` and `detail.name` (`toolUse()` in `shared/chatStats.ts`,
    the same rules as the chat overview; add-on tools are matched to their add-on by the add-ons
    module). Only names, never inputs, are added; the event's text stays as before (masked).
  - `usageSummary()` in `@jig/learning` (pure, tested) sums the last 4 weeks: chats, messages, tool
    calls, and each tool, skill, subagent, add-on and MCP server with its calls and number of chats.
  - Shown as "How Claude worked for you" in What Jig knows about me (IPC `learning.usage`), and given to
    the weekly reflection as a section (`usageText()`), so suggestions can point at a skill or add-on
    that fits what Claude keeps doing by hand, or one never used. No extra AI call.
  - Older events have no tags; they count as tool calls only. Nothing new leaves the machine.

## D-186: Tasks are added and shown grouped in chats

- Status: accepted. Decided by Jon ("I don't want one input field, I want one per task … or even better
  UI, group them in chats"; "the results table … could be nicer, better structured and show more
  details"). The design is **Claude, on my own**:
  - The add dialog is a list of chats, each with one field per task. A chat's first task starts a new
    chat and the others continue it (stored as each task's `newChat`, as before, so the queue and
    Claude's `addon_tasks_add` are unchanged). Menus split a chat at a task, merge a chat into the one
    before, move tasks and chats. The project is per chat; the permissions are for the whole batch.
    The list starts at a fixed height and grows with its tasks up to the window's height, then
    scrolls (Jon: "that should be its max height, not a set height"). Pasting a list
    into an empty task makes one task per item (it replaces the "each line is its own task" switch).
    The host's `add` takes `{ prompt, newChat }` items; the dialog sends one `add` per chat.
  - The results group the queue the same way (`chatGroups`: a task that starts a chat, or is in
    another project, begins a group). Each chat is a card with its link, project, time, cost and
    progress; each task row adds the summary on two lines, start time and the notes count. A bar and
    counts per status (`tally`) sit on top. The pure parts are in `lib/draft.ts` and `lib/tasks.ts`.

## D-187: Tasks take files, like the chat, and keep them

- Status: accepted. Decided by Jon ("I need to be able to paste images and attach docs in each task,
  just like we do in the chat"; "they should be easy to reach always, after done as well, from the
  results table and/or detail pages"). The design is **Claude, on my own**:
  - Add-ons get the chat's attachments: `ctx.attachments.add(files)` / `pick()` keep files through
    the new IPC method `addons.addAttachment` in `attachments/addon-<id>/` (same types, limits and
    checks as a chat's), `api.chats.send({ attachments })` sends them, and `<Attachments>` in
    `@jig/sdk/ui` shows them. Main copies the files into the chat's own folder when sending, because
    the chat reads only its own folder and is deleted with its session, while the add-on's copy stays
    with the task. An add-on deletes only its own files (`api.attachments.remove`).
  - In the Tasks add-on each task field takes pasted, dropped or picked (paperclip) files, shown under
    the field originally (Add tasks now uses D-188); Edit changes a queued task's files. A task may be only files. The files stay with the
    task (Run again sends them again) and open from a **Files** column in the results (one file opens
    directly, several from a menu), from the row's ⋯ → Files, and in the details. The host deletes
    files no task uses when the queue changes (`unusedFiles`), and those kept in a cancelled dialog.

## D-188: Compact task entry with inline files

- Status: accepted. Decided by Jon ("each task can take too much height … more compact … more inline").
  Implementation details are **Claude, on my own**: Add tasks uses fixed-height, single-line textareas
  (multiline text still works with internal scrolling). Filename chips with preview and remove actions
  sit beside the prompt in a reserved horizontal scroll area. Files cannot grow a row or shrink its
  prompt; paperclip and task menu columns stay aligned. Results and Edit keep their existing previews.

## D-189: Keep the chat input aligned with its thread

- Status: accepted. Decided by Jon ("the input area at the bottom to be aligned with the thread at
  all times"). Implementation details are **Claude, on my own**: transcript, task panels and composer
  share one column; transcript and composer use matching content padding and a reserved scrollbar
  gutter. Composer padding shares the global scrollbar-size variable, keeping its pickers unclipped.
  The overview column stays reserved while hidden, loading or empty, so its visibility never shifts
  the conversation. Its details still open in a modal.
- Jon also directed work to stay on `main`, with no new branches. The existing compact-task branch
  was merged into `main`, and `AGENTS.md` now records this workflow alongside incremental commits.

## D-190: One search, with every action in the grouped menus

- Status: accepted. Decided by Jon ("this tools dropdown should go away … we have everything in the
  menus already"). All visible core and add-on actions already feed the grouped top-bar menus;
  add-on-specific groups get their own menu. `tools.action` remains the compatible slot name, with
  updated documentation describing menus and search rather than a separate Tools destination.
- Implementation details are **Claude, on my own**: remove the wrench button and old Tools picker;
  Ctrl+K now opens the same Go to search as the magnifier and Ctrl+P. Existing registered action id
  `jig.tools` remains as a hidden compatibility shortcut, avoiding a duplicate menu/search result.
  Add-on picker anchors use the search field. Shared action grouping
  stays in `workbench/actionGroups.ts`, independently of search UI.

## D-191: Pipeline cards use the existing side divider control

- Status: accepted. Decided by Jon ("remove the one from inside the card, we already have the small
  icon button on the side"). Pipeline cards and nested project lists suppress the duplicate trailing
  Add divider/help row; their side buttons remain. The outer list keeps its footer.
- Implementation is **Claude, on my own**: shared `ArrangeList.showFooter` defaults to true; nested
  pipeline lists set it false, leaving other add-ons unchanged.

## D-192: Search stays visible in the center of the top bar

- Status: accepted. Decided by Jon ("search bar to always be visible in the center of the topbar"
  with results "dropping down from the center of the topbar").
- Implementation is **Claude, on my own**: a permanent SearchInput in the middle top-bar column
  owns the query. Go to results appear in an overlay directly below it, following its position on
  resize without changing the workbench layout. Ctrl+P/Ctrl+K focus the same field; arrows select,
  Enter opens, Escape/outside clicks close results. Clearing/closing resets the query.

## D-193: A shorter Chats list and header

- Status: accepted. Decided by Jon: ten chats per project, counting pinned chats, Show more adds ten,
  and more than ten pinned chats must all stay visible. Remove board/import icons from the header;
  keep New chat, and place view choices in a submenu in the existing ⋯ menu.
- Implementation details are **Claude, on my own**: each grouping uses the same paging rule, and
  expansion is local to each group while mounted. `chatPage` preserves all pinned chats and fills
  the remaining ten-chat budget from the existing recent order. Data and archived-chat filtering
  are unchanged. Board stays in the Chats top-bar menu and search. Import, previously only wired
  to the header button, is registered as `jig.openSavedChat` so it is available in both too.
- A generic core `ViewDef.headerMenu()` supplies view-specific entries to the sidebar and main-tab
  options menus. Chats supplies View type → By project / By status / By day / One list there.

## D-194: Give task prompts more width and move permissions to the footer

- Status: accepted. Decided by Jon: widen Add tasks, keep its hint compact and place permissions
  in the footer. Implementation details are **Claude, on my own**: shared Dialog adds `xl`
  (`max-w-6xl`), with footer controls centered vertically. Add tasks uses that width, a single-line
  hint, and footer permissions between the keyboard hint and Cancel/Add. The per-task row geometry
  and inline attachment slots stay fixed.

## D-195: Keep family aliases visible and preserve opusplan inheritance

- Status: accepted. Decided by Jon: restore Haiku/Sonnet/Opus aliases rather than versioned default
  names, and honor `opusplan` for new chats. Investigation found the defaults already held aliases;
  Claude Code discovery supplied versioned labels. The reported Opus selection came from an explicit
  project override, which the user corrected. No user settings were changed by the agent.
- Implementation is **Claude, on my own**: shared `modelName`/`modelOptions` keep family aliases first
  and their labels stable in chat/project/settings pickers. Deliberate version selections remain
  available. Existing configured aliases and project-override precedence remain intact. Tests cover
  alias labels with versioned discovery, inherited opusplan, cleared overrides and engine init reporting
  a concrete active model without replacing the selected alias.

## D-196: Repos Refresh rescans workspace membership

- Status: accepted. Decided by Jon: removed repos/worktrees should disappear on Refresh without
  restarting Jig. Implementation is **Claude, on my own**: the Repos refresh button calls the existing
  `projects.rescanRepos` API for each added workspace, then rereads its overview. It waits for any
  status reads already running before and after scanning, so a stale in-flight read cannot satisfy
  the manual refresh. Periodic/focus/status refreshes retain the inexpensive cached inventory path.
- The overview subscribes to workspace facts and repository paths, rather than project ids alone,
  so workspace-only additions and rescanned membership update the view and status bar together.
- Present repositories with genuine Git errors remain visible; no rows are hidden merely because
  they have an error, and no project/workspace registrations or arrangement preferences are deleted.

## D-197: Report model attribution without guessing

- Status: accepted. Decided by Jon: show models used by tools/subagents in the chat overview, details
  modal and Detailed chat view. Implementation is **Claude, on my own**: preserve the SDK assistant
  message's reported `model` on completed text/thinking blocks and tool calls, including parent ids.
  Normal tools are programs; their model column identifies the calling assistant. Subagent models
  come from their own child messages/calls, separately from an explicitly requested input model.
- The overview counts distinct reported models; details aggregate tool-call counts (not model API
  requests, tokens or billing), with an unattributed bucket for older/missing data. Fixed-width model
  columns and a reserved agent-model row avoid shifts as metadata arrives. Compact mode hides these
  annotations. Model details have a reserved scroll area and the modal is wider to fit columns.
