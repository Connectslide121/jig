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
- While a step runs, the line names the running tool ("· Bash", "· Read"), not its command, and the
  whole line glows (Jon, 2026-11-01: "the command is not so relevant"); the spinner and the chevron
  share one fixed slot, so the text never moves.
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

## D-198: JSON opens as source

- Status: accepted. Decided by Jon: JSON files should open in Source rather than Preview.
  Implementation is **Claude, on my own**: initialize the mode from the path before the file loads,
  covering all JSON-classified extensions without a tree flash. Preview remains available manually.

## D-199: Save regular chats only after a prompt is sent

- Status: accepted. Decided by Jon: empty chats should not persist. Implementation is **Claude,
  on my own**: ordinary new sessions carry optional `SessionMeta.draft`, stay in memory and open
  tabs, and stay out of Chats, the board and search until a nonempty text/attachment message is sent.
  Saving the first prompt also saves its already-open tab. Layout writes omit draft/missing chat tabs;
  startup prunes them. Draft discovery/settings changes and shutdown never create session files.
- Legacy regular sessions without prompts, queue, turns or meaningful assistant/tool history are
  ignored on load, without deleting their files. Imported conversations, forks and builder sessions
  retain their existing persistence. Existing chats are never discarded just because a rewind empties
  them: new persisted sessions explicitly carry `draft: false`.

## D-200: Stable slot cards and shared interaction motion

- Status: accepted. Decided by Jon: one extension-slot card per row, animated expansion/collapse,
  and shared motion for panel toggles and modals. This explicitly authorizes those disclosures;
  forms/pickers and asynchronous loading still follow the no-layout-shift rule.
- Implementation is **Claude, on my own**: independent slot disclosures keep the clicked header in
  place; the shared `Collapse` animates grid height/opacity. Shared menus and dialogs enter with a
  short fade/transform. Dialog close controls, Escape, backdrop and footer buttons using the same
  close callback animate before invoking it; mounted dialogs also retain content on `open=false`.
  Parents that immediately unmount on successful actions still own that lifecycle.
- Workbench regions animate explicit collapsed-state toggles, not drag resizing or add-on loading.
  About screenshots reserve their intrinsic dimensions before loading to prevent unrelated shifts.
  Duration is 160 ms; reduced-motion preferences disable these animations. Closing content is
  removed after the transition, and collapsed disclosure content cannot receive focus.

## D-201: More room for repository branch names

- Status: accepted. Decided by Jon: remove the branch chevron and move branch names left without
  widening the sidebar. Implementation is **Claude, on my own**: give the branch column one third
  of the row rather than one quarter and remove its trailing chevron. The branch icon, full-name
  tooltip and branch-switch menu remain. Fixed status columns and row height remain aligned.

## D-202: Project notes hold project knowledge, shared across chats

- Status: accepted. Decided by Jon: replace per-chat notes with per-project notes; existing chat
  notes may go away. Notes describe the project, not current tasks, to-dos or progress.
  Dependencies such as deferring pipeline improvements until a tooling migration belong here.
- Supersedes D-147's chat scope and D-158's per-turn capture check. Claude receives project notes
  each turn and always-loaded tools, with explicit guidance to retain only important facts useful
  beyond the task/chat. Open dependencies affect only the work they describe.
- Implementation is **Claude, on my own**: use declared project storage, key `notes`; ignore old
  `chat:*` keys without migration or deletion. Remove Where/To-do kinds. Use active-project UI,
  caller-project tools/context, serialized mutations and project-specific change events. New
  placement is left; saved placement remains. Forms are modal and stale project loads are ignored.

## D-203: Busy buttons retain readable foreground and stable size

- Status: accepted. Decided by Jon: fix the barely visible loading spinner in the pipeline run
  modal and shared buttons. Implementation is **Claude, on my own**: busy buttons retain full
  opacity while disabled, and their spinner inherits the variant foreground instead of muted text.
  Reserve one fixed icon slot when `busy` is supplied; expose `aria-busy`. Ordinary disabled buttons
  retain their dimmed appearance. Standalone panel spinners keep their muted foreground.

## D-204: One whole-chat file summary fixed above the input

- Status: accepted. Decided by Jon: the per-turn file cards are cluttered and ambiguous. Show one
  whole-chat file count and line totals inline with Walk me through and Undo above the
  input; keep it stationary while scrolling. File details belong in a modal breakdown.
- Implementation is **Claude, on my own**: reserve a fixed-height row from the empty chat onward,
  with horizontal overflow at narrow widths. Use the overview's shared `chatStats` for unique files,
  edit counts and accumulated captured +/− hunks, including subagents. Exclude running/failed calls.
  A modal snapshot keeps the list stationary while work continues, with fixed numeric columns and
  full paths opening Preview. Counts describe recorded chat history, not net uncommitted Git changes;
  shell-only edits may be absent. Restoring files leaves history; transcript rewind changes totals.
- Undo covers the whole chat using its first message's checkpoint, disabled when unavailable or
  while working; the existing dry-run preview and confirmation remain. Jon also removed Review
  because it only opened Git. Walk me through retains the existing affected-repository tour. Supersedes D-094's
  per-turn changed-files bar.

- Jon confirmed keeping **Undo changes** and its label after discussing committed/pushed work:
  checkpoint restoration changes local file contents only. A new commit can record the reversal,
  leaving earlier commits and pushed history intact. The confirmation makes this scope explicit,
  including the possibility of replacing later edits; it is not a selective Git revert.

## D-205: Curated native skills with global and project controls

- Status: accepted. Decided by Jon: ship useful design, UX, frontend, backend, performance,
  security and AI feature skills; one topbar-accessible library with global switches, project
  inclusion selection and modal details. All skills start enabled. AI features should include a
  short disclosure/accuracy notice as a useful default, without claiming compliance.
- Implementation is **Claude, on my own**: nine skill-only native plugins; four pinned upstream
  snapshots with references/licences and five Jig-authored skills. Curate and update deliberately;
  no background downloads, imported hooks or executable helpers. Existing personal/project skills
  remain independent. Use a searchable checkbox modal for projects, with new projects included
  by default; a global off switch preserves the exclusions. Details show provenance and instructions.
- Selection uses the calling chat's project, and changes resume an existing conversation with new
  plugins before its next message, without interrupting work. Builder chats use global defaults;
  their tool/instruction boundary remains. Short no-tools helpers do not load the library.
- A short AI product-disclosure rule is appended when AI feature UX is enabled, with deeper
  guidance in that skill. It applies to products being built, not every chat response. Generic
  warnings are not an EU AI Act compliance claim; feature-specific legal assessment uses current
  official sources. Future skill work must respect project conventions and user instructions.

## D-206: Correct pipeline Unicode and show execution duration

- Status: accepted. Decided by Jon: fix replacement characters in the Run field and show run
  duration. Implementation is **Claude, on my own**: force Python UTF-8 output for az subprocesses
  at the pipeline add-on boundary, preserving the actual data instead of replacing broken glyphs.
  Existing cached text is replaced by correctly decoded metadata on refresh.
- Duration uses start-to-finish time for completed runs and elapsed execution time for active
  runs, excluding queue time. Missing timestamps are reported honestly. Active values tick each
  second; timestamp rows reserve their positions as a run finishes. The existing badge still
  shows finish age (or queued/running age), with an explanatory tooltip.

## D-207: Opus by default, code searches on a small model, usage per model

- Status: accepted. Decided by Jon: new chats use Opus (not `opusplan`, which uses Opus only in
  Plan mode and Sonnet for all other work, including every tool call); helpers and tests stay on
  smaller models; simple searches should go to a cheaper model automatically; the chat details
  show how much each model was used. Replaces the `opusplan` default of D-195.
- Implementation is **Claude, on my own**: a `jig-search` subagent (Read/Grep/Glob only, no
  CLAUDE.md) on `engine.searchModel` (Haiku; empty turns it off), registered like `jig-tester`
  through the SDK's `agents`, with a system-prompt line asking the chat to delegate searches to it
  instead of searching itself or using Explore. Claude Code's built-in Explore inherits the chat's
  model (capped at Opus), so it doesn't save anything on an Opus chat. Delegation is Claude's
  choice, not enforced: overriding Explore's model with a hook was rejected as hidden rerouting.
- Per-model use: messages and tool calls counted from the transcript, tokens and cost from the
  result's `modelUsage` (Claude Code's running totals, subagents included), merged by short model
  name. The opusplan picker description now says "Opus only in Plan mode, Sonnet otherwise".

## D-208: Speech with local Whisper and the system's voices

- Status: accepted. Asked for by Jon: "I would like to be able to talk to the AI". How is
  **Claude, on my own**.
- Dictation: Whisper runs on the user's machine (transformers.js on WebAssembly, in a renderer Web
  Worker), so no audio leaves it and nothing new needs credentials. Rejected: Chromium's Web Speech
  recognition (doesn't work in Electron: it needs Google's keys); Claude Code's `/voice` (uses
  claude.ai, which Jig must not call); cloud speech APIs (keys, cost, audio leaves the machine);
  native Whisper binaries (one per OS to build and sign).
- The model (`speech.model`, default `base`, q8) is downloaded once, after asking, by the main
  process into `~/.jig/models` and served to the worker over the privileged `jig-speech:` scheme
  (only Jig's three models; a complete model never goes online again; missing optional files are
  404). Not bundled: it would add 45–250 MB to every install for a feature not everyone uses.
  Single-threaded WebAssembly (no cross-origin isolation); the ONNX runtime (~27 MB) is bundled.
- Recording uses `MediaRecorder`; text goes in at the caret and is never sent by itself. Mic button
  in the composer and Ctrl/Cmd+Shift+Space (a shortcut, not a command: D-091); Esc cancels.
  macOS gets `NSMicrophoneUsageDescription`.
- Reading aloud uses the system's voices (`speechSynthesis`) on demand per answer; code blocks are
  skipped.
- Tests: with `JIG_ENGINE=fake` Chromium's fake microphone and a fake transcriber.


## D-209: Real-time speech and talking with Claude

- Status: accepted. Asked for by Jon: "as real time as possible" (he has a strong PC) and "talk to
  the AI real time, it answers me in a speech live conversation, and when we agree to the task and
  it's all clear, it starts working". How is **Claude, on my own** (he was asleep).
- Speed: Whisper runs on the graphics card with WebGPU when there is an adapter (`speech.gpu`,
  default on): fp32 encoder (q8 encoders are slow or wrong on WebGPU) and q4 decoder; else
  WebAssembly with q8. The variants have different files, so the model store tracks which are
  complete. Warm-up on one second of silence so the first words aren't slow.
- Live text: the microphone is read with Web Audio at 16 kHz (no more `MediaRecorder` + decode);
  Whisper reads the current piece again every ~250 ms and the composer replaces the dictated span.
  Pieces longer than 20 s are cut at their quietest moment and their text kept, so each pass stays
  short. Rejected: true streaming Whisper (not in transformers.js); a cloud recogniser (D-208).
- Talking with Claude is a renderer loop on a normal chat, not a new engine: voice activity
  detection (adaptive noise floor) ends a turn after `speech.pause` ms; the text is sent through the
  composer; Claude's text is read with the system's voices sentence by sentence while it streams;
  talking over it (a higher threshold while it speaks, since system speech isn't echo-cancelled)
  stops it. Rejected: realtime speech-to-speech models (another AI runtime and the Anthropic API,
  against "Claude Code is the only engine").
- "Agree, then work" uses Claude Code's own plan mode: starting a conversation switches an idle
  chat to plan mode; Claude presents ExitPlanMode; "yes, go ahead" approves it as the plan card
  does (`acceptEdits`, or bypass if the chat had it), anything else denies it with what you said as
  feedback. Other permissions: yes/no by voice. The chat's `voice` flag adds `VOICE_GUIDANCE` to each
  turn's context (short spoken answers, one question at a time, plan via ExitPlanMode).
- Reachable from a button in the composer and the + menu (no command: D-091). Tests: in fake mode
  the conversation hears `jig-fake-speech` window events instead of the microphone.

## D-210: A talking window, and talking ends when Claude starts working

- Status: accepted. Asked for by Jon: a dedicated interface over the chat with sound waves and the
  sentence being said, Claude searching the code while planning, the go-ahead starting the work
  and turning speech off, a sound while Claude works ("not only when it starts, but during the
  work"), "bye" not stopping the chat or Claude's work, and controls (close, go ahead, see the
  transcript). How is **Claude, on my own** (Jon: "you decide, I trust you").
- A modal `Dialog` of a fixed size (no layout shift): waves, status, then tabs Now / Conversation /
  Plan in one fixed box, and the controls in the footer. Closing it (Esc, ×, End talking) ends
  talking only. Rejected: a strip over the composer (no room for the history and the plan); an
  inline expanding transcript (layout shift).
- Waves are drawn on a canvas from the token colours. Your wave follows the microphone (each
  128 ms frame split in 8 levels, played back in 16 ms steps, log scale). The system's voices give
  no audio to measure, so Claude's wave pulses on each spoken word (`onboundary`). Rejected: neural
  voices to get real audio (later idea in phase 21).
- Talking is for planning; work happens in the normal chat. The go-ahead approves the pending
  ExitPlanMode (as the plan card does), or — when no plan is shown yet — sends "Go ahead" and
  approves the ExitPlanMode that follows (`VOICE_GUIDANCE` tells Claude to present it right away).
  Then talking ends (`voice` off) and Jig follows the chat with sounds. Only explicit phrases count
  as the go-ahead (`isGoAhead`: "go ahead", "start working", "let's do it"…); a plain "yes" may just
  answer Claude's question, so it approves only a plan already shown.
- Sounds are synthesized with Web Audio (soft sine plucks, no files): a note every 2.4 s while the
  chat works (and while Claude thinks during talking, after 1.5 s), a rising chime when it is done,
  a falling one when it needs you. `speech.workSound` (default on) turns them off.
- "Bye" (and End talking) never interrupts Claude: when it is working, Jig follows it with the
  sounds; the chat goes back to the permission mode it had before talking once it is idle (Jig put
  it in plan mode). "Stop"/"no" while Claude works still interrupts it (D-209).

## D-211: Queueing a pipeline run doesn't hold the Run form open

- Status: accepted. Asked for by Jon: "queue run loading state should be a toast, not lock me with
  the modal". How is **Claude, on my own**.
- **Queue run** closes the form at once and shows a "Queueing …" toast that stays until `az` answers;
  it is then replaced by "… queued" (success) or "Couldn't run …" (danger). Rejected: a busy button
  in the modal (the previous behaviour, which blocked the app for the seconds `az` takes).
- For this, the add-on SDK's `ctx.notify` takes an optional `timeout` and returns a function that
  closes the toast (backward compatible: it returned nothing before).

## D-212: Add tasks: taller prompts, files in a fixed box beside them

- Status: accepted. Asked for by Jon: the attachment slot was tiny and scrolled sideways ("really bad
  ux"), the prompt should be taller (2-3 rows) without each task taking a huge height, and files
  should be compact but visible. The layout is **Claude, on my own**.
- Each task row is a 3-row prompt; beside it a fixed box (the prompt's height) lists files one per
  line, and past 3 shows 2 and a "+N more" line whose menu opens or removes the rest. Empty, the box
  is a dashed drop zone that attaches on click. The paperclip and ⋯ stack at the right. Nothing
  scrolls and attaching never changes the row's size (no layout shift). Rejected: chips wrapping
  under the prompt (rows would grow and move what's below); a scrolling list (hides files).

## D-213: Suggestions review how you work, and prefer what you already have

- Status: accepted. Asked for by Jon: suggestions focused on repetition and almost always on building a
  new tool; they should also look at bad practices and security, suggest add-ons he already has, tips
  on prompting and ways to use Jig that save time. "Go and enhance it even further." The details are
  **Claude, on my own**.
- **Practice patterns** (`packages/learning/src/review.ts`, no AI): secrets in messages or commands
  (the masked `«secret»`), downloads piped into a shell, certificate checks off, `chmod 777`, skipped
  permission checks, `sudo` package installs (security), force pushes without `--force-with-lease`,
  `--no-verify`, pushes straight to main, and 5+ commits on 2+ days with no tests run by anyone. They
  are patterns of kind `practice` (security ones score highest), so "Never" blocks them as usual.
- **The reflection gets more to judge by:** an overview of the activity per kind, a sample of recent
  messages (masked, pastes collapsed, at most 20, 6 per day, 240 characters), Jig's own features with
  action ids (`main/learning/features.ts`), and per add-on how much it was used in 4 weeks (actions,
  tabs, Claude's calls; `addonUsage`) with its action ids in the catalog.
- **A review also runs when nothing repeats**, once there are 30+ events on 3+ days
  (`enoughToReview`). Below that, still no AI call. This uses the same one small query a week.
- **Instructions, in order:** safety and good practice, then what they already have, then how they
  work with Claude, then repeated work, and a new tool last. At most one tool to build per review
  (also enforced when parsing).
- **New kinds**, each with its action: `practice` (Fix it with Claude → a chat), `use-addon` (Switch
  it on when off, else Show me → runs the add-on action, `addonId` required) and `use-feature` (Show
  me → runs the Jig action). "Show me" falls back to Got it when the action doesn't exist.
- Rejected: recording more kinds of activity (Jon: more data wouldn't make suggestions more
  meaningful; how it is processed matters); a second AI pass (quota); hard-coding the "What Jig can do"
  page's JSX into the prompt (renderer-only; a short curated list in main is kept beside it instead).

## D-214: Suggestions coach how you work with Claude

- Status: accepted. Asked for by Jon: D-213 leaned on security; it should look more broadly at ways
  of working and help people prompt better. His example (colleagues asking for a function, then an
  endpoint, then a service, one message at a time) is one case, not the target: "should be a coach,
  not only looking for that specific improvement". The details are **Claude, on my own**.
- **The coaching is Claude's**, from reading the chats; it names the one change that would help most,
  whatever it is, with the user's messages as evidence. The instructions list examples of what to look
  at (clarity, context, how much work is handed over, how to check it's done, planning, reacting when
  Claude goes wrong, reusing explanations, parallel work, small commits), not rules.
- **Habit hints** (`packages/learning/src/habits.ts`, no AI, nothing new recorded): from messages
  and Claude's tools grouped by chat, asking for a feature piece by piece, mostly one-off short asks,
  and big changes (15+ edits) without a plan. Kind `habit`; only starting points for the coach. Friction already covered corrections,
  interrupts, long chats and project hopping, so those weren't duplicated.
- **The reflection sees how you prompt:** numbers (`promptStats`) and the 10 most recent chats message
  by message (`chatSample`, replacing the flat message sample of D-213), so it can see a whole
  sequence and rewrite it.
- **Instructions:** how they work with Claude comes first; security is first only for a real problem
  with evidence; suggestions are spread over different angles.
- **Prompting tips carry `before`, `example` and `changes`**: their own message(s) as sent, the same
  request rewritten the better way, and each difference with why it's better. **Compare prompts**
  opens a dialog with both side by side, why theirs fell short and what's better (Jon: "show both
  side by side and explain the differences"); **Try this prompt** there opens a new chat with it as
  the draft. Habit tips get **Show me** when
  they name a Jig action.
- **One prompting tip and one habit tip a week** instead of one tip in total (still none without
  evidence from their own messages or activity).
- **The reflection knows what can be built** (`BUILDABLE` in `reflect.ts`, built from the SDK's
  `SLOTS` so it stays in sync): Jon asked whether Claude is told what add-ons it can build; only the
  builder was. Now a "Build it" idea is checked against it, uses the lowest level, and its goal says
  where it appears and what it uses. Jon: an add-on is "like building new full features or modules
  of Jig", so it's told to think big (a whole area of work brought into Jig) and size it to the need.
- Rejected: judging message quality with a second AI pass or per message (quota; the weekly query
  sees the chats); recording chat outcomes or more data (D-213); counting repeated permission approvals
  (not recorded; Jig's permission rules already offer "always allow").

## D-215: Add-ons get toast buttons, notifications, badges, Jig events, live output, search and each other

- Status: accepted. Asked for by Jon: add-ons should be able to show toasts, and "think of what other
  things might be good to support for addons to use… Do all of them". The list and the details are
  **Claude, on my own**.
- **Toast buttons:** `notify({ actions })`. In the UI a button runs a function; from host code it is an
  `AddonTarget` (`{ view }`, `{ tab, params }`, `{ run, args }`, `{ url }`, `{ file }`) because functions
  can't cross processes. Up to 3. One shape is used for toasts and search results, opened by
  `openAddonTarget` in the renderer.
- **System notifications:** `notify({ system: true })` also shows an OS notification, only when no Jig
  window is focused and desktop notifications are on (same rule as chats); the toast then stays until
  closed, so it's still there when you come back.
- **View badges:** `setBadge(viewId, value)` for the add-on's own views only, kept in main (so host
  watchers can set them) and drawn over the view's icon in sidebars and tabs, so nothing moves. Numbers
  above 99 show `99+`, text is cut to 4 characters. Cleared when the add-on is turned off.
- **Jig events** (`jig.event` slot, `contributes.events`, `ctx.onJigEvent`/`useJigEvent`): chat
  finished / needs you / failed (from the same status changes as chat notifications, chats only),
  commits and branch switches (watching each project repository's `.git` folder, so commits made
  outside Jig count; up to 50 repositories), and another active project. Host handlers run with no
  view open. A small fixed list in `packages/sdk/src/events.ts` rather than everything, so each event
  has a stable, documented payload.
- **Live output and file watching:** `api.spawn` (streams stdout/stderr, stdin, kill; same `exec`
  permission as `api.exec`) and `api.fs.watch` (`fs:read`, debounced, `node_modules`/`.git` ignored).
  Both stop when the add-on reloads.
- **Add-ons calling each other:** a manifest's top-level `exports` lists host methods others may call
  (`api.addons.call` / `ctx.addons.call`); everything else stays private. Checked in main.
- **Search providers** (`search.provider` slot, `contributes.search`): results in Go to (Ctrl+P),
  after files, one group per provider; 1.5 s and 8 results each, results are checked so a bad one is
  dropped. Debounced 200 ms.
- **What Claude knows:** the builder prompt lists all of it; the weekly review's `BUILDABLE` says what
  add-ons can do now (from the SDK's `SLOTS`, so new slots show up by themselves), and the add-on
  catalog it and the builder read has each add-on's purpose (the README's first paragraph) plus its
  events, search and shared methods, so suggestions know what each add-on is for.
- **The builder's check** now also fails when addon.json names a host function host.ts doesn't export.
- Rejected: arbitrary event names or a general event bus (unstable contracts); letting add-ons badge
  other add-ons' or Jig's views; OS notifications while Jig is in front (the toast is enough).

## D-216: Call the built-in browser Browser

- Accepted, Jon: rename the visible "Claude's browser" feature to "Browser".
- The view, open action, empty state, accessibility label, settings and feature descriptions use
  Browser. Keep the existing view/action ids, tool names and saved settings so layouts keep working.

## D-217: Global Teams meetings through Azure Communication Services

- Accepted, Jon: join Teams through Jig's own meeting room, with live named captions instead of
  recording/reprocessing or desktop-caption scraping. Azure calling charges accepted; provision in
  Sprinta Intern. A meeting spans products and must never belong to the active Jig project.
- **Claude, on my own:** a built-in Meetings add-on launches a dedicated first-party media window via
  ctx.meetings.open(). Host owns authentication, Graph, storage, lifecycle and media permission checks;
  the official Calling SDK owns media in the sandboxed renderer. Switching views/projects cannot
  unmount it. Closing offers keep-running/leave; reload/crash/restart marks an interrupted transcript.
- Public single-tenant desktop Entra registration, browser loopback sign-in, memory-only MSAL and
  calling credentials; AzureCliCredential uses the user's own az login for keyless identity exchange.
  Resource keys and client secrets are not retrieved. Only the owned media window receives calling
  credentials. Calendar consent is independent so join-by-link still works when calendar is blocked.
  Connection settings affect billing/authentication and are edited explicitly in Connection, not by AI.
- Captions carry provider speaker ids/names, original words, timestamps and partial/final markers.
  Serialized atomic global text writes, no raw audio/video, explicit capture status/gaps, no full-file
  processing. Participant disclosure is required at pre-join. Activity publishes action ids only.
- Ask Claude snapshots the transcript immutably and starts a normal Plan-mode Claude Code chat with
  explicit per-question project context. A paginated read-only tool retrieves it; speech is evidence,
  never instructions. Each Ask creates a fresh chat; continuing that chat retains its original project.
- Generate notes starts a normal chat and offers a guarded save-notes tool. Actions carry owner,
  evidence and optional project. The user edits/selects them in a modal and assigns each destination.
  Tasks shares addReviewed: idempotent source ids, queue paused, Plan mode, no silent execution.
- Shared dialogs now associate their visible title with the dialog through aria-labelledby.
- Scope: ordinary Teams audio/video and screen/window sharing. PowerPoint Live, Whiteboard,
  breakout-room participation and system-audio sharing are outside this implementation. The SDK's
  announced Teams-interoperability transition needs future version validation. Real sign-in/devices,
  caption attribution and long-call refresh need a real test meeting; fake tests never join one.

## D-218: A calmer, wider talking window, and Claude may plan a task queue

- Status: accepted. Asked for by Jon: redesign the talking window "much more modern and
  minimalistic", much bigger and wider "with empty paddings on the sides", no tabs ("all in one
  place"), no Now line, the conversation always visible without cards, "scrolling up and fading
  away", a sound wave as the main feature in the centre; the plan only when there is one. Claude
  "should be able to use our queue tasks add-on to plan when it finds it appropriate, not always";
  Claude decides, or the user when they say so. Also: the working sound "a bit louder and more
  frequent". The layout and the queue mechanics are **Claude, on my own** (Jon: "you are the UX/UI
  expert").
- The window is its own portal panel (not `Dialog`, whose header and footer bars it doesn't want),
  `max-w-7xl`, up to `max-h-240`, with the modal motion classes. Top: a quiet header (title, chat
  name, AI notice, ×). Middle: full-width waves with the status line under them. Bottom: the
  conversation in a centred `max-w-xl` column of fixed height, newest at the bottom, a mask fading
  older lines out upwards (`.jig-voice-fade`), a dot per speaker in a fixed slot. Controls centred
  along the bottom. Esc and × end talking; clicking outside doesn't (too easy to do by accident
  mid-conversation).
- The plan is a card in the right margin, over space the layout leaves empty, so it appears
  without moving anything (no layout shift); on narrow windows it overlays the right edge. Shown
  only while Claude asks to start something. Rejected: tabs (asked away); a plan above or below the
  waves (would push or squeeze the conversation).
- Queue or one chat: `VOICE_GUIDANCE` says most work is one chat (ExitPlanMode); only clearly bigger
  work, several pieces that each deserve a chat, becomes a task queue: Claude calls
  `addon_tasks_add` (one standalone prompt per task, `start: true`) while still in plan mode. That
  call waits as a permission request; the talking window shows it as the plan (`planOf`: "Task
  queue · N tasks"), "go ahead" (or the button) allows it with `start: true` and talking ends; the
  chat itself goes back to its own mode once idle (the work runs in the queue's chats). Anything
  else said is sent back as changes to the tasks. Rejected: a separate "queue" button (Claude, or
  the user by saying so, decides).
- Working sound: one note every 1.4 s (was 2.4 s), about twice as loud (gain 0.09, was 0.05).

## D-219: The meeting room's layout

- Status: accepted. Asked for by Jon: "do a sweep to redesign" the Meetings window, which "was done
  by another agent that is not so good at UI and UX". The layout itself is **Claude, on my own**.
- One shape whatever the call does, so nothing moves when you join or leave (no layout shift):
  a resizable stage on top (`addon.meetings.stage`), a meeting bar, then Transcript | Notes, and a
  status line at the bottom that holds the call state or an error (dismissable), never a banner.
- The stage explains itself when idle; live, participants show as initials (or video/shared
  content fills it) and the call controls float in a dock over its bottom edge: mute, camera, share,
  ⋯ (devices, restart captions), Leave. Rejected: a permanent toolbar of disabled buttons.
- The sidebar has Join from link on top and Upcoming | Saved tabs, so a loading calendar can't push
  the saved meetings down. The calendar loads by itself once connected; events are grouped by day
  with times, titles and Join buttons in fixed columns; saved meetings carry a status badge at the
  far right. "Current" became "Back to live meeting" in the meeting bar, shown only while viewing
  another meeting during a call.
- Generate notes sits on the Notes column, Review actions (with an open-actions count) at its foot
  beside the AI notice; Ask Claude and Open in Teams in the meeting bar. Captions read as blocks
  per speaker (two-minute window) with gaps in place, instead of fixed 96 px rows.
- Pre-join: preview and camera/muted switches beside the device and language choices; the camera
  preview follows the switch. Connection: a status row, field hints, Connect saves first.

## D-220: Automatic Biome cleanup through a project hook

- Jon asked for automatic fixes for recurring Windows CRLF/formatting cleanup and approved using
  a Claude Code hook. Project-only scope and implementation are **Claude, on my own**.
- Use native `.claude/settings.json` PostToolUse hooks, already supported by Jig's project settings
  loading, rather than changing the engine. Run the installed Biome with safe fixes and no downloads
  or AI. Direct edits format that file; shell tools sweep modified/untracked, non-ignored files in
  the source checkout because arbitrary scripts may write multiple files. This may also clean up
  pre-existing uncommitted edits. Skip deletions and paths resolving outside the checkout.
- Successful cleanup stays silent; unresolved lint/syntax errors reach Claude. Existing full checks
  remain required. Other projects, other worktrees and external/background writes aren't covered.

## D-221: Meetings: a lobby before the call, slots during it

- Status: accepted. Asked for by Jon: the meeting should be the main panel on an ultrawide screen,
  everything resizable and movable. A free grid was proposed first; Jon then asked for something
  simpler, "layout slots like in jig … 2 sidebars and a bottom bar, then the main panel", and said
  upcoming and past meetings belong to "a previous step, before going in the meeting". The details
  are **Claude, on my own**.
- Three screens in the one window: the lobby (Upcoming by day with Join, Saved meetings, Join from
  link, Connection), the live room, and a saved meeting's review (transcript | resizable notes, Ask
  Claude, Open in Teams, back to the lobby). Leaving a call opens its review, so notes and actions
  are one step away. The lobby isn't reachable during a call: one call at a time, and it isn't
  needed there. **Amended by D-292:** the lobby and the call are now two windows, and the lobby
  stays usable during a call.
- Live room: the call is always the main area. Transcript and Notes each sit in the left, right or
  bottom slot (⋯ → Move to), two in one slot split it with a remembered divider, empty slots
  aren't drawn. Layout in the header shows/hides panels and resets. Default: both on the right,
  Transcript above Notes. Moving uses the panel menu, not dragging (simpler and reliable; dragging
  can come later). Rejected: a free 12-column grid (more ways to break the layout than there are
  panels).
- The layout lives in meetings.json through `meetings.layout` (validated, room only), not in the
  workbench layout, which this window doesn't load. Saving is debounced while a handle is dragged.
- Lobby, after Jon's feedback ("hard to see multiple meetings", no small Join buttons, "a card or
  something that i can click the whole thing", "see my week as well … with a toggle"): Next up is
  a large card with time, countdown and a Join cue; later meetings are cards by day (Agenda) or
  Monday–Sunday columns (Week, this and next week); saved meetings are cards with caption count,
  notes and open actions. Every card is the button. The test service returns a week of sample
  meetings so the views can be tested.
- Call area, after Jon's feedback (see everyone while someone shares, see people without a camera,
  "like teams handles it"; no profile photos): every participant and you get a tile, video when
  their camera is on, initials otherwise, muted and speaking marks. Gallery tiles are sized to the
  biggest 16:9 that fits. A presenter's screen fills the area with all tiles in a strip beside it.
  The media owner renders each stream into its tile's slot (`slot(key)`, stable ref callbacks), so
  React re-renders don't recreate video views. People is a third panel (hidden by default; the
  participant count toggles it); a slot can hold all three, each split remembered.
- Deleting a saved meeting (Jon): a rare action, so it sits in the review's ⋯ menu and a saved card's
  right-click menu, behind a confirm. `meetings.delete` removes the record and the snapshot files
  whose content carries its id (they are named by a hash); never the live call. Chats that already
  used the transcript keep their own history.

## D-222: Show pre-join failures where joining happens

- Accepted after Jon reported that joining by link appeared stuck in the redesigned modal.
  Jon explicitly removed the pre-join checkbox and notice; feedback/retry details are Claude, on my own.
- Device setup failure must stop its loading indicator and offer Retry devices. Link/host errors and
  device failures appear inside pre-join, rather than solely in the obscured window status bar.
- A real SDK test exposed the root cause: ACS rejects `jig-app:` despite Electron marking it secure.
  Serve only the bundled meeting UI at an ephemeral localhost HTTP URL, binding only 127.0.0.1
  (ACS requires the hostname localhost for HTTP). Validate Host, method and resolved path; retain
  CSP, no remote scripts and sandboxing.
  The IPC router trusts this exact origin/entry page only for the registered meeting window;
  closing the room closes the server/revokes the grant. No general localhost IPC allowance.
- Remove the pre-join acknowledgement and notice (Jon); device readiness and a supplied link gate Join.
  Reserve a fixed-height status area from opening.
  Keep the redesigned device/preview layout and do not shift controls when feedback changes.

## D-224: UI quality is a hard rule; add-ons get responsive variants

- Jon: UI is extremely important, always: layout and good-looking systems are what we do. Added as a
  hard rule in `AGENTS.md` (UI quality comes first).
- Triggered by the Releases panel in the bottom bar: a narrow list with a small "Set up" button per row.
  It is now a card grid sized by the panel (`@container`), whole cards clickable (Jon).
- Add-on CSS compiled only the token `@theme`, so `md:` and `@xl:` variants generated nothing in add-ons.
  `main/addons/css.ts` now adds Tailwind's default screen and container sizes (Claude, on my own).

## D-225: A native Browser for the user, separate from Claude

- Jon requested a usable real browser because the compressed offscreen view looked blurry and
  responded slowly; he explicitly chose native browsing inside Jig and opening in the main panel.
- Keep Claude's existing offscreen service, tools and JPEG observer as “Claude’s browser”. Add a
  native `WebContentsView` for the user's Browser tab: direct Chromium rendering and input, sized
  to the actual slot. Do not route normal browsing through screenshots or input IPC.
- Implementation details are **Claude, on my own**: one page per workbench window, persistent
  isolated user partition, no preload/Node, permission denial, in-place popups, navigation and
  zoom shortcuts, detached DevTools, DOM overlay visibility guard, and a fixed-height status row.
  Claude never controls or observes the user's page. Hidden tabs preserve history; destroying the
  workbench closes the native contents. Multi-page browser tabs can be added later.

## D-226: Direct browser access and page-only assistance in Claude’s browser

- Jon could not find the Browser menu and requested a top-right icon. Register a permanent globe
  button in the existing topbar slot, opening the native Browser in the main panel.
- Jon wants Claude’s browser clearly labelled and browser controls owned by Claude, while keeping
  the site interactive so he can help with credentials/sign-ins. Keep page click, scroll, typing
  and paste; show a read-only URL, remove Back/Forward, Reload, viewport and test-launch controls.
- A permanent hint explains page assistance and links to the user's Browser. Console/Network remain
  inspection controls; error badges reserve fixed slots. Implementation details: Claude, on my own.
- Jon chose Lucide MonitorCog for Claude’s browser (view, menu action and empty state); the user's Browser keeps Globe, including the top-right shortcut.

## D-227: Image zoom beyond Fit and 100%

- Jon requested zoom in/out from the image comparison viewer. Extend shared `ImagePreview` so
  image tabs, both Git diff sides and image/SVG Preview all get the same controls.
- Implementation choices are **Claude, on my own**: 10–800% preset steps, plus/minus buttons,
  Fit and 100% shortcuts, Ctrl/Cmd + wheel zoom, scrolling oversized images and retaining the
  viewport centre while zooming. Preserve the fixed toolbar/viewport slots, independent diff-side
  zoom and compact chat thumbnails. A changed image resets to Fit.

## D-228: A readable maximum width for Suggestions

- Jon reported the full-width Suggestions page was too wide to read on a large display.
- Center the whole view (header, suggestions and weekly summary) with the existing `max-w-3xl`
  token; retain full available width in narrow panels. Exact token choice: **Claude, on my own**.

## D-229: Learning must separate transport details and agent work from user habits

- Jon reported a false profile proposal claiming he saves PNGs rather than pasting (he pastes),
  and browser coaching he could not act on despite never refusing browser access.
- Record counts of shared images/documents for sent prompts, including messages with no text.
  Keep paths/content and input method out of that metadata. Recent-chat samples retain the counts;
  historical missing counts remain unknown. Paths and generated wrappers never prove paste vs picker.
- Require explicit web context for browser-gap mining and describe only missing recorded calls,
  not “never used” or denied permissions. Claude already has browser/tester instructions; do not
  turn agent verification into a recurring user reminder, invent an enable setting or disregard
  Electron tests/screenshots. Correct the feature catalog's Claude/user browser actions.
- Profile proposals need direct statements or unambiguous behavior, not repository implementation
  facts. Counts, contextual mining and prompt guard implementation are **Claude, on my own**.
  These fixes affect future reviews; do not silently rewrite saved suggestions or the user profile.

## D-230: A repository-owned release skill for every agent

- Jon wants an agent to handle Jig releases, and explicitly wants the workflow in the Jig repo so
  Codex, Claude Code and Jig's own agents can all use it. He does not want developer release UI.
- Canonical instructions live in `.agents/skills/jig-release/SKILL.md`; a thin Claude skill entry
  forwards there, and `AGENTS.md` routes all other agents. This maintenance skill is separate from
  the product's bundled skills and the Releases add-on for other projects.
- An explicit publish/release request authorizes release-scoped main/tag pushes and publication,
  as a narrow exception to the ordinary no-push rule. Skill creation or preparation alone does not.
  The agent prepares and tests before pushing, publishes through a verified draft, checks installer
  bytes and public unauthenticated update discovery, and does not replace published tags/assets.
- Implementation details are **Claude, on my own**: next patch by default, a tested manifest-version
  helper, existing Windows packaging and `gh`, checksum asset, bounded retries and resume checks.
  No new CI service or stored token is needed. The first actual release is a separate invocation.

## D-231: Remember the meeting lobby view

- Jon prefers Week and wants the lobby to remember its last Agenda/Week choice.
- Store it globally through typed room-only IPC, rather than storage tied to the ephemeral
  meeting origin. Existing users start on Agenda until they choose Week.
  Persistence details are **Claude, on my own**.

## D-232: Restore Microsoft sign-in with OS-protected storage

- Jon requests remembered Microsoft connection across app restarts. This supersedes D-217's
  memory-only Microsoft sign-in cache; calling credentials remain memory-only.
- **Claude, on my own:** MSAL cache hooks encrypt with Electron safeStorage before atomic storage,
  partitioned by tenant/client hash. Unavailable encryption never falls back to plaintext; Linux's
  basic_text backend is refused. Restore account metadata on overview and let MSAL refresh silently;
  tenant reauthentication still applies. Disconnect/configuration changes invalidate pending saves
  and remove ciphertext. Claude credentials, client secrets and resource keys are never stored.

## D-233: Download Windows updates inside Jig

- Jon expects an in-app update, installed version/latest status, and automatic checks when opening
  Get started. Do not show source-checkout instructions as the initial product message.
- **Claude, on my own:** use electron-updater's GitHub/NSIS feed, auto-download on a startup check
  and page open, show progress and offer Install and restart. No installation on ordinary quit.
  Block restart during meetings/working chats; the initiating workbench also checks unsaved files.
  Feed SHA-512 verification is handled by electron-updater. Signing remains a separate gap.
- Publish latest.yml and installer blockmap alongside every Windows release; packaging itself
  never publishes. Old 0.1.0/0.1.1 installations require one manual upgrade to gain the updater.

## D-234: A join request is not a connected meeting

- Jon reports a real Teams meeting stuck at None with no audio while Teams works normally.
  Root cause found in pinned SDK 2.0.0: getLocalVideoStreamFromCallOptions rejects a present stream
  list unless its length is exactly one. Jig passed [] for camera-off; the SDK throws before its
  start-call try/catch, while TeamsCallAgent.createCall suppresses the rejected promise with catch(noop).
  Hence no connection begins and state remains None. Omit videoOptions when no camera stream exists.
- **Claude, on my own:** normalize initial None to Joining, await Connected or InLobby, fail a
  stalled join after 90 seconds, surface Microsoft connection loss and numeric call-end codes.
  Catch join failures in the room itself: the prejoin modal is already unmounted after submission.
  Show Waiting for others only after Connected; do not label the self tile Connected prematurely.
  Live meeting participation with the corrected options still requires real-machine acceptance.

## D-235: Hand MSAL the latest token cache on every access

- Jon reports Join closing back to the lobby with "Reconnect your Microsoft account from Meetings", and
  Connect opening two "connected" browser tabs. Root cause: MSAL Node 7 `overwriteCache()` clears memory
  before each silent request and restores from what `beforeCacheAccess` deserializes; D-232's plugin read
  the file once, so the stale (often empty) snapshot replaced a fresh sign-in and silent calls always failed.
- **Claude, on my own:** the plugin keeps the latest serialized cache in memory and deserializes it on every
  access, persisting it encrypted as before (memory-only when safeStorage is unavailable). Silent failures
  log only MSAL's error code, never its message or tokens. Teams desktop being in the same call is unrelated.

## D-236: Updates are announced, downloaded on request, installed visibly

- Jon, after trying 0.1.3's updater: checking must not download by itself; Jig checks when it opens and
  shows a toast with a button when an update exists; installing must show a window with progress instead
  of closing and installing invisibly. Supersedes D-233's auto-download.
- **Claude, on my own:** electron-updater runs with `autoDownload` off. A check 5 s after start (and
  Check again) emits the available state; the workbench shows an "available" toast once per version per
  run (Download, Details), skipped while Get started is the active tab. `updates.apply` downloads when
  nothing is ready; the existing "ready" toast offers Install and restart. Install calls
  `quitAndInstall(false, true)`, so the assisted NSIS installer shows its progress window, then starts Jig.
  The meeting/working-chat guards apply to installing only, not downloading.

## D-237: Tune Inter's vertical metrics so icons line up with text

- Jon: icons sit a bit lower than the text beside them in many places (the chat's steps line spinner,
  file icons in Files). Measured: rows centre correctly, but Chromium rounds Inter's ascent/descent to
  whole pixels and floors the half-leading, so the capitals sat 0.2–0.9px above the line box centre at
  most of Jig's sizes (13px xs: -0.69px), i.e. every `items-center` icon looked low.
- **Claude, on my own:** fix it once in the font, not per view: `styles/inter.css` re-declares
  @fontsource-variable/inter's faces with ascent-override 99% / descent-override 22% (same 1.21em total,
  so line boxes and layout don't change). A sweep over the type scale (2xs–2xl) at 12/13/14px picked the
  split with mean error ~0 and max ±0.6px. A custom UI font (Settings) keeps its own metrics. Don't
  nudge icons with margins/translate to compensate; keep icon + text rows on `items-center`.

## D-238: The Scripts list follows the files

- Jon: a new script file or npm script didn't show until Jig restarted, and a group containing it said
  "not found any more".
- **Claude, on my own:** main watches, per project the Scripts view has listed, the folders discovery read
  (`discoverScriptsAndDirs`: roots, repos, `scripts/` and every non-skipped folder to depth 3, plus
  `Properties/`), with non-recursive `fs.watch`, so `node_modules`/`bin`/`obj` are never watched and no
  recursive watch runs over a 30-repo workspace. Only relevant names (`package.json`, lockfiles,
  `host.json`, `*.csproj`, `launchSettings.json`, `.sh/.ps1/.cmd/.bat`, folders coming or going) schedule a
  400 ms debounced re-list; `scripts.changed` is emitted only when the list's fingerprint differs. Over 500
  folders the shallowest are watched and a 60 s poll covers the rest. The add-on already re-lists on that
  event. Pure parts in `scripts/changes.ts`, the service in `scripts/watch.ts`. Rejected: a poll or
  focus-triggered rescan only (late, and wasteful for 30 repos), and the add-on file-watch API (it's for
  add-on host code, not the host's own discovery).

## D-239: `.sh` scripts on Windows run with Git Bash

- Jon: `.sh` scripts failed in the Scripts view with "The term 'bash' is not recognized": the terminal is
  PowerShell and Git's bash is not on Jig's PATH.
- **Claude, on my own:** on Windows, discovery resolves Git for Windows' `bin\bash.exe` once (Program
  Files, Program Files (x86), `%LOCALAPPDATA%\Programs\Git`, else derived from `git.exe` on PATH) in
  `scripts/bash.ts` and writes the command for the shell the terminal uses: `& "…\bash.exe" "./f.sh"` in
  PowerShell, `"…\bash.exe" "./f.sh"` in cmd, plain `bash` when the configured shell is itself bash.
  `System32\bash.exe` (WSL) is never used: it would run the script inside Linux. With no Git Bash the command
  stays `bash` and the row's detail says Git Bash is needed.

## D-240: The terminal shell is picked from the installed shells

- Jon: the shell setting was a free text field; pick from what is installed instead.
- **Claude, on my own:** main detects the shells (`terminals/shells.ts`, pure with an injected probe, so
  it is tested for every OS): on Windows PowerShell 7 (newest under Program Files, winget/Store aliases,
  PATH), Windows PowerShell, Command Prompt, Git Bash (the D-239 resolver), Nushell on PATH and
  Windows Terminal profiles whose commandline is a bare executable; elsewhere `$SHELL` and the existing
  entries of `/etc/shells`. `terminals.shells` returns them with the shell an empty setting starts.
  Settings stores the full path (shell.ts still derives the quoting from the file name), "Default (name)"
  stores nothing, and "Custom path…" is a dialog. WSL is not offered: it needs `wsl -e`, not `-c`.
  Menus got two optional parts for this: a muted `detail` column and a fixed `badge` column.

## D-241: Open one terminal in another shell

- Jon (agreed design): "+" stays one click in the default shell; a chevron beside it lists the installed
  shells (name, muted path, "Default" at the far right) and "Change default shell…".
- **Claude, on my own:** the same list is the right-click on "+" and the top bar's Code → "New terminal
  in…". `terminals.create` takes an optional `shell`, which the host accepts only when it is a detected
  shell or the configured one, so the renderer cannot start arbitrary programs. Picking a shell opens that
  one terminal and never changes the default. Each terminal row shows its shell's short name in a fixed
  column at the far right.

## D-242: Fast e2e: parallel, only what a change needs, the whole suite when releasing

- Jon: the full e2e suite took ~40 minutes, too long to run; it should be about a minute, and the full
  suite runs only when publishing a release (no scheduled runs).
- **Claude, on my own:** Playwright runs tests side by side (`fullyParallel`, a third of the cores,
  2–16, `JIG_E2E_WORKERS`): every test already had its own Electron and temporary JIG_HOME. Measured
  ~40 min sequential → ~4 min parallel. `npm run e2e:changed` runs only the specs a change needs
  (uncommitted + unpushed files; `e2e/affected.json` rules, data-testids a changed view renders, changed
  specs; smoke always), validated by unit tests so rules can't go stale. Builds run only when the inputs'
  stamp changed. The release skill runs the whole suite. Long multi-format tests are split, because the
  slowest single test sets the parallel run's length.
- Fixing the 14 failing tests found two real Dialog bugs (a reopened dialog rendered as closing and
  ignored Escape; a fading-out dialog swallowed the next shortcut), fixed in Dialog.tsx.

## D-243: A natural voice reads aloud: Kokoro on this computer

- Jon: the system's voices sound flat and robotic; he wants a realistic voice like ElevenLabs without
  paying for a service, in English and Spanish, with women's and men's voices to choose from.
- **Claude, on my own:** Kokoro-82M (Apache-2.0) is the default reading voice (`speech.engine`
  `natural`, `speech.naturalVoice`, default `af_heart`); the system's voices stay as the other engine
  and as the fallback while the model isn't downloaded or when it fails (one warning toast).
- It runs in an Electron utilityProcess (`voice-host.mjs`) with transformers.js on onnxruntime-node,
  not in a renderer worker: measured on Jon's machine, onnxruntime-web would be single-threaded (Jig's
  page isn't cross-origin isolated) and slower than speech, while the native runtime makes a sentence
  in about half its spoken length (after ~5–7 s loading once). Talking warms it up when it starts;
  the process stops after 10 minutes unused to give the memory back.
- Full-precision weights (`onnx/model.onnx`, ~330 MB): on the processor the fp16 and q4f16 files gave
  NaN audio for 17–22 of 152 test sentences across the voices, q8f16 crashed onnxruntime-node and q8
  was slower than speech. DirectML (GPU) gave no gain (it recompiles per sentence length).
- Downloaded once into `~/.jig/models` by the main process (`SpeechModels.ensureVoice`, progress as
  `speech.progress` with model `voice`), asking first; each voice's style file (0.5 MB) comes as it is
  chosen. Settings → Speech: engine, voice (grouped by language, woman/man), Download/Remove.
- English phonemes come from espeak-ng (`phonemizer` 1.2.1, which bundles only English data), with
  kokoro-js 1.2.1's text preparation ported to Jig's transformers.js 4 (`main/speech/english.ts`;
  kokoro-js itself pins transformers.js 3). Spanish uses rules written for it (`spanish.ts`), matching
  espeak-ng's Castilian phonemes: checked by reading the audio back with Whisper (all words right).
  `phonemizer` contains espeak-ng compiled to WebAssembly, which is GPL-3.0 — fine for Jig as a private
  app; revisit before distributing Jig under another licence.
- 19 voices: Kokoro's graded C- or better (American and British English) and its three Spanish voices.

## D-244: A Tests add-on for every repo's test suites

- Jon: after speeding up Jig's own e2e suite, an add-on to handle tests in all repos; no scheduled runs.
- **Claude, on my own:** a built-in add-on (`addons/tests`, view starts hidden, Show tests) finds npm
  scripts that run tests (by name or runner) at a repo's root and one folder down, and .NET test
  projects, grouped as what-a-change-needs / unit / check / end-to-end. Runs spawn without a shell
  (`CI=1`), Stop kills the process tree, the result is read from Vitest/Jest/Playwright/Karma/dotnet
  summaries (else the exit code); a toast on finish; the last 30 runs per repo kept in add-on storage,
  output only in memory. Rows are fixed columns with the status at the far right; details in a modal
  with Ask Claude to fix. Claude gets `list` (read-only) and `run` tools. Per-test durations and flaky
  detection are left for later (they need runner-specific JSON reporters).


## D-245: Jig releases in one click: Claude decides, a script publishes

- Jon: releasing Jig should be one click with the least setup; Claude picks the version (which part
  to bump) and writes the notes. Building locally is fine; the Releases add-on stays a tool for
  shaping and recording releases, not for building them.
- **Claude, on my own:** the jig-release skill's steps became `scripts/release.ts` (`npm run
  release`), driven by `release/next.json` (version, bump, reason, summary, notes). It refuses a
  dirty tree, a checkout behind origin, a version that isn't exactly one bump above the latest
  release, an existing tag without a draft; it continues from its own release commit and draft when
  run again. `--check` validates without changes. Pure parts are tested in `release-lib.test.ts`.
- Local build, not GitHub Actions: the Windows build (native modules, the Claude Code binary, the
  Electron e2e suite) already works here; a hosted Windows runner would need its own setup and a
  token stored in GitHub. The script is the part a CI job would call, so moving later is small.
- The one click is the **Release Jig** workflow (Jig project, Workflows add-on): a single Claude step,
  because a workflow's Claude step only starts a chat and a following script step would not wait for
  the plan. Claude runs the script in a Jig terminal and reports the result.
- `.jig/release.json` (planned, semver, `v{version}`, version in package.json, no changelog file) makes
  Jig a repository the Releases add-on tracks: unreleased commits, the suggested version, history.
  Its own Release button only tags, so Jig's releases go through the workflow.

## D-246: Small cleanups from Jon's notes: sync button names its action, Home has no chat box

**Decided by:** Jon (what) and Claude, on my own (how) · **Date:** 2026-11-02

- **Git sync button** (Jon: "should be clear about push and pull, shouldn't always say sync"): it is
  named by what a click does (`addons/git/lib/sync.ts`): **Pull ↓1**, **Push ↑2**, **Sync ↓1 ↑2**
  only when both, **Publish Branch**, **Up to date**; the icon matches (the ⋯ menu's Pull/Push
  arrows), the tooltip names the commits and the remote branch, the toast says what was pulled or
  pushed. The Repos add-on's chip and menu say the same. Supersedes D-152's "Sync Changes" label.
- **Home / project dashboard** (Jon chose removing over embedding the real composer): no chat box;
  a **New chat** button with the folder picker. Starter prompts open a new chat with the message in
  its composer (not sent). The "New chat" Next-steps tile is gone (it duplicated the button).
- **Meeting devices** (Jon wasn't sure the in-call menu works): the in-call picker opens on the
  devices in use (`MeetingMedia.selected()`), so Apply no longer silently resets them to the system
  default. Still needs a real-machine check with physical devices.

## D-247: How Jon's November notes are done

**Decided by:** Jon (each choice asked) · **Date:** 2026-11-02

The plan is `docs/plan/23-jons-notes.md`. Choices made with Jon:
- **Task queue:** one queue per project, each running independently; Claude's `addon_tasks_add`
  approval shown as an editable task list; every run kept automatically in a History per project.
- **Edited built-in add-ons** shared to the gallery arrive as a separate copy with their own name.
- **Meetings:** the history of meetings Jig saved, in the main window (not Teams' own transcripts),
  with Start a chat, Write notes, Review actions, Copy/export, Rename, Delete; meetings in the
  chat's `@` picker; shorter notes.
- **Calls:** Teams calls to and from colleagues (no phone numbers); research first.
- **DevOps:** each project picks its boards, a tab per board.
- **Ghost-text completion:** GitHub's Copilot language server with Jon's own Copilot sign-in, kept
  inside that program. A narrow exception to "Claude Code is the only engine": editor completions
  only, never agent work, chats or tools. Claude Code is too slow per keystroke; a local model is
  weaker and needs a strong GPU.
  Later the same day Jon added **Claude completions** as an opt-in setting (off by default, Haiku by
  default, model selectable): through Claude Code, triggered by typing in the editor (so not a
  background AI call), and Copilot is listed as an optional Get started step.
- **claude.ai projects:** no claude.ai sign-in, credentials or internal endpoints (the safer path,
  Jon's choice after weighing a direct import). Projects get a Knowledge section; an import reads
  claude.ai's data export zip, and its dialog explains step by step how to get that zip.

## D-248: A task queue per project, kept runs, and add-on approval cards

**Decided by:** Jon (per-project queues, history, editable review, D-247); the shapes below
**Claude, on my own** · **Date:** 2026-11-02

- **Storage:** the Tasks add-on keeps `queue` and `history` in project scope. The old global `queue`
  is split by each task's project on first start (unknown projects go to the first project) and then
  cleared. Claude's tools find the queue through the calling chat's project.
- **Runs:** Start opens a run (`runId` on the queue); every task it starts gets that id; the run
  closes when the queue finishes. Tasks are copied into their run as they change, so removing or
  clearing them from the queue keeps the results. The newest 200 runs are kept; files a run uses are
  kept until it's removed ("Remove from history", finished runs only).
- **`chat.permissionRenderer`:** a new slot (`permissionRenderers: [{ tool, component }]`) lets an
  add-on replace the permission card for **its own** tools only (the name is resolved to
  `mcp__jig__addon_<id>_<tool>`, so an add-on cannot intercept other tools' approvals). An allow can
  carry changed input (`updatedInput`), which Claude Code then runs. Tasks uses it for the editable
  review of `addon_tasks_add`.
- The SDK menu items gained `project`, `badge` and `testId`, and `ProjectSwatch` is exported, so
  add-ons can show project pickers like Jig's own.
- **Which queue shows** (Jon): the view follows Jig's global project picker; its own project menu only
  overrides what it shows, until the global project changes again.

## D-249: Add-on originals, Restore original, and sharing a copy

**Decided by:** Jon (restore modified add-ons; an edited built-in is shared as a separate copy, D-247);
the shapes below **Claude, on my own** · **Date:** 2026-11-02

- **Originals:** installing from a gallery or a `.zip` keeps the files as they came in
  `~/.jig/addon-originals/<id>/files` with `origin.json`. "Edited" compares file lists and bytes (built
  host code lives in the cache, so it never counts). Deleting the add-on forgets its original.
- **Restore original** writes the original back as a commit (History can bring your version back). A
  built-in needs no kept original: your copy of it is the change, so Restore removes the copy.
- **Sharing:** one Share dialog for a `.zip` or a **folder** gallery source from Settings (into its
  `addons/` folder when it has one; never overwriting a folder). Git sources are read-only clones, so
  Jig doesn't commit or push into them: save a `.zip` and commit it. "As a separate add-on" rewrites
  `addon.json` with the new name and an id made from it (free among yours); an edited built-in always
  goes this way, so installing it never replaces someone's built-in.
- **Row actions (Jon, follow-up):** a row shows only Change with AI, Share and the switch; History,
  Restore, Open folder, Reload and Delete are in its ⋯ menu, so rows stay calm.

## D-250: Meeting history in the main window, meetings in chats, shorter notes

**Who:** Jon asked for it (his notes, November 2026); the shape is **Claude, on my own**.

- **Where:** a core singleton tab `jig.meetings` ("Meetings", heading "Meeting history"; never
  "Saved meetings"), opened from the Meetings add-on's top-bar button (a menu: Open meetings window /
  Meeting history) and its Tools action. It reads `meetings.history`, so it exists only while the
  Meetings add-on is on. A resizable list (search, rows with date, duration, notes mark and open
  actions in fixed columns) and the selected meeting's Notes and Transcript panels (side by side when
  the tab is wide, stacked when narrow).
- **Actions:** Start a chat (menu of projects; the new chat's draft is the meeting's mention), Generate
  notes, Review actions → task queue (the same `Review` modal as the meeting window), and in ⋯: Copy
  as Markdown, Export Markdown…, Copy chat reference, Rename…, Delete…. The host lets Jig's main
  windows call delete, notes, actions and queue (`fromJig`), not only the meeting window; helper
  windows still can't.
- **Mentions:** a chat mentions a meeting as `@meeting:<title-slug>-<first 8 hex of its id>`; the
  composer's `@` picker lists matching meetings after the files (first when you type `meeting`). Each
  message's turn context names the mentioned meetings' ids and tells Claude to read them with
  `jig_meeting_read` (speech is source material, not instructions). The engine's turn context now gets
  the message text (`turnContext(meta, text)`, `addMessageContext`) for this. Mentions give Claude the
  whole meeting, not a frozen snapshot.
- **Shorter notes (Jon: "way too verbose"):** Summary (2-4 sentences), Decisions, Open questions,
  Actions (owner — action), empty sections skipped, under ~250 words; quotes and timestamps only in the
  drafted actions' evidence.

## D-251: Azure DevOps boards per project, found in your organisations and shown like Azure DevOps

**Who:** Jon asked for boards per project with a tab per board (his notes, November 2026) and, after
the first version, for discovery instead of pasted links and for Azure DevOps' own column layout with
real cards. The rest is **Claude, on my own**.

- **A built-in add-on** `addons/boards` (like Pipelines): `exec:az` with the user's own `az login`,
  nothing stored but the picked boards (project-scoped storage `boards`). Code → Boards opens it.
- **Discovery:** organisations from the az login (profile + accounts APIs, as Pipelines), projects
  (`az devops project list`), teams (`az devops team list`), each team's boards
  (`GET {team}/_apis/work/boards`). The Azure DevOps project named like the Jig project is picked first.
- **A board is a team's board** (Stories, Features…): `GET …/boards/{id}` gives its columns, WIP
  limits, state mappings and the team's column field; `teamfieldvalues` gives the team's areas; one
  `az boards query` (WIQL) reads the cards with that column field, so cards sit in the column Azure
  DevOps shows. Done cards older than 30 days are left off.
- **Layout:** columns side by side (scrolling sideways), all the same width from one header slider
  (Jon; 200-480 px, one global value kept across projects and restarts), cards with a type-colour stripe, id, title,
  assignee and the state when it differs from the column. A card is the click target (opens it in the
  browser); its ⋯/right-click menu starts a chat about it. No editing or moving cards yet (backlog).

## D-252: Installing an update says what happens next, and Jig says it was updated

**Who:** Jon's notes: Jig vanished while an update installed; he wanted the installer or a progress
window. The shape is **Claude, on my own**.

- D-236 already runs the assisted NSIS installer non-silently (`quitAndInstall(false, true)`), and its
  progress page shows in update mode (only the welcome/directory pages are skipped). What Jon saw is the
  gap: Jig closed 300 ms after the click, before the installer's window appeared.
- Install now emits `updates.state` with `download: "installing"`; the workbench shows an "Installing
  Jig X" modal (Jig closes → the installer shows its progress → Jig opens again) and closes the "ready"
  toast; Jig quits 2 s later. A Jig window can't outlive the quit, so the installer's own window is
  the progress window.
- The installer starts Jig with `--updated`; `app.info.updated` tells the workbench, which shows
  "Updated to Jig X" once. Needs a real Windows update to confirm the timing.

## D-253: Mentions in the message box are highlighted, with a chip each

**Who:** Jon asked for mentioned files to be highlighted in the input, to work as links and to have a
chip each. The shape is **Claude, on my own**.

- The message box stays a plain `<textarea>` (typing, IME, undo, dictation and the pickers keep
  working); a layer behind it, in the same font and wrapping, draws the highlight under each mention
  and follows its scroll. A contenteditable editor was not worth the risk for this.
- Only mentions that point at something are highlighted: a file that exists (`files.stat`, once per
  path), a folder (`@dir/`) or a meeting (`@meeting:…`). A half-typed path or a typo stays plain text.
- Links: the chips above the text open what they name (a file in Preview, a folder in the file
  manager, a meeting in Meetings via the tab's new `select` param); × removes the mention from the
  text. Ctrl/Cmd+click on the mention in the text opens it, as in an editor; a plain click still
  places the caret. The chips sit above the text in the box, with attachments, so the text and
  buttons below don't move when one appears.

## D-254: Teams calls in the meetings window, and Jig rings while it runs

**Who:** Jon's notes (Session 4): call colleagues and answer their calls in Jig. Jon chose the best
experience and will ask for admin consent where needed. The shape is **Claude, on my own**.

- **Same SDK, same identity:** the Teams call agent (Azure Communication Services, Teams identity,
  D-217) places one-to-one calls with `startCall({ microsoftTeamsUserId })` and receives them with
  `incomingCall`; both run on the existing Teams.ManageCalls consent. Teams keeps ringing on the
  user's other devices; whichever answers takes the call.
- **Finding people** needs the colleague's Entra object id: Graph `/me/people` (People.Read) for the
  people you work with, resolved to ids with one `/users?$filter=userPrincipalName in (…)`, and a
  directory `$search` (User.ReadBasic.All). Both delegated; asked for on first use, so meetings work
  without them. Recent calls come from the kept call records.
- **Calls are records:** a call is a `MeetingRecord` with `call: { peerId, peerName, direction }`
  and an empty link, so captions, notes, actions, history and `@meeting` mentions work unchanged.
- **Ringing while Jig runs:** the SDK allows one agent per client and only the meeting window may run
  it (D-217), so the agent now lives as long as the window when ringing is on (Connection → "Ring in
  Jig for Teams calls", on by default). Jig opens the window hidden 5 s after start when an account
  is restored; closing it only hides it while the main window is open; a hidden idle meeting window
  doesn't keep Jig running (`markBackgroundWindow`). A ringing call brings it to the front, flashes
  it and shows a system notification; the dialog plays a Web Audio ringtone.
- **Not done:** calls while Jig is closed, group calls, phone numbers (PSTN) and transfer. The test
  meeting service rings on request (`window.jigTestRing`, test service only).
- The meetings window's title is "Jig Meetings", or the live call or meeting's name (Jon).

## D-255: Code completion with GitHub Copilot's language server or Claude Code

**Who:** Jon's notes (Session 6, D-247: completions only through Copilot's language server, with
Claude as an opt-in alternative). The shape is **Claude, on my own**.

- **Copilot, downloaded when you set it up:** the npm package `@github/copilot-language-server`
  (MIT, ~28 MB packed, ~90 MB unpacked) is optional, so it isn't in the installer. Setup fetches the
  latest version's tarball from registry.npmjs.org, checks npm's sha512 integrity, unpacks it with
  Jig's own tar reader (no names outside its folder) into `cache/copilot/<version>`, and
  `current.json` names it. It runs with Electron's own Node (`ELECTRON_RUN_AS_NODE`, Node ≥ 22.13), so
  users need no Node. Jig speaks LSP itself (small JSON-RPC framing, no dependency).
- **The sign-in stays in Copilot's program:** GitHub's device flow (`signIn`, then the returned
  command); the server opens github.com through `window/showDocument`, which Jig sends to the system
  browser. Jig never reads the token. Completions only: `textDocument/inlineCompletion`, plus the
  documented show/accept notifications; no chat or agent features (ACP) are used.
- **Claude, opt-in:** `editor.claudeCompletion` (off) and `editor.claudeCompletionModel` (`haiku`,
  picked from Claude Code's model list); both protected (D-077: plan usage). It goes through Claude
  Code like everything else: a warm process (`Engine.completer`, no tools, no saved chat, the
  claude_code preset with Jig's lines appended) that answers turn by turn and starts over every 8
  turns. Measured: ~0.9 s per suggestion warm, ~4.8 s for the first; requests wait for a 0.7 s
  pause (Copilot 0.15 s). When Claude is on it completes instead of Copilot.
- **Editor:** ghost text is a CodeMirror widget at the caret; Tab (before indent) takes it, Esc or
  moving drops it, typing what it says keeps the rest; a newer request drops an older one. The
  status line shows who completes (fixed place left of the other items) and its menu switches.

## D-256: Project knowledge, and claude.ai projects imported from the data export

**Who:** Jon's notes (Session 7, D-247: the export, never a claude.ai sign-in). The shape is
**Claude, on my own**.

- **Knowledge is text kept by Jig**, per project in `JIG_HOME/knowledge/<projectId>/`: files are
  read once when added (text and code as they are, Word/Excel/PowerPoint through `@jig/documents`),
  so Claude reads the same thing whatever happens to the original. PDFs are read page by page with
  Mozilla's pdf.js through `unpdf` (MIT, ~3 MB, Jon 2026-11-03); a scanned PDF without a text layer is
  refused with a hint to run text recognition first.
- **Claude learns about it per turn:** each message's Jig context lists the project's documents
  (name and size) and `jig_knowledge_read` (read-only, by name, paged at 40,000 characters) reads
  one. The list goes with each message because documents change while a chat runs; it's short.
- **The import reads only `projects.json`** from the export zip (fflate's filtered unzip; the zip
  holds every conversation and is never stored). Its shape isn't documented: `prompt_template` (or
  `instructions`) becomes the project's instructions, `docs[].filename/content` its knowledge, and
  Claude's starter project is skipped. Each imported project needs a default workspace, picked in
  the dialog. Dropped files reach the host by path (`window.jig.pathForFile`, Electron's webUtils),
  so a large zip is never copied through IPC.
- **The steps are shown first** (from Anthropic's help article, to check against a real export),
  with Open claude.ai settings (system browser), a fixed drop zone that becomes the project list,
  and a note for Team/Enterprise plans.

## D-257: Keep CodeMirror; tell Claude to put long Windows scripts in files

**Who:** Jon asked whether Monaco would be better, and whether Jig should change its terminal
default because shell commands kept failing; he left both to Claude. **Claude, on my own.**

- **CodeMirror stays.** Monaco would bring TypeScript/JavaScript language features without a server,
  VS Code's diff editor and a minimap, but costs several MB with its own workers (sandbox setup), a
  rewrite of every editor feature (indentation guides, wrap indent, Angular grammar, status line,
  conflict view, ghost text) and a weaker fit with Jig's theme tokens. The same gains for every
  language come from language servers run by the main process, as Copilot's now is (backlog).
- **The failing commands were Claude's Bash tool**, not Jig's terminal: long heredocs with quotes and
  backslashes broke in Git Bash. Jig's terminal default is unrelated and stays. On Windows, Jig's
  context now tells Claude to write long scripts to a file and run that instead.

## D-258: Tests run when releasing, not after each change

**Who:** Jon, 2026-11-03: "only run tests when we do a release": most of a session went to waiting
for test runs. Supersedes the per-change part of D-242.

- Each change still brings its unit and e2e tests (and `e2e/affected.json` rules); they aren't run.
- Before a commit: `npm run verify` (typecheck, lint, design tokens), which takes seconds.
- Releasing (the jig-release skill) runs `npm run check` and the whole `npm run e2e`; failures are
  fixed then. Jon can ask for a test run at any time.
- UI work is still looked at (a screenshot) before it's called done.

## D-259: Language servers in the editor, through CodeMirror's LSP client

**Who:** Jon asked for the language-server features after D-257 (keep CodeMirror). The shape is
**Claude, on my own**.

- **The user's own servers:** like git, gh and az, Jig uses language servers installed on the
  machine: a catalogue (`shared/lsp.ts`: TypeScript/JavaScript, Python, C#, JSON, CSS, HTML, Go,
  Rust) with each command and its install line. Jig doesn't bundle or download them; Settings →
  Editor shows which are found on PATH and runs an install command in a visible terminal.
- **Main runs them, the editor talks:** the main process starts one server per server and project
  root (nearest marker file, else git root), frames LSP over stdio and relays each message as a
  string (`lsp.send` / `lsp.message`). The renderer uses `@codemirror/lsp-client` (MIT, by
  CodeMirror's author) for completion lists, hover, diagnostics, go to definition, references,
  rename, signature help and formatting, so Jig writes no protocol features itself. A server stops 3
  minutes after its last editor closes.
- **Jig's workspace:** definitions in another file open it in Preview (`displayFile`), URIs are
  compared loosely (servers write `c%3A`), a file in two editors talks through the first, and hover
  Markdown is sanitised (DOMPurify). Diagnostics and tooltips use Jig's tokens.
- `npm` `.cmd` launchers on Windows run through a shell with Jig's own resolved path, never input.

## D-260: Live captions in your language, translated by Teams

**Who:** Jon asked for the live transcript in his chosen language. The shape is **Claude, on my own**.

- **Teams translates**, through the calling SDK's `TeamsCaptions.setCaptionLanguage`; every caption
  then carries the spoken text and the translation (`captionText`). Translated captions need Teams
  Premium for the meeting; when Teams refuses, Jig says so and stays on the spoken language. No AI
  call of Jig's own (nothing calls an AI in the background), and no extra cost beyond Teams.
- **Both are kept:** `MeetingCaption.translated` and `translatedLanguage` sit beside `text`, the
  transcript shows the translation with the original under it, and `jig_meeting_read` gives Claude
  both. The choice ("" = as spoken) is remembered in the meetings store and applied when captions
  start in the next meeting.

## D-261: Paths Claude writes are links to the files

**Who:** Jon asked for the file paths in Claude's answers to be links. The shape is **Claude, on my own**.

- Inline code that reads as a path (`shared/filePaths.ts`: absolute Windows/POSIX/`~`, or relative
  with a folder or a file extension, optional `:line`) is resolved by the host from the chat's folder
  (`files.locate`); only what exists becomes a link, so code like `npm run verify` stays code.
  Answers are cached per chat folder and path.
- Click: a file opens in Preview, a folder in the file manager; Ctrl/Cmd+click opens it with its own
  app (an HTML report in the browser). The line number isn't used yet (Preview can't jump to a line).
- `Markdown` (shared with add-ons) only gains an `inlineCode` hook; the chat supplies the link, so
  the UI library still never calls the host itself.

## D-262: Boards become a workspace: cards managed in Jig, and by Claude

**Who:** Jon wanted to open and manage cards in Jig (drag and drop, edit, delete) and Claude to keep
the boards up to date from chats. The shape is **Claude, on my own**.

- **Same `az`, more commands:** `az boards work-item show/update/create/delete` and `relation add`,
  comments and a type's states through `az rest` (preview comments API 7.1-preview.4). Descriptions
  are edited as plain text and stored as simple HTML (`htmlToText` / `textToHtml`), so Azure DevOps
  formatting isn't preserved when a description is changed in Jig. Delete uses the recycle bin
  (not `--destroy`).
- **Moving a card** sets the board's column field (`WEF_…_Kanban.Column`) and the state the column
  maps the card's type to, as Azure DevOps does; the card shows in its new column at once (faint
  until saved) and goes back if Azure DevOps refuses. Order within a column isn't changed.
- **New cards** go to the team's default area, so they appear on that board.
- **One set of host functions** serves the UI and Claude's tools (`addon_boards_boards/cards/card/
  update/create/delete`); read tools are read-only, writes ask permission. Every write emits
  `changed`, so an open board reloads whether you or a chat changed it.

## D-264: The board query names the project instead of `@project`

**Who:** Jon saw columns but no cards on his board in 0.3.0. **Claude, on my own.**

- `az boards query --project "Podium Systems"` (a project name with a space) returns nothing for
  `[System.TeamProject] = @project`, without an error. The query now names the project in WIQL
  (`'Podium Systems'`, quotes doubled) and doesn't pass `--project`. The test projects had no spaces,
  so the e2e tests didn't catch it.

## D-263: Profile pictures in meetings and calls

**Who:** Jon asked for avatars now that the people permission is being approved. **Claude, on my own.**

- Graph `GET /users/{id}/photos/48x48/$value` with the same User.ReadBasic.All token as people search
  (D-254), requested silently: no browser sign-in pops up during a call; without the permission the
  initials stay. Teams participants are `8:orgid:<object id>`; Jig's own tile is "local" (you).
- Pictures go to the window as data URLs (only image types), cached per person while Jig runs. The
  picture lies over the initials in the same circle, so nothing moves when it arrives.
- Shown on call tiles, in People, beside captions, in Call someone and on a ringing call. The test
  meeting service gives Alex and Sam generated pictures.

## D-265: Board tabs are named by team and board

**Who:** Jon wanted the tab to say "Podium Systems Team", not just "Stories".

- A tab is "Team · Board" by default (it used to add the team only when several teams were followed).
  Tabs saved with the old default (the board's name alone) show the new name too; a name you gave a
  tab yourself is kept. Claude's boards tools accept either name.


## D-266: A frame around what you share in a meeting

**Who:** Jon: the screen or window he shares wasn't highlighted. Built by Claude, on my own for the how.

- When sharing starts, main draws a click-through, always-on-top, transparent border window (Jig's
  accent, 4px) over the shared screen, or the shared window. `setContentProtection` keeps it out of
  the capture, so the others don't see it.
- A shared screen is framed from its display bounds. A shared window is followed on Windows by a
  small PowerShell helper (`main/meetings/shareFrame.ts`) reading the window's DWM bounds every
  120 ms; the frame hides while the window is minimised and goes when it closes. No native module.
  macOS/Linux frame screens only (Electron can't read other apps' window bounds).
- The frame goes when sharing stops (the room reports it with `meetings.shareStopped`), the meeting
  ends or the meeting window closes.

## D-267: A workflow's pipeline is picked from your pipelines

**Who:** Jon wanted a dropdown of his pipelines instead of typing organisation, project and id.

- The pipeline step and the "after a pipeline" trigger show one dropdown, in the row the three fields
  used: the pipelines the Pipelines add-on finds in your checked-out repositories, grouped by
  repository. The Pipelines add-on exports `pipelines` for this (D-215).
- "Another pipeline (type it in)…" swaps the dropdown for the three fields in the same row; a saved
  pipeline that isn't found stays selected as "org / project · pipeline N". With the Pipelines add-on
  off, or no pipelines found, the fields show as before. **Claude, on my own:** those fallbacks.

## D-268: A meeting-notes chat's plan card says it only saves for review

**Who:** Jon: "Approve, and accept edits" on generated notes sounded like it would carry out the plan.

- A chat made by Generate notes is marked with its meeting (`SessionMeta.meetingNotes`). Its plan card
  is titled "Meeting notes and draft actions", says that saving keeps the notes and draft actions with
  the meeting and that nothing is queued or started until you review the actions in Meetings and send
  them to the task queue, and has one button, **Save notes and actions for review**. "Keep planning"
  reads "Change the notes". Other chats' plan cards are unchanged.

## D-269: Meetings that already took place stay in the calendar, faded and joinable

**Who:** Jon: past meetings disappeared; he wants them faded but still joinable.

- The calendar is read from Monday of this week (it started today at 00:00), so the whole week shows.
- An ended meeting stays in the week view and, for today, under "Earlier today" at the top of the
  agenda (now headed "Agenda"): faded (full on hover/focus), with "Ended at … · you can still join";
  a click opens the usual join dialog. Next up still shows the next meeting that hasn't ended.

## D-270: The Teams chat of a meeting or call, in the meeting room

**Who:** Jon asked for the chat of a meeting or call ("go ahead", knowing it needs admin approval).

- Read and sent through Microsoft Graph as you (delegated **Chat.Read** and **ChatMessage.Send**), like
  the calendar and people. A meeting's chat thread comes from its join link; a call's chat is your
  one-to-one chat with that person (`19:<a>_<b>@unq.gbl.spaces`, both orders tried, looked up again a
  minute later while there is none). Graph has no push for a desktop app, so the room reads the newest
  50 messages every 5 seconds while a meeting or call is active, also with the panel hidden.
- Messages are kept in the meeting's record (`chat`), merged by id (edits replace), written only when
  something changed. Claude's transcript (`transcriptText`) has them in time order as
  "Name (in the chat): …", and the Markdown export has a Chat section. System notices and deleted
  messages are left out; attachments and images read as "(attachment)" / "(image)".
- A **Chat** panel joins the room's panels, on the left by default (the left slot is now 320 px, so the
  call keeps its room). Until the permissions are approved it says "Needs your admin's approval" with
  Connect chat…; the send box keeps its row and is disabled. **Claude, on my own:** the 5-second
  interval, the left default and the fallbacks.

## D-271: The task queue's progress sits in its header row; the view fits a sidebar

**Who:** Jon: the "6 queued" bar took a whole row; fit it in the row above and make it work in a sidebar.

- The progress bar and the count per status sit in the queue's header row, left of the controls. The
  row is a container: as it narrows, the time and cost, then the switch's words and the per-status
  counts (replaced by "finished/total") give way, and Add tasks becomes an icon. Past runs keep
  their own summary row.
- The summary starts with how many chats the tasks run in ("8 chats"; narrow: "8 chats · 0/20"),
  counted like the table's chat cards (Jon, after 0.4.0).
- The queue and history tables hide optional columns in narrow containers (Started, Notes,
  Follow-ups, Files, Done/Failed below 48rem; Time and Cost below 36rem); task and status always stay.

## D-272: The release skips an e2e suite that already passed on the same source

**Who:** Jon: releases take too long; skip what's already tested.

- `npm run e2e` (`scripts/e2e.ts`) records the commit in `.jig-e2e-passed.json` (ignored) after a
  passing run of the whole suite on a clean checkout; a filtered or failing run, or one on
  uncommitted changes, records nothing (and a full run first clears the old record).
- The release still runs `npm run check` and the packaged-app test, and runs the e2e suite unless the
  recorded commit differs from the release commit only in the version files and docs/status.md.
  Any other change, docs included, runs it again.

## D-273: A selection on the active line is visible in the editor

**Who:** Jon: a selected line looked the same as the active line.

- CodeMirror draws the selection on a layer behind the lines, so the opaque active-line background hid
  any selection on that line. The active line is now the hover colour at 45% over the canvas, letting
  the selection show through; other lines are unchanged. Applies to every theme (tokens only).

## D-274: Clicking a notification brings the main window, not the meeting window

**Who:** Jon: clicking a Jig notification opened the Meetings window, even when it wasn't open.

- `focusJig()` (notifications, a second launch) and add-on dialogs without a focused window now use
  `mainWindow()`: the first of Jig's windows that isn't a background window. The meeting window opens
  hidden at start to ring for Teams calls (D-254), so it could be the first window and got revealed.
  A ringing call's notification still opens the meeting window itself.

## D-275: Talking with Claude goes by a voice detector, not loudness

**Who:** Jon: while washing dishes or blowing his nose, the noise started turns, interrupted Claude
and came through as "you". Choices of detector and thresholds: Claude, on my own.

- Each 128 ms microphone frame is scored by Silero VAD v6 (MIT, 2.3 MB, bundled in
  `renderer/features/speech/vad/`), run with the onnxruntime-web build Whisper's worker already
  ships (no extra runtime). It runs in the renderer, in order, under a millisecond per 32 ms window.
- A frame is your voice when it is loud enough over the room (as before) *and* scores ≥ 0.6
  (`speech.noiseFilter: strong`, default) or ≥ 0.35 (`light`); a turn stays open while frames score
  ≥ 0.4 / 0.25. Barge-in uses the same test, so noise no longer cuts Claude off. `off` keeps the
  loudness-only behaviour; if the detector can't load, talking falls back to it.
- Whisper's output loses sound tags ([Music], (water running), *sniffs*) and lone fillers ("you",
  "um") in dictation and talking; in talking, phrases it invents from noise ("Thank you.", "Thanks
  for watching!") are dropped when the turn had under a second of voice.
- RNNoise-style noise removal on the audio itself was left out: Chromium's own noise suppression
  stays on, and the problem was deciding what is speech, which the detector does.
- A turn you start while the previous one is still being transcribed and sent waits for it (its
  audio is kept); before, both wrote into the message box at once and left words behind.

## D-276: Speech picks its microphone and speaker

**Who:** Jon: "we should have a device selector in the speech window; I can't switch". Layout:
Claude, on my own.

- `speech.inputDevice` / `speech.outputDevice` hold media device ids ("" = the system's default).
  The microphone is asked for with `deviceId: { exact }`; when it is unplugged, the default listens
  and a toast says so. The natural voice and the talking sounds route their AudioContext with
  `setSinkId`; system voices (`speechSynthesis`) can't be routed and the row says so.
- The same rows are in Settings → Speech (first section) and in an Audio devices dialog from the
  headphones button in the talking window, so devices change without leaving the conversation. A new
  microphone is opened at once; what you were saying on the old one is dropped.
- Escape in a dialog opened over the talking window closes only that dialog.

## D-277: Claude translates live captions when Teams can't

**Who:** Jon: translated captions only work with Teams Premium, which he and his team don't have;
use a small model (Haiku) instead. Details: Claude, on my own.

- Amends D-260. The meeting window still asks Teams first (a language Teams lists, Teams Premium).
  When Teams refuses or doesn't offer the language, Teams shows captions as spoken and the window
  calls `meetings.aiTranslation`; main translates each *final* caption through one warm
  `completer` (no tools, `meetings.translationModel`, default Haiku), in order, and stores it as
  `translated` with `translatedBy: "ai"`. Partial captions aren't translated (cost, flicker).
- It runs only while a language is picked in a live meeting: it stops when the language is cleared,
  the meeting ends, or Jig closes. That is the second exception to "nothing calls an AI in the
  background" (AGENTS.md). Choosing a language is the opt-in, so `meetings.aiTranslation` defaults
  to on (the plan said off; changed so it works without a trip to Settings); both settings are
  protected because they spend the user's plan.
- A translation is kept only while the caption's text is unchanged; a revised caption is translated
  again. Failures are shown once in the Transcript header and captions stay as spoken.
- Disclosure and layout: the header says "AI translation, may be inaccurate"; while Claude translates
  every line keeps a second line ("Translating…", then the original), so nothing moves when a
  translation arrives.
- The picker offers Teams' languages plus `AI_CAPTION_LANGUAGES` (shared/meetings.ts).

## D-278: "Hey Jig" voice commands run on this computer, from one command list

**Who:** Jon: control Jig by voice like Siri ("hey Jig, open a new chat … in speech mode"), from
anywhere in the house, without using the Claude subscription; commands are global (names come
from your own projects), and there is a page listing them. Grammar, wake approach and wording:
Claude, on my own.

- The commands are one typed list (`renderer/features/speech/commands/grammar.ts`): group, title,
  example phrases, patterns with named slots, and `confirm` for actions that need a spoken yes
  (deploys, pulls). The matcher, the Voice commands page and "what can I say" all read it.
- Matching is plain patterns plus fuzzy name matching (`commands/match.ts`); no AI. Speech Jig
  doesn't know is answered "I didn't get that"; only "ask Claude …" starts a chat.
- The wake phrase is found in Whisper's text (with the spellings it uses for "Jig") after the Silero
  voice detector (D-275) has heard speech, instead of a separately trained wake-word model: no new
  model to train or download, and "Hey Jig, new chat" can be said in one breath. A dedicated
  wake-word model can replace it later behind the same detector.
- A chat opened by voice starts in Talk mode.
- Only the first 2 s of each thing said are read to look for "Hey Jig", so a radio or a conversation
  costs one short Whisper pass per sentence; the rest is read only after the wake words.
- `speech.wake` is protected (a chat can't turn the microphone on); while it's on the main window
  isn't background-throttled, so it hears you while minimized. Jig doesn't listen while it speaks,
  while you talk with Claude or dictate.
- Risky commands (deploy, pull) are read back and run only after a spoken yes. A deploy picks the
  pipeline parameter that names an environment (Deploy to, environment, stage) and its matching
  value, on the default branch.

## D-279: The task queue is fully in the user's hands: ticks, put back, start over

**Who:** Jon: a queue started by mistake must be restartable, with full control, and tasks can be
left out for now (all selected by default). Names, where the actions sit and the run handling:
Claude, on my own.

- A queued task has `leftOut` when unticked: it stays queued, Start (`nextTask`) passes it by, and the
  status column shows "Left out". Ticks sit in one fixed column (empty slot for tasks that aren't
  queued) on each task, each chat and the header, so nothing moves when they change. Not shown in
  past runs.
- **Put back in the queue** (`reset` with ids) is in place, unlike Run again (a copy at the end): the
  task loses its chat, times, cost, report and run, keeps its prompt, files and settings. For a task
  that is still running it asks first, pauses the queue and only stops following the chat (the host
  can't stop a chat; the user stops it there).
- **Start over** (`reset` without ids, ⋯ menu, confirmed) resets every task, pauses the queue and
  drops the open run from History (as if it never started); finished runs stay.

## D-280: Talking with Claude: Jig reads the plan when asked, and Claude knows what is spoken

**Who:** Jon reported it: asking "read it out loud, I'm not looking at the screen" after a plan got
"OK, I'll read it" and nothing, again and again. The fix: Claude, on my own.

- Cause: the plan is ExitPlanMode's input, shown on screen and never read. "Read it" reached Claude as
  "changes to the plan", so it showed the plan again. Claude also didn't know that only the text of
  its replies is spoken.
- While a plan or task queue waits for an answer, a request to hear it (`isReadAloud`: "read it out
  loud", "I can't see the screen"…) is no longer sent to Claude. Jig reads the plan itself
  (`planSpeech`, Markdown stripped, tasks numbered) and keeps waiting for yes or no.
- `VOICE_GUIDANCE` now says exactly what is spoken: only reply text, never thinking, tool input or
  subagents. When asked to read something aloud, Claude says it in its reply as spoken sentences, as
  long as needed, instead of calling a tool.

## D-281: A terminal Claude started tells its chat when it ends

**Who:** Jon asked for it after a release, when Claude could only follow `npm run release` with sleep
timers and kept waiting after it had finished. The design: Claude, on my own.

- Claude Code wakes a chat only for its own background work, so Jig does it: when a terminal with a
  `sessionId` exits by itself, the terminals' `onExit` calls `SessionManager.notify(chat, text, from)`.
  Stopped or closed terminals (`killed`) don't notify: the chat or the user ended them on purpose.
- `notify` starts a turn in an idle chat, or goes into the running turn (`priority: "next"`) rather
  than the queue, so Claude reacts at its next step; a chat that no longer exists is skipped.
- The message says it is from Jig, not the user, with the exit code and the last 40 lines. In the
  transcript it is one line (`from` on the `user` item) with "Jig told Claude", never a bubble you
  could edit or rewind, and it stays out of the composer's ↑ history.
- No opt-out per terminal: a dev server that crashes is worth knowing about too.

## D-282: Azure tenants: one Azure CLI folder per sign-in, one way to run `az`

**Who:** Jon asked for a tenant switch in the top bar that every Azure and DevOps view, and every `az`,
follows (2026-11-03, phase 24). The design: Claude, on my own (the plan's design, unchanged).

- A tenant is one Azure CLI sign-in in its own folder, `~/.jig/azure/<key>/`; Jig runs `az` with
  `AZURE_CONFIG_DIR` pointing there. The Azure CLI keeps and refreshes its tokens; Jig never reads,
  copies or logs them (D-018 and "the user's own tools and credentials" still hold). No PATs, no MSAL,
  no stored tokens; `az` output is parsed, never logged.
- "Your az login" (no override, key `default`) is always the first entry. Without extra tenants the
  environment is empty, so nothing changes and nothing is migrated.
- `AZURE_EXTENSION_DIR` stays on your own extensions folder (your `AZURE_EXTENSION_DIR`, else
  `<your config dir>/cliextensions`): extensions live in the config folder by default, and a new tenant
  would otherwise have no `azure-devops`. Each tenant keeps its own `az devops configure` defaults.
- What is kept (`azure/tenants.json`, through the state module): key, label, what was asked for, the
  signed-in user, the Entra tenant id, display name and default domain, the last check's status
  (`ok`, `signedOut`, `expired`, `unknown`) and problem. Checking runs `az account show` and ARM
  `/tenants` (`az rest`): neither prompts nor opens a browser.
- The active tenant is the setting `azure.activeTenant` (empty = your az login; a key that's gone falls
  back to it), protected (D-077) because it decides which credentials programs run with.
- Adding runs `az login --tenant <id or domain> --allow-no-subscriptions --output none` (empty: pick in
  the browser) with the newer login's terminal subscription picker off. One sign-in at a time, its
  output streamed (`azure.signInProgress`), cancellable (`azure.cancelSignIn` ends the process tree); a
  sign-in that didn't finish leaves no folder. Removing deletes the folder, which signs that tenant out
  on this computer. Signing in again for your own login runs plain `az login`.
- One way to run `az`: `main/azure/env.ts` holds the active environment; project links, setup checks
  and add-on host processes add it. Add-on hosts get it at start (`init.env`) and on change (`env`
  message) and add it to every program they run, not only `az`, so a script that calls `az` follows
  too; an add-on's explicit `options.env` still wins. Chats, terminals and scripts follow in session 4.
- Switching emits `azure.tenantChanged` (renderer) and the add-on event `azure.tenant` (`JIG_EVENTS`)
  with the tenant's key, label, user, tenant id and domain.
- Kept apart: Meetings' own Microsoft sign-in (D-232).

## D-284: One `az` for Jig and its add-ons; Azure and DevOps views follow the tenant

**Who:** Jon asked for it (phase 24, session 3: "replace the three copies of the az helper", caches
keyed by tenant, a reserved-space spinner, a Boards placeholder "In tenant X — Switch"). How: Claude,
on my own.

- **One runner.** `main/azure/run.ts` `runAz(args, { env, tenant })` is the only way Jig runs `az` for
  an answer: no shell, `-o json --only-show-errors`, plain-output environment, decoded from the ANSI
  code page az on Windows prints in (`decodeAzOutput`, moved from Pipelines to `@jig/azure`), and the
  error mapping `azFailure` in `@jig/azure` (missing, extension, signedOut, expired, failed) into an
  `AzError`. Project links use it in main; add-ons get it as `api.azure.az` (it runs in their host
  process with the environment main sent). Pipelines, Boards, Releases and Workflows dropped their own
  copies. `exec("az", …)` still works and still gets the tenant's environment.
- **Messages name the tenant, but only an added one.** With a tenant added in Jig every message says
  "tenant X" and sends an expired or missing sign-in to the tenant avatar; with your own az login the
  messages stay what they were ("run `az login`"), so nothing changes for someone without tenants.
- **Host processes know the tenant.** The `env` message became `azure` (`{ env, tenant }`), sent at
  start and whenever the active tenant or its label changes, before the `azure.tenant` event, so a
  handler's `api.azure.tenant()` already says the new one. Add-on UIs get `ctx.azure` (`tenant`,
  `tenants`, `switchTo`) from the renderer's tenant store.
- **Pipelines** keys its in-memory caches (orgs, projects, pipelines, describe) by tenant key; its
  settings (`allOrgs`/`orgs`), found pipelines and newest runs are stored per tenant (`key` for your az
  login, so nothing is migrated; `key@<tenant>` for others). A tracked run remembers its tenant and is
  checked only while that tenant is active. On `azure.tenant` the host (`tenantChanged`) finds that
  tenant's pipelines and emits `refreshed`; the view keeps its toolbar and shows `<Spinner center />` in
  the list's space until they arrive, and drops answers that belong to another tenant. Its settings page
  reloads per tenant and says which one.
- **Boards** records the tenant a board was followed in (`tenant`, `tenantLabel`; boards from before are
  your az login's). A board of another tenant isn't asked for: the host answers `elsewhere` and the view
  shows one card in the board's space, "In tenant X", whose whole surface switches to it (a removed
  tenant says so instead). Claude's board tools refuse with the same explanation. Boards reload on a
  switch (the board body is keyed by tenant).
- **Releases and Workflows** run their `az pipelines` calls through `api.azure.az`: a failure names the
  tenant, a started run says "in tenant X" when it isn't your own login.
- **Project links → Azure** lists the subscriptions of the active tenant's Entra id (your own az login:
  every directory, as before); the dialog says which tenant, reloads on a switch and keeps its list in
  one fixed-height slot (spinner, error and list take turns there).

## D-283: The tenant switch is an avatar at the far right of the top bar

**Who:** Jon (2026-11-03): after seeing a chip with the tenant's name, "just like a user avatar, and on
the far right". The rest: Claude, on my own.

- The switch is a round button with the tenant's initials (`tenantInitials`: the label's first and last
  word; your az login is named after the tenant it signed in to), after Settings at the far right.
  Fixed size and always shown, also with only your az login, so nothing in the top bar moves when the
  tenants load or you switch. Name, user and domain are in its tooltip; an expired or signed-out
  sign-in adds a warning dot on the avatar (absolute, no shift).
- The menu lists tenants one row each: the avatar in the icon column, label, user and domain in fixed
  columns, and one far-right column for a check (in use) or a warning (sign in again; it wins over the
  check). `ui/Menu.tsx` items gained `avatar`, `columns` and `mark` for this, usable by any menu.
- Add and Manage are modals hosted by the switch (Settings → Azure opens the same ones). A sign-in's
  output shows in a fixed-height box; Add switches to the new tenant by default (a switch in the
  modal). Manage checks every tenant's sign-in when it opens; clicking a row switches.
- The renderer asks the Azure CLI on start only when tenants were added, so someone who never added
  one never has `az` run for this.
- Claude: `jig_azure_tenants` (reads; `check` runs the same check) and `jig_azure_switch_tenant`
  (needs approval: it decides which credentials Jig's programs use). `jigContext` tells Claude not to
  switch with `az login`/`az logout` and to send the user to the menu for an expired sign-in.

## D-285: Chats, terminals and scripts run with the tenant active when they start

**Who:** Jon asked for it (phase 24, session 4: the active tenant's `AZURE_CONFIG_DIR` for new chats,
terminals and scripts, `jigContext` naming tenant and user, a small label in a fixed slot when a chat or
terminal started under another tenant). How: Claude, on my own.

- **At start, not live.** A Claude Code process, a Jig terminal (scripts run in terminals, so they
  follow too) and a `!` command get `withAzureEnv(sessionEnv(…))`: the existing API-key stripping, then
  the active tenant's `AZURE_CONFIG_DIR`/`AZURE_EXTENSION_DIR` (nothing for your az login). A running
  process keeps its environment; switching doesn't restart anything, because restarting would cut off
  Claude's work or a dev server. The next Claude Code process of that chat (after Stop, a restart of
  Jig, a skills change) starts with the tenant active then.
- **Recorded on the item.** `SessionMeta.azureTenant` and `TerminalInfo.azureTenant` (`TenantTag`:
  key and label) say which tenant it started with. A chat's is set when its process starts and cleared
  when it ends (and on load), without touching `updatedAt`, so it never names a tenant no process uses.
- **Shown only when it differs.** The chat header shows initials and the tenant's name at the right
  end of its spacer (the spacer is the slot: nothing moves when it appears); a terminal tab shows the
  initials right before the shell column, so the marks form one column and don't move when the close
  button appears on hover. Tooltips say the tenant it uses and which one the top bar is on.
- **Claude is told, never given tokens.** `jigContext` (the system prompt, built when the process
  starts) has one line from `tenantContext` (`@jig/azure`): which tenant, its Entra name, domain and id,
  and the signed-in user. When the user switches while the process runs, each message's context says
  that `az` in this chat still uses the tenant it started with.

## D-286: A project can pin an Azure tenant; switching to it switches the tenant

**Who:** Jon asked for it (phase 24, session 5: a project setting "Azure tenant", Default or a tenant;
switching to the project switches through the top bar's path; a removed tenant falls back to Default
with a note). How: Claude, on my own.

- **Stored on the project.** `Project.azureTenant` is a tenant key (`default` = your own az login).
  Missing means **Default: the tenant in use stays**, so projects without a pin never switch anything
  and you can still switch from the top bar inside any project. "Your az login" is a real choice in
  the list, distinct from Default.
- **One path.** The host watches the project store (`followProjectTenants`): when the active project
  changes, or the active project's pin changes (saving the dialog), and the pin names an existing
  tenant, it calls the same `setActiveTenant` the top bar and `jig_azure_switch_tenant` use, so the
  setting, `azure.tenantChanged`, the add-on event and the avatar all follow. The project that is
  active when Jig starts is not re-applied: you may have switched by hand since.
- **A removed tenant is Default, not an error.** Removing a tenant leaves the key on projects; it
  counts as Default (`pinnedTenant`). The project dialog shows Default with a warning in the hint's
  slot (same height as the hint, so nothing moves) and saving clears the key. `jig_list_projects`
  says "removed, so Default".
- **Claude names it like a person would.** `jig_create_project`/`jig_update_project` take
  `azureTenant` as a key, name, domain or tenant id (resolved with `findTenant`, now in `@jig/azure`
  and shared with `jig_azure_switch_tenant`); the change card shows the tenant's name and Undo puts
  the previous pin back. Pinning needs no extra approval beyond the tool's own: it only picks among
  tenants the user already added.
- **The avatar says why.** Its tooltip adds "Pinned by the project X" when the active project's pin is
  the tenant in use.

## D-287: The task queue can't be undone by a stale copy; running tasks know what's queued after them

Jon, 2026-11-03, after a chat rewrote the Tasks queue with `jig_set_addon_data` from a copy it had read
a minute earlier: the copy wiped a finished task's report, sent a started task back to queued (it ran
twice, in two chats editing the same files) and switched a paused queue back on. Separately, a task's
chat suggested the next queued task as a follow-up because nothing told it that task was planned.

- **Changing add-on data needs a fresh read.** `jig_set_addon_data` and `jig_delete_addon_data`
  refuse to replace or delete a key that exists unless this chat read it with `jig_get_addon_data`
  (one key or all) and it still holds what was read; otherwise they say so and save nothing, and
  Claude reads again and redoes its change. Creating a new key needs no read. Reads are remembered per
  chat in the main process (a restart forgets them, so the next write asks for a read first).
  (Claude, on my own: a per-chat "last read" check instead of revision numbers in the stored data, so
  add-ons and their storage stay as they are.)
- **`addon_tasks_edit`** changes queued tasks only (title, prompt, appended paragraph, left out),
  through the add-on's own serialized `change`, so the queue's running state, other tasks' statuses
  and reports can't be touched. The tool's description and `jig_set_addon_data`'s point Claude to it.
- **A running task's instructions name the tasks still queued** (titles, left-out ones marked, at most
  15) and say not to suggest them, or work they cover, as follow-ups.

## D-288: New chats are named by the quick model

Jon, 2026-11-03: "i want every new chat to be renamed by the ai as soon as it starts, so it has a
meaningful short name".

- **When:** on a chat's first message (only while it is still "New chat"; forks, imported Claude Code
  chats, builder and other special chats keep their own titles). The first words stay as the title until
  the name arrives, so something is shown at once; a rename by you in between wins.
- **How:** a one-shot, no-tools question to `engine.quickModel` (Haiku by default) through the user's
  Claude Code, with the first 4000 characters of the message: 2–5 words, the message's language, sentence
  case. The answer is cleaned (first line, no quotes, "Title:" label or full stop, at most 60 characters).
  A failure or timeout (60 s) leaves the first-words title. (Claude, on my own: once, not refreshed on
  later turns, so a name doesn't change under you.)
- **Setting:** `engine.aiTitles`, on by default; protected (it spends the plan, like caption
  translation), so it's switched in Settings → Claude Code, not from a chat. This adds a third exception
  to "nothing calls an AI in the background" in `AGENTS.md`.

## D-289: Project notes are part of the project's knowledge, not an add-on

Jon, 2026-11-03: "the project notes should probably just belong there as well, in the project, not
as a separate addon … how can we do this so that we dont lose the existing notes". Agreed with the
plan below, including keeping the sidebar view.

- **Where:** notes move into Jig itself, next to the project's documents:
  `knowledge/<projectId>/notes.json` (`{ notes: Note[] }`, the same note shape as D-202). Removing a
  project removes them with its knowledge. The Notes add-on is gone; its logic lives in
  `shared/notes.ts`, its store in `main/knowledge/notes.ts`.
- **Notes stay notes, not documents:** short, typed, given to Claude in full with every message and
  kept by Claude; documents stay long, read on demand, added by you. Claude gets one "Project
  knowledge" block per message: the notes, then the document names.
- **Moving the existing notes (an exception to "no migrations", D-101):** at startup, every existing
  project whose `@project(<id>) notes` entry is in `addon-data/notes.json` and that has no
  `notes.json` yet gets them unchanged (ids, kinds, authors, times). The old file is then renamed
  `notes.json.migrated`, never deleted. Notes of removed projects and legacy `chat:*` entries stay
  only in that file. (Claude, on my own: copy-if-missing, so it is safe to run again.)
- **Tools:** `jig_notes_list` (reads, no prompt) and `jig_notes_add` / `jig_notes_update` /
  `jig_notes_remove`, all always loaded. The writing tools follow the chat's permission mode: the
  add-on had marked them read-only, which `AGENTS.md` reserves for tools that only read.
- **UI:** the project's Home Knowledge card shows Notes above Documents, with **Add note…**. The
  sidebar view stays as `jig.notes` ("Project notes", left), and saved layouts keep where you had
  `addon.notes.notes` (`RENAMED_VIEWS` in `shared/layout.ts`). (Claude, on my own: a whole note row
  opens its editor; the hourglass clears a dependency; open and remove are on hover.)

## D-290: az runs without cmd.exe; free text never goes through cmd quoting

Jon, 2026-11-03, after creating cards on a board from a chat: titles with "–", "…", "›" and names like
"ö" came back as "?" / "�", deleting a card reported a JSON error although it was deleted, and a
description with double quotes and punctuation failed with cmd.exe's "… was unexpected at this time".
Jon asked not to pass user text through cmd quoting.

- **Windows' installed az runs as Python, directly.** az.cmd only starts `..\python.exe -IBm
  azure.cli %*`. `azCommand` (`main/azure/run.ts`) finds that Python beside az.cmd (`azPythonFor`)
  and starts it itself with `-X utf8 -IBm azure.cli` (`AZ_PYTHON_ARGS`) and `AZ_INSTALLER=MSI`: no
  shell, arguments arrive exactly as written, and output is UTF-8 whatever the code page (-I ignores
  `PYTHONUTF8`/`PYTHONIOENCODING`, not `-X utf8`; the cp1252 fallback of `decodeAzOutput` could
  never show characters cp1252 lacks). `runAz`, the tenant checks and `az login` all start az this way.
- **Any other az on Windows** (a pip install's batch file) still goes through cmd.exe, but every
  argument cmd or the batch file's `%*` could break (quotes, `%`, `!`, `^`, `<>&|`, line breaks,
  non-ASCII; `unsafeForCmd`) is written to a UTF-8 file in a temporary folder and passed as `@file`,
  which az reads back as the value (`azArgsViaFiles`); the folder is removed when az ends. (Claude, on
  my own: files rather than escaping, since cmd's double parse of `%*` has no safe escaping for
  quotes and line breaks.) Other systems run `az` with its arguments as they are.
- **Commands that print text instead of JSON go through the REST API.** Boards deletes a card with
  `az rest --method delete …/_apis/wit/workitems/{id}`; `az boards work-item delete` prints
  "Deleted work item …", which `runAz` (JSON only) rightly calls a failure. (Claude, on my own.)
- **Tests' fake az reads `@file` like the real one** (`AZ_ARGV` in `e2e/fixtures.ts`): on Windows
  the fakes are batch files, so they get the file arguments.

## D-291: People's pictures for add-ons come from the meeting sign-in, by e-mail

Jon, 2026-11-03: show each Boards card's "Assigned to" as that person's avatar (photo when Jig can
get it, otherwise initials) in a fixed slot at the far right, with name and e-mail on hover, also in
the card's detail; use the same source as Meetings' photos, through a typed cached host call, with no
network calls without the meeting sign-in; add-ons reach it through the SDK, not renderer meeting code.

- **Host:** `people.photo { email }` (main/meetings) asks Graph `users/{upn}/photos/48x48` with the
  meeting sign-in's silent token, like `meetings.photo` (D-263), and shares its per-run cache. Null
  without the Meetings add-on on, without its sign-in (MSAL isn't even set up then: no request), or for
  anything not e-mail-shaped (`isUserName`). (Claude, on my own: after a refused people token it
  stops asking for 10 minutes, since a board has many people; signing in again resets that.)
- **Add-ons:** `ctx.people.photo(email)` (cached per window) and `PersonAvatar` in `@jig/sdk/ui`:
  fixed size (`sm` for a line of small text, `md` beside an input), initials under the picture, an
  empty slot when there's nobody, Jig's `Tooltip` with name and e-mail.
- **Boards:** cards carry `assignedEmail` (the `uniqueName` of `System.AssignedTo`, or the `<…>` of
  "Name <email>"). (Claude, on my own: the name stays on the card's last line, the avatar moved from
  in front of it to the far right; in the detail, while you type another assignee the avatar shows
  their initials, and their picture once it's an e-mail.)

## D-292: Meetings in two windows: a lobby beside the call

- Status: accepted. Asked for by Jon, 2026-11-03: "the lobby stays usable during a call; the call
  pops out into its own window", the way Teams does it. Amends D-221 (three screens in one window).
  The details are **Claude, on my own** unless said otherwise.
- **Lobby window** (`?meetingLobby=1`, `MeetingLobby.tsx`): what `meetings.open` opens (Meetings →
  Meetings, the meeting history's Open Meetings, `ctx.meetings.open()`). Agenda/Week, history,
  Connection, Call…, Join from link…, a saved meeting's review (Ask Claude, Generate notes, Review
  actions, Call back, Open in Teams, delete). A normal Jig page (`jig-app:`, the workbench CSP),
  sandboxed with contextIsolation and no Node; it never receives the calling credential. It is a
  normal Jig window (`appWindows()`, gets events, keeps Jig running) marked `markSecondaryWindow`, so
  `mainWindow()`/`focusJig()` never pick it as the workbench.
- **Call window** (`?meetingRoom=1`, `MeetingRoom.tsx`): the existing media window on the loopback
  page (D-217, D-222). It shows only the device check (Prejoin), the live call with its panels and
  slots, a ringing call, and "No call" when there is nothing (with Open Meetings). It opens hidden
  beside the lobby and stays hidden between calls; Join / Call… / Call back in the lobby call
  `meetings.start` ({join, url, title} | {call, peerId, peerName, camera} | {show}). Main keeps the
  request, reveals the call window and emits `meetings.startRequested`; the call window takes it
  with `meetings.takeStart` (also once on load, so a request made while it was still loading isn't
  lost). When it has nothing left to show (no call, device check, ringing or error), it says
  `meetings.callIdle` and main hides it.
- **A call ends:** main hides the call window and opens the lobby on that meeting's review
  (`meetings.review` event, or `?review=` when the lobby opens then). Not while Jig is quitting.
- **One call at a time** (`activeId` as before). Join or Call… in the lobby during a call asks first
  and offers to show the live one instead of leaving it. The lobby's status bar shows the live call
  in the spot that otherwise says "No call"; a click brings the call window forward. (A status bar
  line rather than a banner: nothing in the lobby moves when a call starts or ends.)
- **Closing:** closing the lobby never ends a call. The keep/leave question stays on the call
  window. A closed lobby takes the hidden, idle call window with it unless Jig listens for Teams
  calls (D-254), and runs `closeHelpersIfAlone()`, so a hidden call window never keeps Jig running.
- **Guards:** `own()` = call window only (credential, caption, status, aiTranslation,
  captionLanguage, join, startCall, incoming, chat/chatSend/chatConnect, share, takeStart, callIdle);
  `lobbyOrCall()` = either Meetings window (overview stays open to Jig's windows; start, lobbyView,
  layout, configure, signIn/signOut, setRinging, people, ask, revealChat); `fromJig()` unchanged
  (also the main window: notes, actions, queue, delete, rename, export, photo).
- **Layout:** both windows save the one `meetings.layout`: the call window owns the panels and slot
  sizes, the lobby the review's notes width; each starts from the saved layout when it saves, so
  neither overwrites the other's part.

## D-293: "Don't ask" chats never wait for a permission prompt

- Status: accepted. Asked for by Jon, 2026-11-03: "I don't want a chat to stop because it's waiting
  for me." Claude Code still asks for its own safety checks under `bypassPermissions` (here
  `rm -rf /e/scratch-…`, a "critical path"), and the chat stopped until someone clicked.
- In "Don't ask" mode `askPermission` declines such requests at once instead of showing the card.
  **Deny, not allow** (Jon agreed): these checks guard against the most destructive commands. The
  denial message tells Claude not to retry the same call and to use a safer way (the repository's
  `.tmp/` or the system temp folder) or skip it and say so. A warning notice in the chat says what
  was declined. The mode is read live (`live.state.meta.permissionMode`), so switching a running
  chat to "Don't ask" applies at once.
- `AskUserQuestion` and `ExitPlanMode` still wait: they are questions to the user, not safety
  checks. **Claude, on my own.**
- No `needs_you` status or notification is raised for a declined request.

## D-296: Your Teams chats in the Meetings lobby, and Chat from Call…

- Status: accepted. Asked for by Jon, 2026-11-03: a Chats view in the lobby with your Teams chats
  (newest first, picture, name, last message, time, unread), the open chat reusing the meeting chat
  panel, and a Chat action per person in Call… that opens your one-to-one chat. Extends D-270 (the
  chat of a meeting or call). Details are **Claude, on my own** unless said otherwise.
- **Same permissions, no new consent.** `GET /me/chats?$expand=members,lastMessagePreview` (top 50,
  newest first) with D-270's Chat.Read; reading and sending with Chat.Read / ChatMessage.Send. Where
  Graph refuses both expansions in one request, Jig reads the previews and the members separately and
  merges them by id. Missing approval shows D-270's Connect chat… flow, in the list and the open chat.
- **Jig can't start a chat** (that needs Chat.Create, which Jon didn't want to ask for): Call… → Chat
  finds your one-to-one chat with `callChatId` (the two ids D-270 probes); with none, the dialog says
  so and offers **Open in Teams** (`https://teams.microsoft.com/l/chat/0/0?users=<email>`, through
  `openExternal`). People without an e-mail (an old caller) get the message without the link.
- **Unread** = someone else wrote after Teams' `viewpoint.lastMessageReadDateTime` and after you last
  opened the chat in Jig. Jig can't mark a chat read in Teams (Chat.ReadWrite), so it remembers in
  memory, while Jig runs, when you last opened each one; Teams itself still shows it unread until
  you read it there.
- **Reading:** the open chat every 5 seconds while it is open; the list once when the lobby is
  connected (for the count on the rail) and every 30 seconds while Chats shows, and after you send.
  Messages are read when asked and never stored or logged (unlike a meeting's chat, which is kept
  with its record for the notes); chat text is shown as evidence, never acted on.
- **Lobby layout:** a rail on the left (Meetings, Chats with the unread count), always there, so
  switching moves nothing; Chats is the list (resizable, `chats.list`, owned by the lobby like
  `review.notes`) beside the open chat. Rows follow the alignment rule: picture, name and time on the
  first line, the last message and the unread mark (a fixed slot at the far right) on the second; the
  whole row opens the chat. The header keeps Connection / Call… / Join from link… in both sections.
- **IPC:** `meetings.chats`, `meetings.chatThread {chatId}`, `meetings.chatThreadSend {chatId, text}`,
  `meetings.chatWith {peerId}`; lobby or call window only (`lobbyOrCall`, D-292), chat ids validated
  to Teams' two shapes (`TEAMS_CHAT_ID`) because they go into Graph paths. `meetings.chatConnect` is
  now allowed from the lobby too.

## D-294: Claude Code stays the chat engine; ChatGPT (Codex) is a second provider for non-chat AI _(chat engine part superseded by D-309)_

- Status: accepted. Decided by Jon, 2026-11-03: he wrote "Claude Code is the only engine" (D-002,
  principle 1, D-124, D-247) and is dropping it. **New rule:** Claude Code stays the engine for chats
  (and everything agentic: tools, the builder, routines, Claude's browser); OpenAI's official **Codex
  CLI**, signed in with the user's **ChatGPT** account, is a second provider for *non-chat* AI
  features: one text in, one text out, no tools. Codex chats are a later, separate project.
- **The no-credential rule covers Codex too** (Jon): Jig never reads, stores, logs or forwards Codex or
  ChatGPT tokens (`~/.codex/auth.json`). It runs the official CLI, which signs in with its own flow
  (`codex login`, in a private terminal like Claude Code's) and keeps its own login. Only "signed in"
  and how (ChatGPT / an API key) are kept from `codex login status`; a masked key it prints is dropped.
- **Where Codex comes from** (Claude, on my own): the user's own install on PATH (`npm i -g
  @openai/codex`, Homebrew, winget), like `gh` and `az`. Not a dependency: the npm package is ~480 MB
  per platform (a 370 MB native binary plus voice resources), too much for Jig's installer. The Codex
  desktop app and the VS Code extension keep their binaries in versioned private folders, so Jig does
  not look there. On Windows the npm `codex.cmd` shim is skipped for the native `codex.exe` behind it
  (`findCodex`), so no `cmd.exe` sits between Jig and Codex.
- **The call** (Claude, on my own): `codex exec --json --sandbox read-only` with approvals `never`,
  the shell, unified exec, apps, plugins, sub-agents, images, browser/computer use, hooks and memories
  disabled, web search off, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`,
  `--skip-git-repo-check`, the chosen `--model` and `--cd`, the prompt on stdin. The answer is the last
  `agent_message`; `turn.failed` / `error` events reject with their message; the same 3-minute timeout
  and "... didn't answer in time" error as Claude's one-shot. `OPENAI_API_KEY` / `CODEX_API_KEY` are
  removed from Codex's environment (and the sign-in terminal's) so it always uses the ChatGPT login.
  Jig's extra instructions go before the prompt (Codex has no `append`).
- **Models:** Claude's from Claude Code (`engine.models`); ChatGPT's from `codex debug models` (the
  `list`-visible ones in Codex's priority order, read once per run), else `CHATGPT_FALLBACK_MODELS`
  in `shared/providers.ts`. IPC `ai.models { provider }`.
- **Code:** `main/providers/` (`oneShot(provider, model, prompt, timeoutMs)`, `providerModels`,
  `codexBinary`; pure helpers in `codex.ts`, unit-tested). `ai.ask` goes through it on `claude`. With
  the fake engine both providers answer from the fake engine's one-shot, so tests never run Codex.
- **Get started:** an optional **ChatGPT (Codex)** row: `codex --version`, then `codex login status`;
  Sign in… (action `jig.codexLogin`, `terminals.codexLogin`) when installed but signed out, How to
  install when missing. The `codex.signIn` event re-runs the checks and shows a toast, as for Claude.
- Which features use which provider is the next step (per-feature provider and model in Settings).


## D-295: Meeting history in folders: yours, and one per recurring meeting

Jon, 2026-11-03: "folders that I can create manually and drag and drop meetings to, and meetings that
are part of a series, like Sprinta daily, should go automatically to their own folder", in the history
tab and in the lobby.

- **Your folders** are stored in `meetings.json` (`folders` [{id, name}], names unique ignoring case);
  a record's `folder` is the folder you put it in, `null` once you took it out of every folder, or
  missing to follow its series. Deleting a folder only clears that field on its meetings.
- **Series folders are worked out, not stored** (Claude, on my own): a recurring Teams meeting keeps
  one meeting thread for all its occurrences, so meetings whose join links name the same thread
  (`meetingChatId`) are one series, and two or more of them get a folder named after the newest. This
  needs no extra calendar scope or fields (calendarView's `seriesMasterId` isn't fetched) and works for
  meetings kept before folders existed. One-to-one calls have no series.
- **Where you put a meeting wins** over its series; a series folder only takes back its own meetings
  ("Its recurring meeting's folder"). The same places are in a meeting's Move to folder menu, so
  nothing needs dragging.
- Folders (yours and series, by name) come first, then "Not in a folder"; while searching, empty
  folders hide and folders with matches open. Which folders are open is kept in the renderer's
  localStorage, shared by both views. Both views use `useMeetingFolders` and the pure
  `shared/meetingFolders.ts`.

## D-297: Each AI feature picks its provider (Claude or ChatGPT) and model in Settings

- Status: accepted. Asked for by Jon, 2026-11-03 (follows D-294): in Settings the user picks, for each
  simple AI feature, the provider and a model from that provider.
- **Features** (`shared/aiFeatures.ts`, in Settings order): commit message, check before committing,
  release notes draft, tour of changes, compare attempts, standup, chat names, weekly patterns,
  caption translation, and two rows for other add-ons (`ctx.ai.ask` with `quick`, and without).
  `config.ai.<id> = { provider, model }`.
- **Nothing changes for existing users** (Claude, on my own): `model: ""` means the model the
  feature used before: `engine.quickModel` (commit message, chat names, add-ons' short answers),
  `engine.helperModel` (check, release notes, add-ons' other questions), `engine.defaultModel`
  (tour, compare attempts, standup), `learning.model`, `meetings.translationModel`. Those keys stay
  as the fallbacks. Settings shows "Default (Haiku)" etc. On ChatGPT, `""` is Codex's own default.
- **Settings → AI features** is one table with fixed columns (feature · provider · model). The model
  list is only the chosen provider's (Claude Code's list, or `codex debug models`); switching the
  provider resets the model to the default. ChatGPT's option is disabled while the Codex CLI isn't
  installed and signed in (`ai.providers`), with a fixed-height footer that says why and opens Get
  started. Narrow, the two pickers go under the feature's name. The old helper/quick model rows
  (Claude Code) and the pattern-run model (Learning) point to it instead of repeating it.
- **Add-ons:** `ctx.ai.ask(prompt, { feature })` lets the built-in Git and Releases add-ons name
  their own rows (`commitMessage`, `commitCheck`, `releaseNotes`); any other add-on uses the add-ons'
  rows. Per add-on choices are not offered (Claude, on my own: two rows are enough for now).
- **JSON answers:** the tour fails with "ChatGPT's answer wasn't the tour Jig asked for…" (or Claude's)
  when the JSON doesn't parse; compare attempts shows the answer as written, says it wasn't a verdict
  and picks no attempt. The pre-commit check and release draft already fall back.
- **Caption translation** keeps Claude's warm process; on ChatGPT each caption is one `codex exec`
  call (slower: a few seconds each), and its error names the provider.
- `config.ai` is protected (D-077): it decides which plan pays.
- **Code:** `featureOneShot(feature, prompt, { cwd, system, timeoutMs })` in `main/providers`.
- **CSS gotcha found on the way:** add-on stylesheets (`jig-addon://…/ui.css`) are loaded after
  Jig's and repeat plain Tailwind utilities in the same `utilities` layer, so a plain `w-32` or
  `hidden` beats Jig's own `@xl:` container variant on the same property. Properties that change with
  the container are set only through `@max-*:` / `@*:` variants (AGENTS.md).

## D-298: ChatGPT's plan usage in the footer next to Claude's; usage per provider

- Status: accepted. Asked for by Jon, 2026-11-03 (follows D-294, D-297): he uses ChatGPT for the small
  AI features and Claude for coding, and wants both plans' usage at a glance.
- **Source** (Claude, on my own, checked against Codex 0.166): `codex app-server` answers
  `account/rateLimits/read` with `rateLimits.primary` / `.secondary` = `{ usedPercent,
  windowDurationMins, resetsAt }` (unix seconds), plus `planType` and `rateLimitReachedType`. `codex
  exec --json` only reports token counts (no rate limits), so Jig asks the app-server: a short-lived
  process, initialize, the read (without reset-credit details), then it is stopped. Signed out it
  answers "authentication required", and the group is hidden. Only the windows, plan type and
  limit-reached flag are kept; the account id in the answer is dropped, and no token is read.
- **Shape change:** `usage.get` / `usage.refresh` / `usage.changed` now carry `UsageByProvider =
  { claude, chatgpt }` (two `PlanUsage`). Codex's windows map onto the same `UsageWindow` (`minutes`
  added: 300 / 10080, which gives `5h` / `wk`), so `formatResetIn`, `formatResetShort` and
  `usageTone` serve both. One `UsageService` per provider (`read`, `source`).
- **When:** ChatGPT's is asked 4 s after start, every 5 minutes, after every ChatGPT call the provider
  layer makes (at most every 15 s: `onChatGptCall`), after the Codex sign-in, on `usage.get` when
  older than 2 minutes, and on click.
- **Footer** (Jon's design, details Claude's): Claude, then ChatGPT after a thin divider. Each group
  starts with a provider mark (an icon and "Claude" / "ChatGPT" in `provider-claude` /
  `provider-chatgpt`, new theme tokens). The bars stay green/amber/red for room/near/limit for both,
  so identity comes only from the mark. Fixed slots and tabular numbers. Narrow status bar (a
  container query on it): mark + highest share. ChatGPT's group shows only while Codex is signed in;
  the renderer remembers whether it showed (localStorage), so it reserves its space from the start.
- **Card:** a section per provider, always both (mark, plan badge, windows, resets, "From Claude
  Code" / "From Codex · updated …"), one refresh for both; signed out, ChatGPT's section offers Get
  started.
- **Tooltip fix found on the way:** `Tooltip` added `max-w-xs` and callers passed `max-w-none`; with
  two max-width classes the stylesheet's order decides, and the default won. A caller's own max-width
  now replaces the default.


## D-299: The builder's chat starts in your default permission mode

Jon, 2026-11-03: a builder chat started in *Accept edits* whatever you set (D-052). It now starts in
Settings → default permission mode (`engine.defaultPermissionMode`), like every new chat; you can
still change it in the chat. Amends D-052.

## D-300: A build has an AI-written title; its page shows the request at body size

Jon, 2026-11-04: the build page showed the whole request as its heading ("why such big font"), and
the title should be written by the AI, not the request's first sentence.

- When a build starts, the quick model (`engine.quickModel`, like chat names, D-288) writes a 2–6 word
  title from the request; it is kept as `BuildJob.title` and the builder chat is renamed "Build:
  <title>". Off with `engine.aiTitles`, and with the fake engine. Until it answers (or when it's off),
  the request's first sentence, cut at 90 characters, stands in.
- The build page: badges, the title (base size, one line), the actions, then the full request in a
  "What you asked" card at body size that scrolls inside itself. The tab, the builds list and the
  chat's build card use the same title.

## D-301: Your az login can be renamed; its name lives in `tenants.json`

Jon, 2026-11-04: he wants to name all his tenants, "Your az login" included. Amends D-282/D-283.

- The entry keeps key `default` and all it does (no `AZURE_CONFIG_DIR`, can't be removed, first in
  the list); only its label changes. The name is stored as `default.label` in
  `~/.jig/azure/tenants.json` (missing, or "Your az login", means the default name), so nothing
  changes in `config.json` or for add-ons, which already read `label`.
- `azure.renameTenant` accepts `default`, and no `label` resets a tenant to its first name
  ("Your az login", or an added tenant's display name). The pure logic is `renameTenant` and
  `isRenamedDefault` in `@jig/azure`. Checks and sign-ins that were running during a rename keep the
  new name (they used to write back the `default` they started from).
- Manage tenants (**Claude, on my own**, within Jon's "same slot" rule): Rename sits in the same slot
  on every row; your az login's last slot, where added tenants have Remove, shows "Reset name" (↺)
  once it was renamed, empty otherwise. A renamed az login's avatar uses its name's initials (not the
  signed-in tenant's), and the avatar tooltip and Manage add "Your own az login" under the name. The
  project dialog lists it as "<name> — your own az login", so it stays distinct from "Default (the
  tenant in use stays)". Claude's context says "the user's own az login (named "X" in Jig)".

## D-302: Boards are stale-while-revalidate, with the cache in the add-on's host

Jon, 2026-11-04: "the boards reload data every time I open the tab, really annoying; they should fetch
all the boards data when Jig opens, and then just refresh it in the background when I open the tab,
without locking the UI". Amends D-251/D-262/D-284.

- The host keeps every board's last answer keyed by **tenant + organisation/project/team/board**
  (`cacheKey`, lower-case): two projects following the same board share it, and another tenant's
  cards are never under it. A board followed in another tenant than the active one still answers
  "elsewhere", from the cache too.
- It is persisted in the add-on's storage as one global key, `cache` (written a second after the last
  refresh, entries of boards no project follows any more are dropped), so a restart shows cards before
  the first refresh lands.
- Start-up: a watcher `refresh` (`atStart`, every 30 min) runs `refreshAll`: every followed board of
  every project in the active tenant that's older than 2 minutes, two at a time. The `azure.tenant`
  event runs it for the new tenant. **Claude, on my own:** the 30-minute repeat keeps the cache warm
  for Claude's tools; the 2-minute skip avoids refetching what was just seen.
- One request per board at a time (`Flights`): callers join the running one; after a change
  (`update`, `create`, `remove`) a follow-up starts when it ends, so the answer includes the change.
  `update` returns `savedAt`; the view shows a moved card in its new column until an answer fetched
  after that has it there.
- The view: `cachedBoard` at once, then `refreshBoard`; `board` events from the host (refreshing, data,
  error) reach it whoever started the refresh. New data is merged (`mergeBoard`: unchanged cards and
  columns keep their objects, nothing re-renders when nothing changed) and held while a card is
  dragged. Refreshing is the refresh button's icon turning, and "updated N min ago" sits in a fixed
  `w-32` slot before it (hidden below `@2xl`); a failed refresh with cards on screen shows a warning
  icon there and keeps the cards. **Claude, on my own:** a signed-out/expired error still replaces the
  cards with the "Couldn't load this board" panel ("show that as today"), since the cards can't be
  trusted or changed until you sign in.
- Signed out or expired (`AzError.problem`): background refreshes in that tenant pause for 5 minutes
  (or until the tenant is switched to again); opening a board is your own doing and still asks az.
- Claude's `cards` tool, and the column/area lookups of `update`/`create`, use the cache when it is
  under a minute old, else fetch.

## D-303: A development request keeps the add-on the build already made

Jon, 2026-11-04: a Time add-on build was previewed, then a wish for a top-bar position and a live menu
became a development request, and the whole add-on disappeared: `propose_extension_point` removed the
build's worktree and branch. The builder then put the folder back, but the job had no worktree any
more, so every step failed with "Add-ons need git".

- When the job already has an add-on (`new-addon` / `change-addon` with a worktree),
  `propose_extension_point` keeps the kind, worktree, branch and files and only adds the proposal; the
  status goes back to `preview` when the add-on was finished, so you can accept the add-on and send
  the request separately. Revising the request works for these jobs too. Jobs without an add-on end as
  before (kind `app`, worktree removed).
- The builder prompt says to build what an add-on can do first and propose only the missing part.
- A build that has no worktree while git works says "This build has no working copy of your add-ons
  any more" (`no_worktree`) instead of asking you to install git.
- **Claude, on my own:** the Build tab's request text says the add-on below does the rest when there is
  one.

## D-304: Boards' search and filters, client-side and per board; multi-select menus

Jon, 2026-11-04: "a proper board toolbar like Azure DevOps': a search field and filters".

- A toolbar row (`h-10`) under the tab row, in every state (disabled without cards): `SearchInput`,
  then pickers Type, Assigned to, State, Tags, and Iteration and Area only when the cards have them
  (last, so nothing before them moves), Clear filters in a slot that's always there (invisible when
  off). Right side: "updated N min ago", Refresh, New card, ⋯. **Claude, on my own:** the column
  width slider and Add boards (+) moved to the tab row (a slider isn't an action, and + beside the
  tabs reads as "add a tab"); New card is a new toolbar action (opens New card in the first column)
  with the `square-plus` icon so it isn't confused with Add boards' `+`.
- Container breakpoints (Jig's rem is 13 px): below `@5xl` the pickers fold into one Filter button
  whose menu leads to each picker; the "updated" hint shows from `@6xl`, the slider from `@xl`.
- Filtering runs on the cached cards (`lib/filter.ts`): every word of the search in id, title, tags
  or person; OR within a picker, AND across pickers, as in Azure DevOps. People match by e-mail
  (`uniqueName`), else name; @Me is the active tenant's signed-in user. Columns are placed from all
  cards and then filtered, so every column stays at its width; counts read "shown/total" (WIP
  colouring still uses the total) and an empty column says "No cards match the filters".
- Stored per board in the project-scoped key `filters` (board id → filter); the search text is saved
  300 ms after typing. Values picked that no card has any more stay listed with count 0, so they can
  be unticked. Cards now also carry `tags`, `iteration` and `area` (three more fields in the query).
- Ctrl+F (and / outside a text field) on the board focuses the search; Esc in it clears.
- Menus (`ui/Menu.tsx`, and add-ons through `MenuItemInput`) gained `keepOpen`: a multi-select row
  with a checkbox that toggles in place and runs `onSelect` without closing (role
  `menuitemcheckbox`), and add-on items gained `person` (`{ name, email }` → a `PersonAvatar`). Kept
  generic so other views can use multi-select menus.
- The filter mark is in the toolbar: the funnel before the pickers turns accent and every active
  picker shows its count; the tabs carry no mark (it would change their width).

## D-305: Top bar placement and live menu entries for add-ons

Jon, 2026-11-04, from a development request the builder wrote for the Time add-on: "the small timer
as the first item on the right of the top bar (left of Suggestions), and the Time menu to hold
everything (start/stop and one click per project)".

- `contributes.topbar[]` gained `placement` and `order` (default 50, lower first among items with the
  same placement). `placement: "right-start"` renders the item first in the right-hand group, before
  Suggestions. **Claude, on my own:** the enum has only `"right-start"`; the request also proposed
  `"center"` for today's place, but add-on items already sit on the right after Jig's own items, so
  that name would describe the wrong place. Leaving `placement` out keeps today's place.
- A new slot `tools.menuGroup` (manifest key `menuGroups: [{ group, items }]`): `items` is a ui.tsx
  export `(ctx) => MenuInput[] | Promise<MenuInput[]>` called each time the group's top bar menu
  opens. Its entries go above the group's actions, a separator between; a group with only live
  entries still gets its menu. Entries are `ctx.menu`'s (`project`, `person`, `badge`, `checked`,
  `disabled`, submenus) plus `{ separator: true }` and, new for both, `{ heading }`.
- **Claude, on my own:** the menu waits for the entries rather than opening with the actions and
  growing (no layout shifts), at most 500 ms (`LIVE_MENU_TIMEOUT_MS`; the request suggested 300 ms,
  which a host call reading storage can miss on a busy machine). A synchronous export opens the menu
  without any delay. On a throw, rejection, non-list answer or timeout the menu opens with the static
  actions and a warning toast names the add-on, once per load so a broken export doesn't toast on
  every open. An answer that arrives after another menu was asked for is dropped.
- Live entries aren't in Jig's search (Ctrl+P): they exist only while the menu is open.

## D-306: Times beside a chat's messages and steps

Jon, 2026-11-04: "is there a way to get timestamps in each Claude event?" Every chat item already had
its time (`at`); nothing showed it.

- **Show times** (the clock button in the chat's top bar, setting `chat.times`, off by default): each
  row gets a fixed time column at its left, so nothing moves as events arrive. 24-hour clock whatever
  the locale (12-hour "01:02 AM" wrapped the column), the day above the time when it changes, and an
  empty slot for a turn's "Done" line (a summary, not an event). In Compact a steps line shows its first
  step's time.
- **Always on hover:** a message's hover toolbar starts with its time; a steps line's tooltip and the
  time column's give it to the second with how long after the previous step.

## D-307: Reordering the task queue by drag and drop

Jon, 2026-11-04: "Reordering items today is a pain." The Queue tab only had Move up/down in a task's ⋯,
one swap at a time, which also ignored chats and could swap a queued task above a finished one.

- **Drag a row or a chat.** A queued task's row drags (the whole row; a grip replaces its number on
  hover), and a chat card's header drags the whole chat when all its tasks are still queued. While
  dragging, the rows stay where they are (the dragged ones fade) and a 2 px accent line, drawn over the
  edge or gap, shows where they will land; the drop sends the new place to the host (`move` with a
  `slot`). Native HTML5 drag and drop with its own data type, as Boards, Links and `ArrangeList` do:
  Jig has no drag-and-drop library, and this adds none.
- **Rules (`dropSlots` in `lib/tasks.ts`).** Tasks move only among queued tasks: every slot is below the
  last task that is running, waiting for you or finished, so nothing lands above or between them. A
  single task can land inside a chat (between its tasks, or at its end: the line under its last row),
  and then continues that chat; or between chats (the line in the gap between cards), where it starts
  its own. A whole chat only lands between chats, never inside another.
- **A task moved out of its chat (Claude, on my own).** It starts a chat of its own wherever it lands
  between chats, or continues the chat it is dropped into; it never silently stays attached to the
  chat above its new place. When a chat's first task moves away, the chat's next task becomes its
  first (starts the chat), so the rest of that chat stays together instead of joining the chat above.
  Why: the drop line says which of the two you get, and a continuing task joining an unrelated chat
  by accident would run with the wrong context.
- **Keyboard and menu.** Alt+↑/↓ on a focused row steps through the same slots (into the chat above,
  then the gap, then the next chat…), and the row keeps the focus. The ⋯ menu has Move up and Move
  down (showing Alt+↑/↓), Move to top (the first slot that starts a chat) and Move to bottom (the end
  of the queue). Add-on menu items gained `shortcut` for this.
- Status: accepted. Asked for by Jon, 2026-11-04; the rule for tasks moved out of their chat is
  Claude's, on my own.

## D-308: Editing a queued message in the chat's own message box

Jon, 2026-11-04: the "Edit queued message" dialog was a plain text box: no pasting screenshots, no
files, no `@` mentions or `/` commands, and the message's attachments were neither shown nor editable.
He wants the chat's message box there, reused rather than rebuilt, without the chat-level controls.

- **One message box, two places.** The box itself (text with the `/` and `@` pickers and mention
  highlights and chips, attachments pasted, dropped or attached, the + menu, the paperclip and the
  microphone) is `ComposerBox` with `useComposerText` (`features/sessions/ComposerBox.tsx`). The chat's
  `Composer` adds its own keys (Enter sends or queues, history, Shift+Tab, Tab for the suggestion, Esc
  stops Claude), the `!`/`#` modes, talking, attempts, model, permission mode, Stop and Send; the dialog
  adds only Ctrl+Enter to save.
- **In the dialog (Claude, on my own):** the + menu has only Commands and skills, Mention a file or
  folder and Attach files: shell (`!`) and memory (`#`) run at once rather than being queued, talking
  sends by itself, and the rest of + is chat settings. Jig's own commands (`/model`, `/mcp`…) are left
  out of its `/` list, and a picked command without arguments goes into the text instead of being sent.
  Plain Enter is a new line; Ctrl+Enter saves, also while a picker is open (in the chat it now sends
  now there too, instead of taking the picker's item). Dictation writes for the dialog
  (`<chat>:queued`), not the chat's box.
- **A stable dialog.** The box has a fixed height (`fill`), with a row kept for attachments (a dashed
  "paste, drop or attach" placeholder when there are none, one sideways-scrolling line when there are)
  and the mention chips below the text, so nothing moves when a file comes or goes. The `@`/`/` list
  floats above the box over the window (`ComposerPicker` `anchor`, a portal) so the dialog's edges don't
  cut it off.
- **The contract.** `sessions.editQueued` takes optional `attachments` (the same schema as
  `sessions.send`): given, they replace the message's files; left out, it keeps them. The text may be
  empty when files remain (as when sending); both empty is `invalid_args`. Files are still checked to
  be the chat's attachments when the message is sent.

## D-309: Two chat engines: Claude Code the default, Codex optional

Supersedes the chat part of D-294 ("Claude Code stays the engine for chats"), and with it the
"Claude Code is the only engine" wording of D-002 and principle 1 for chats. The non-chat parts of
D-294 (one-shot providers, no credentials, Codex from PATH) still hold.

- Status: accepted. Decided by Jon, 2026-11-04 (plan "Codex chats in Jig", task Codex chat A): chats
  may run on OpenAI's official Codex, signed in with his ChatGPT plan, beside Claude Code. **Claude
  stays the default**; Codex is optional. A chat is Claude or Codex for its whole life, never mixed:
  you pick at creation and can't switch later. This phase only makes room for the second engine;
  nothing changes for Claude chats.
- **One `Engine` interface, one engine per provider.** `getEngine(provider = "claude")` keeps a
  singleton per provider; without a provider it is Claude's, so the existing callers (one-shots,
  `callTool`, usage, saved conversations, completion) keep working unchanged. `Engine.kind` is
  `claude | codex | fake`; `Engine.provider` says whose chats it runs. Each engine drives an official,
  unmodified CLI: Jig still never runs an agent loop of its own.
- **Capabilities, not provider checks** (Claude, on my own): `Engine.capabilities` /
  `ENGINE_CAPABILITIES` in `shared/engine.ts` (planMode, questions, subagents, rewind, fork, history,
  effortLevels, promptSuggestions), so the renderer can hide controls a provider lacks from the
  chat's `provider` alone. Codex starts with all of them off except its own effort levels (low to
  ultra, from `codex debug models`); a flag flips when its engine gains the feature.
- **Where the provider lives** (Claude, on my own): `SessionMeta.provider` on every new chat (missing
  = Claude, so every chat from before reads as a Claude chat); `engine.provider` for new chats, a
  project's `provider` overriding it, and `sessions.create { provider }` for the new-chat picker. The
  project's `model` and `effort` belong to its own provider: a chat on the other provider gets
  `engine.defaultModel` or `engine.codexModel` (default `sol`, a family alias, D-310). Forks keep the
  provider; builder, attempt, worktree and opened Claude Code chats stay on Claude.
- **Names** (Claude, on my own): the chat provider is `codex` (the engine that runs), while the
  one-shot provider stays `chatgpt` (the plan that answers, D-294). Change both together if you'd
  rather have one word.
- **Settings:** `engine.provider` and `engine.codexPath` are protected (they decide which plan pays
  and which program runs); `engine.codexModel` isn't. `codexBinary()` prefers `engine.codexPath`.
- **Tests:** `JIG_ENGINE=fake` stands in for both: `getEngine("codex")` is a `FakeEngine` with
  `provider: "codex"` and Codex's capabilities. Until the Codex engine exists, `getEngine("codex")`
  throws `codex_unavailable` outside the fake engine.
