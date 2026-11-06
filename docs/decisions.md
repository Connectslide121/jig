# Decisions

Every decision that shapes Jig, newest last. **Decided by** says who made it:

- **Jon** — decided by Jon.
- **Claude, agreed** — proposed by Claude and agreed by Jon in conversation.
- **Claude, on my own** — made by Claude while working autonomously. **These are the ones to review**;
  each says what to change if you disagree.

Add a decision with `npm run decision -- "Title"`, which reserves the next number by appending its
heading here at once; never pick the number by hand (D-361).

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
_Artifacts part superseded by D-404: Jig chats never get the Artifact tool, so the tab and its calls are gone._

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
  for (superseded for the built-in Tasks add-on by D-363). `ctx.openChat({ sessionId })` opens an existing chat.
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
  context now tells Claude to write long scripts to a file and run that instead (replaced by D-360:
  edit files with the Edit tool, not shell scripts).

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

- Status: accepted; declining at once superseded by D-336 (the request waits a minute for you first). Asked for by Jon, 2026-11-03: "I don't want a chat to stop because it's waiting
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
  as the fallbacks. Settings shows "Default (Haiku)" etc. On ChatGPT, `""` was Codex's own default (now the feature's family, D-310).
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

## D-309: Two chat engines: Claude Code the default, Codex optional _("provider for life" superseded by D-338 and D-339: a chat changes provider through a handover)_

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

## D-310: ChatGPT model families without version numbers

- Status: accepted. Decided by Jon, 2026-11-04 (task Codex chat A): ChatGPT models get family names
  like Claude's opus/sonnet/haiku: **Sol, Terra, Luna**. Jig stores the family and each call uses its
  newest version, the same way "sonnet" works; exact versions stay available for pinning.
- **Jig translates.** Codex's `--model` takes exact slugs (`gpt-6.1-sol`, `gpt-6.1-terra`,
  `gpt-6-luna`) and has no aliases. `resolveChatGptModel` (`shared/providers.ts`, pure, unit-tested)
  maps a family to the newest `gpt-<version>-<family>` model in the list Codex reports (`codex debug
  models`), else in `CHATGPT_FALLBACK_MODELS`. Versions compare as numbers (6.1 > 6, 6.10 > 6.9), per
  family: Luna may be on 6 while the others are on 6.1. Suffixed variants (`gpt-6.1-sol-mini`) are
  not part of a family.
- **At call time.** `resolveCodexModel` resolves when the call runs, and the model list is read again
  after 30 minutes (Claude, on my own), so a new release such as 6.2 is used without a setting or a
  restart. One-shots use it now; the Codex chat engine uses the same function.
- **What passes through** (Claude, on my own): an exact slug (anything with a digit or a dash) and
  `""` go to Codex unchanged. A one-word alias no model has (a typo, a retired family) runs on
  Codex's default model and logs a notice; Settings marks it "(no such family: Codex's default)".
  Any family Codex lists resolves, not only the three in the pickers (Codex also lists `astra`).
- **Pickers** list the families first, "Sol (latest) · now GPT-6.1-Sol", then a divider (a native
  `<hr>` in the select), then the exact versions. Settings → AI features is the first; the chat
  pickers follow with Codex chats.
- **Defaults** (Claude, on my own on the mapping): the family aliases replace the empty "Codex's
  default". A feature on ChatGPT without a picked model, or one you just switched to ChatGPT, uses
  the family of its Claude tier: Luna where it used Haiku (commit message, chat names, weekly
  patterns, caption translation, add-ons' short answers), Terra for Sonnet (check, release notes,
  add-ons' other questions), Sol for Opus (tour, compare attempts, standup). New Codex chats default
  to `sol` (`engine.codexModel`, D-309).

## D-311: The Codex chat engine runs `codex app-server`, mapped onto Claude's cards

- Status: accepted. Task Codex chat B (Jon's plan "Codex chats in Jig", phase B, 2026-11-04): a chat
  whose provider is Codex (D-309) runs on OpenAI's Codex. The choices below are Claude's, on my own,
  unless they come from the plan.
- **`codex app-server`, one per chat** (plan): the JSON-RPC mode OpenAI's own IDE extensions use,
  over stdio, one process and one thread per chat (`CodexEngine`, `main/engine/codex.ts`). It drives
  the user's own, unmodified `codex` (`engine.codexPath` or PATH); Jig doesn't ship it (D-294).
- **Generated protocol types, pinned** (plan): `codex app-server generate-ts` output from Codex 0.166.0
  is committed in `engine/codex-protocol/`, with that version in `version.ts`; `npm run codex:protocol`
  regenerates both. Jig doesn't ship Codex, so "pinned" means the types record the version they were
  generated from; a chat on another version runs anyway and logs the difference, because the
  normalizer reads messages loosely (the protocol is marked experimental and grows often) and ignores
  what it doesn't know.
- **Claude's cards, not new ones:** a command is a Bash card (without the `powershell -Command` /
  `bash -lc` wrapper Codex adds, so you see what it meant to run), a file change an Edit card (Write
  for a new file) per file with its diff, an MCP call the generic tool card, web search WebSearch.
  The chat's change summaries, compact step lines and diff views work unchanged.
- **Permission modes** (plan, with the sandboxes chosen here): Ask before changes = `on-request` with
  a read-only sandbox, so Codex reads freely and asks before writing (Codex's own default,
  workspace-write, would edit without asking, which isn't what the mode says). Accept edits =
  `on-request` with workspace-write, and file-change approvals Codex still sends are accepted. Don't
  ask = `never` with workspace-write and network (replaced by D-334: no sandbox). Plan mode is off in
  Codex's capabilities.
  Overrides go with the next `turn/start` (Codex keeps them), like model and effort.
- **Approvals:** Allow → `accept`, Always → `acceptForSession` (Codex remembers it for the thread;
  Jig writes no rule), Deny → `decline`. Questions and MCP elicitations wait for phase E: elicitations
  are declined, anything else refused, so Codex never hangs on a request Jig can't show.
- **Usage, no cost** (replaced by D-414: an estimate at OpenAI API prices): a turn's `result` carries
  the tokens of that turn (the difference of Codex's running totals), cache reads apart, and no cost:
  ChatGPT plans have no per-token price. The context
  meter is the last request's size against the model's window. Plan usage stays with D-298.
- **API keys** (plan): `codexSessionEnv` removes `OPENAI_API_KEY` / `CODEX_API_KEY` unless the new,
  protected `engine.codexAllowApiKey` is on (separate from Claude's `engine.allowApiKey`: they bill
  different accounts).
- **Recorded fixtures:** one real signed-in session (a reply, an approved and a declined command, an
  interrupt, an apply_patch edit with its approval, an MCP call) is in
  `engine/__fixtures__/codex/` with paths and machine names replaced; `codexNormalize.test.ts`
  replays it. Re-record when Codex's messages change.

## D-312: Personal instructions reach Codex chats from CLAUDE.md, without a copy

- Status: accepted. Jon, 2026-11-03 (project note) and task Codex chat B: personal rules have one
  source. Claude Code gets them through `~/.claude/CLAUDE.md`, which imports another file
  (`@~/.agents/AGENTS.md`); Codex has no imports. Never a second hand-edited copy, never a path
  hard-coded in Jig.
- **Developer instructions, not a synced file** (Claude, on my own): the plan allowed syncing
  `$CODEX_HOME/AGENTS.md` on launch or passing the text as instructions. Jig passes it: each Codex
  chat's `thread/start` / `thread/resume` gets `developerInstructions` = your personal instructions,
  then Jig's appended context. Nothing is written into `~/.codex`, so there is no copy to drift or to
  overwrite something you wrote there, and Codex used outside Jig is unchanged.
- **Following imports like Claude Code** (`expandImports`, `codexInstructions.ts`): `@path` relative to
  the importing file, `@~/…` from home, absolute paths; five hops at most, no cycles; not inside code
  spans or fenced blocks; an `@word` that names no file stays as written (so e-mail addresses and
  handles are safe). Claude Code's folder is `CLAUDE_CONFIG_DIR`, else `~/.claude`.
- **A generic setting:** `engine.codexInstructions` = `claude` (default: someone who uses both wants
  the same rules in both) or `off`. When Codex's own `AGENTS.md` already holds the same text, it isn't
  sent twice. The setting shows in Settings with the Codex chat settings (task D).


## D-313: Jig's tools reach Codex chats over a local MCP server, with the same names

- Status: accepted. Task Codex chat C (Jon's plan "Codex chats in Jig", phase C, 2026-11-04): Codex
  chats get Jig's MCP tools with exactly the names Claude chats see (`addon_boards_*`,
  `addon_tasks_add`, `jig_*`), because Jon's personal rules call them by name. The choices below are
  Claude's, on my own, unless they come from the plan.
- **One engine-neutral registry** (plan): a tool is a `ChatTool` (name, zod shape, handler,
  `readOnly`, `alwaysLoad`), bound to a chat by `jigToolServer(meta)` (the builder: `toolsFor`), and
  reaches the engine as `StartOptions.toolServers`. Only the Claude engine turns it into the Agent
  SDK's in-process servers (`engine/sdkMcp.ts`); `readOnly` is read from the chat's own tools. The
  fake engine's handlers come from the same servers, so `mcpServers` and `toolHandlers` are gone.
- **Streamable HTTP on 127.0.0.1, not a stdio shim:** the plan allowed either. A stdio shim would be a
  second program Codex starts, which then has to reach Jig's main process anyway (a pipe or a port),
  and would need its own packaging; an HTTP server inside main serves the handlers directly. One
  server per chat, random port, started before `thread/start`/`thread/resume` and closed with the chat
  or when Codex exits. Stateless JSON responses (no SSE, no MCP sessions) keep it small.
- **A token per chat, sent as a header** (security check): 32 random bytes, compared in constant
  time. The first version passed it through `bearer_token_env_var`; a live check showed Codex hands
  its whole environment to the commands it runs, so a command could read the token and call Jig's
  write tools without the approval card. The token now goes in the thread's `config` as the server's
  `Authorization` header: Codex doesn't write the thread's config into its rollout (checked: the token
  is nowhere in `~/.codex` after a turn), and it dies with the chat. The server also refuses any
  `Host` but its own address (DNS rebinding), any `Origin` (browsers), unknown servers and non-POST
  requests, before a tool sees the request. It never logs tokens, and no Claude or Codex credential
  goes near it.
- **Approvals as in Claude chats:** read-only tools are pre-approved in Codex's config
  (`tools.<name>.approval_mode = "approve"`) and their approval requests are accepted; other tools'
  approvals (Codex sends them as MCP elicitations with `codex_approval_kind: "mcp_tool_call"`) are the
  usual permission card on that tool's card, Always = Codex's "session" persistence. Don't ask mode
  accepts them. Checked live with Codex 0.166.0.
- **Dotted config keys** (`mcp_servers.jig`), so the user's own Codex MCP servers stay as they are.
- **Project `.mcp.json` passes only what Claude Code may start** (plan: pass project servers through):
  a repository's `.mcp.json` can name any program, and Claude Code starts its servers only after you
  approve them. Codex chats get the same set: `enableAllProjectMcpServers` / `enabledMcpjsonServers`
  minus `disabledMcpjsonServers` from the user's and the project's settings and Claude Code's
  per-project state in `~/.claude.json` (only those flags are read). Values are expanded like Claude
  Code (`${VAR}`, `${VAR:-default}`); SSE servers are skipped because Codex has no SSE transport.
- **Tool timeout 30 minutes** in Codex's config: a test run or a release through a Jig tool can take
  long, and Codex's default would cut it off.

## D-314: Picking a chat's provider: in the message box, Settings → Chats and the project

- Status: accepted. Task Codex chat D (Jon's plan "Codex chats in Jig", phase D, 2026-11-04). The
  settings layout is Jon's (2026-11-04); the rest is Claude's, on my own, unless it says otherwise.
- **Where you pick** (Claude, on my own): Jig has no new-chat dialog, a chat opens empty and you
  choose its model in the message box. So the provider is a button there, before the model picker:
  Claude or ChatGPT (ChatGPT greyed out, with "Sign in to ChatGPT on Get started…", while Codex isn't
  signed in). It can change until the chat has sent anything (`sessions.setProvider`, refused with
  `not_allowed` after a turn, a queued message or anything in the transcript), so a chat is still one
  provider for life (D-309). After that the same button is the chat's mark, without a chevron and
  without a menu, keeping its size, so nothing beside it moves.
- **Switching takes the provider's defaults** (Claude, on my own): its model and effort (the
  project's when the project runs on that provider, else `engine.defaultModel` or `engine.codexModel`
  / the new `engine.codexEffort`) and the default permission mode. A provider without plan mode gets
  Ask before changes instead of Plan only, also for new chats (`createChat`).
- **Settings → Chats** (Jon): the Claude Code section is renamed Chats. "New chats run on: Claude |
  ChatGPT" on top, then two fixed groups, Claude chats and ChatGPT chats, always both shown; the group
  of the current default has a Default badge at the far right of its header. Tester, search and
  subagent models stay in Claude chats (they are Claude subagents). AI features stays its own
  section. The ChatGPT group also holds `engine.codexInstructions` and `engine.codexAllowApiKey`
  (D-311, D-312). Rows for every chat (permission mode, names, notifications, the browser) moved to
  an "All chats" group (Claude, on my own). The section keeps its id `engine`, so links to it work.
- **Projects** (plan): "Chats run on" in the project dialog (`Project.provider`, D-309); its model and
  effort pickers list that provider's choices and reset when it changes.
- **Hidden, not dead** (plan): Codex chats don't show Plan only (Shift+Tab skips it), rewind and
  edit-and-resend, fork or Claude Code's suggestion chip. The composer has no reserved row for them:
  Claude chats show the suggestion only when there is one, so a Codex chat simply never has it.
- **Marks** (plan): the usage footer's provider marks are one component (`ProviderMark`). The chat
  header always shows the chat's mark _(removed by D-340: the composer's provider picker shows it)_. In the Chats list, once any ChatGPT chat exists, every row
  keeps a slot at the far right; ChatGPT chats show their mark there and Claude chats, the default,
  leave it empty (Claude, on my own: a mark on every row would be noise for the common case).
  _(Amended by D-348: every row shows its provider's mark, Claude's too.)_
- **Usage** (plan): a Codex chat's turn refreshes the ChatGPT meter (at most every 15 s), not
  Claude's.

## D-315: Codex chats get plan mode, questions, history, skills and suggestions

- Status: accepted. Task Codex chat E (Jon's plan "Codex chats in Jig", phase E, 2026-11-04): the
  list of gaps and the tool names `exit_plan` / `ask_user` are Jon's; how each works is Claude's, on
  my own, unless it says otherwise.
- **Plan mode** (plan; details Claude, on my own): Codex's own plan mode (`collaborationMode`) needs
  the experimental API, so Plan only is Jig's: the read-only sandbox, Jig declining every command or
  file approval Codex asks for, and `PLAN_MODE_PROMPT` (in a `<jig_plan_mode>` tag) put before your
  message in each turn. Codex presents the plan with the Jig MCP tool `exit_plan`, which raises the
  existing plan card (the permission request carries Claude's tool name `ExitPlanMode`; Codex's card
  for the call is mapped to that name too). Approving switches the mode first (the card's own
  `sessions.setPermissionMode`), but Codex takes a new sandbox only with a new turn, so when the
  planning turn ends Jig starts the next one itself (`PLAN_APPROVED_PROMPT`, hidden) and shows both
  as one turn (`mergeResults`). The stand-ins are pre-approved in Codex's config and run on Jig's
  side, so Codex never asks before calling them.
- **Questions** (plan): the Jig MCP tool `ask_user` takes AskUserQuestion's input (1-4 questions,
  2-4 options each) and raises the existing question card under Claude's tool name, so voice mode
  answers it the same way. The answers come back to Codex as one "question → answer" line each; a
  skip or a spoken answer comes back as the card's message. Every Codex chat's developer instructions
  say which Jig tools stand in for ExitPlanMode and AskUserQuestion, so instructions that name
  Claude's tools (voice mode's) work in Codex chats too.
- **History** (plan; details Claude, on my own): "Open a Claude Code chat…" becomes "Open a saved
  chat…" and lists Claude Code's conversations and Codex's threads together, newest first, each with
  its provider's mark in a fixed slot at the start of the row (the filter also matches "claude",
  "codex", "chatgpt"). Codex's come from a short-lived `codex app-server` (`thread/list`, sources
  cli, vscode and appServer: not `codex exec`, which is Jig's one-shots). Opening one reads it with
  `thread/read` and converts its items into Claude Code transcript messages (`codexHistory.ts`), so
  it becomes a chat through the same `savedChatItems`; file changes keep their diffs (the converted
  structured patch now passes through). The chat runs on the provider that saved it, with that
  provider's defaults, and continues as a copy: Codex's `thread/fork` stands in for Claude's
  `forkSession`. Jig's own text (its context, the plan-mode instructions, the turn after an approved
  plan) is left out.
- **Instructions and skills** (plan; details Claude, on my own): Codex reads AGENTS.md and its own
  skills (`.agents/skills` in the repository, `~/.agents/skills`, checked with 0.166.0) natively, and
  Jig's appended context was already its developer instructions (D-312). That context now leaves out
  what a Codex chat can't use (the jig-tester and jig-search subagents, routines and artifacts, the
  bundled-skill line about Claude Code's Skill tool). The "sync" of `.claude/skills` is a live one
  instead of copies: with the new `engine.codexSkills` (default `claude`, a switch in Settings →
  Chats → ChatGPT chats), each Codex chat's app-server gets the skill folders a Claude chat there
  would have (`.claude/skills` from the folder up to the repository root, `~/.claude/skills`, Jig's
  built-in skills) through `skills/extraRoots/set`, one root per skill, skipping names Codex already
  has (Jig's own `jig-release` would otherwise show twice). Copying into `.agents/skills` was left
  out: it would write into the user's repository and leave two copies to keep in step.
- **Suggestions** (plan; details Claude, on my own): Codex suggests nothing, so after a Codex turn
  that ended well Jig asks a one-shot for the next message (the new AI feature row "Next-message
  suggestions", ChatGPT and Luna by default; Claude chats keep Claude Code's own) with your last
  message and Codex's last reply, behind the existing `engine.promptSuggestions`. A suggestion that
  arrives after you sent something else is dropped. AGENTS.md's list of background AI calls names it.
- **Capabilities**: Codex's `planMode`, `questions`, `history` and `promptSuggestions` are on; it
  still has no subagents, rewind or fork from Jig's menus.
- **Ask before changes asks reliably** (Claude, on my own; changes D-311's mapping): the read-only
  sandbox with `on-request` left asking to the model, and on Windows Codex (Luna, low effort) often
  reported the sandbox's "access denied" instead of asking, even when told to; an approval with
  `untrusted` on a read-only sandbox still ran the command read-only. `untrusted` with the
  workspace-write sandbox asks before every command Codex doesn't know to only read and before every
  file change, and the approved command writes (checked with Codex 0.166.0 on Windows). Plan only
  keeps the read-only sandbox. The developer instructions also tell Codex to ask for escalation
  instead of giving up when the sandbox stops a command it was asked to run.

## D-316: Adding a tenant in the browser or with a code, never Windows' account window

Jon, 2026-11-04: a colleague couldn't add a tenant. Sign in opened Windows' own Microsoft account
window, not the browser, and his browser was signed in to another account anyway. "Let's see how we
can make this better."

- **Never Windows' account window.** On Windows the Azure CLI signs in through WAM (the account
  broker) by default; it offers the accounts Windows knows. Every sign-in Jig runs sets
  `AZURE_CORE_ENABLE_BROKER_ON_WINDOWS=false` (`LOGIN_ENV` in `@jig/azure`, with
  `AZURE_CORE_LOGIN_EXPERIENCE_V2=off` and `AZURE_CORE_NO_COLOR=1`), so `az login` opens the
  default browser, where you pick or add any account. An environment variable, not `az config set`:
  it changes only Jig's runs and nothing in the user's own `~/.azure` (az 2.85 reads it: `az config get
  core.enable_broker_on_windows` reports the variable as the source).
- **Or with a code** (`method: "code"` on `azure.addTenant` / `azure.signInAgain`): `az login
  --use-device-code`. The page and code come from az's own line (`deviceCodePrompt`, with or
  without a `WARNING:` prefix). The Add dialog has a "Sign in" switch (In the browser / With a code);
  the code shows large in the dialog's fixed-height sign-in box with Copy and Open page, and a hint to
  paste the link into a private window to use another account. Sign in again (Manage tenants) opens
  a small menu with both ways; the code shows in a small modal over the list, so nothing moves.
- **Claude, on my own:** the browser stays the default (the usual case and one click less); the
  code is the way out when the browser holds another account. Jig still never sees passwords or
  tokens: the code is a public one-time code the Azure CLI prints for you to type at Microsoft.

## D-317: Claude moves queued tasks and sets their chat with addon_tasks_edit

Jon, 2026-11-04: Claude couldn't mark a queued task as continuing the previous chat; the only way was
rewriting the whole stored queue with `jig_set_addon_data`, a 60 KB copy one typo would corrupt.

- **`newChat` on an edit** (Jon): false continues the chat of the task before it, true starts a new
  one, as the edit dialog's switch does. Only queued tasks. The first task in the queue can't continue
  (no chat before it); the one right after a running or finished task can continue that chat, since a
  drag may drop it there too (D-307). The tasks after it that continue its chat go along with it.
- **`moveTo` on an edit** (Jon): `"top"`, `"bottom"`, `{ after: id }` or `{ before: id }`, resolved
  to one of `dropSlots` (D-307), so Claude and the Queue tab follow one set of rules: never above or
  between tasks that ran. **Claude, on my own:** the move takes one task, as dragging its row does (it
  leaves its chat; a chat's first task hands the chat to the next one); `wholeChat: true` takes its
  whole chat, as dragging the card's header does, and only lands between chats. A task landing inside
  a chat continues it (`newChat: true` there is refused, since it would split that chat); between
  chats it starts its own unless `newChat` is false, which then continues the chat above. "top" with
  `newChat: false` means right below the tasks that ran, joining the last one's chat, or is refused when
  nothing ran. Why: matches the drop line's two choices, and a refused call says what went wrong
  instead of guessing.
- **All or nothing, in order (Claude, on my own):** a call's edits apply one after another on the
  same queue (so a move can refer to where an earlier edit put a task); any refused edit throws and
  nothing is saved. The queue's running state and other tasks are never touched, so it stays safe while
  the queue runs. The tool's description now names these options and says to use it instead of
  `jig_set_addon_data`; the tasks guidance lives in the tool descriptions, not in `jigContext`.

## D-318: The task queue waits for background work, asks once for a missing report, and takes late reports

Jon, 2026-11-04: "this happens quite a bit, we need to handle the queues better, or at least let the
AI report without having it touch the data directly." A task ended its turn with "Waiting for the
local backend and frontend to come up so I can screenshot" (a background command still running); the
queue marked it No report and sent the next same-chat task. When the chat then reported the earlier
task, `addon_tasks_report` refused (only the running task), so it edited the stored queue with
`jig_set_addon_data`. Later the queue sent task 3 into a chat whose task 1 had no report, and the
chat only learned its current task number.

- **Not finished while work goes on (Jon).** A task's turn isn't over while its chat works, waits for
  you (`needs_you`: a question or permission), or still runs something in the background. The host API
  gains `AddonChatInfo.background` (Claude Code's background tasks: shell commands, subagents, and
  monitors when Claude Code lists them) and `chatChanged` also fires when the last one ends, since the
  status may stay `idle`. **Claude, on my own:** an idle chat with background work still running counts
  as finished after 20 minutes without an answer (`BACKGROUND_WAIT_MS`), checked by the minute
  watcher. Why: a dev server started in the background never ends, and the queue must not wait forever.
- **One request for a missing report (Jon).** A turn that ends without a report (and nothing running)
  isn't No report yet: the queue sends the chat one message, as the task queue (`chats.send` gained
  `from`; the transcript shows the line with the add-on's icon, `ChatItem.fromIcon`, never as your
  message). Only when that turn also ends without a report is the task No report. At most one per task
  (`nudgedAt`).
- **It asks only for the report, never more work (Jon).** The text names task N, its title and
  taskId, asks to report it, and says not to continue the task unless the user asks. **Claude, on my
  own:** an unfinished task is asked to report partial or blocked with a one-line summary of where it
  stands, rather than only to answer with a status line, so the row gets a real status. When you
  stopped the turn yourself (Stop) or rejected a tool call or question in it, there is no request and
  the task stays No report: `AddonChatInfo.userStoppedAt` (the latest stopped result or denied
  permission), compared with the task's start.
- **Late reports through the tool, never raw data (Jon).** `addon_tasks_report` takes `taskId`: a
  chat may report its own tasks that ended No report or Interrupted (Jig closed; now flagged
  `interrupted`), never another chat's. Without it: the running task while it has no report; once it
  has one, the chat's **earliest** task still missing one, so a late report never lands on a newer
  task (Jon); with no running task, the **most recent** one missing it (Jon's first rule; the request
  and context always name the id, so the default rarely decides). A late report sets the status from
  the outcome, keeps finishedAt, time and cost, marks `reportedLate` (the row shows "reported late"
  beside the title; the status column keeps its width), and updates the task in its closed run in
  History.
- **A late failure pauses like an on-time one, unless the chat moved on (Claude, on my own).** A late
  failed or blocked report pauses a running queue when "stop when a task fails" is on, unless a later
  task already ran in the same chat. Why: that later task built on this one and its own report
  carries the news; pausing then would stop the run on stale information. Another chat's later tasks
  don't count: the failure would have paused before them had it come on time.
- **Name the missing reports (Jon).** A same-chat task sent while earlier tasks of that chat miss
  their report starts by naming them (task N, title, taskId) and asking to report them first; the
  running task's context lists them too, and says never to change the queue with
  `jig_set_addon_data`. The tool's description says the same.
- **Ask for a report (Jon).** A No report or Interrupted row has it in its ⋯ and in its details: the
  same request, sent only to an idle chat.

## D-319: Claude's browser never hangs a chat

Jon, 2026-11-04: now and then a chat sat on a browser tool for over an hour (one: 72 minutes), the
page in the view looked frozen, and Claude said it wasn't stuck: it can't see time passing. Nothing in
`main/browser/service.ts` had a time limit: `loadURL` (a dev server rebuilding holds the request),
`executeJavaScript` (a busy page, a page blocked by a dialog), `capturePage` on the hidden offscreen
window; page dialogs, `beforeunload`, crashes and hangs weren't handled, and no tool call had a limit.

- **Time limits everywhere (Jon).** A load 30 s, then it is stopped and `jig_browser_open` says "The
  page didn't finish loading in 30 s (still loading: <url>). The page may be waiting on a dev server;
  try jig_browser_read or open it again." A page script 15 s; a screenshot 15 s, then `invalidate()`
  and one more try. Every browser tool call 60 s as a backstop (`guardBrowserTool`). A result says
  how long it took from 3 s on. The limits live in `browser/deadline.ts`; `JIG_BROWSER_TIMEOUT_SCALE`
  shortens them for the e2e tests only.
- **A script timeout tells a stuck page from a waiting script (Claude, on my own).** After a script
  times out, `1` gets 3 s: a page that answers only had that script waiting (a promise that never
  settles) and the call says so; a page that doesn't is stuck and is recreated. Why: recreating a
  page that is merely waiting on a fetch would lose its state for nothing.
- **Dialogs answer themselves (Jon); they say OK (Claude, on my own).** `alert` returns, `confirm`
  returns true, `prompt` its default text, through a script DevTools adds before the page's own; one
  that still opens is accepted through `Page.javascriptDialogOpening`. `beforeunload` is left anyway.
  Each one is a console warning ("alert: … (answered OK automatically)"). Why OK: Claude clicked the
  button that asked, like a person who means it; the console line lets it see what it agreed to.
- **Crashed or stuck pages are recreated, once a minute (Jon; the limit is Claude's, on my own).** On
  `render-process-gone`, `unresponsive` or a stuck script, the old renderer is killed and a new page
  loads the same address. The same address failing again within a minute stays blank, so a page
  that loops on load can't make every call wait. The call that hit it, or else the next one, starts
  with what happened. **Claude, on my own:** a crash between calls is a note at the top of the next
  result rather than a failed call, so a following `jig_browser_open` still works.
- **Stop abandons the call (Jon).** `JigTool.handler` and `ChatTool.handler` get an `AbortSignal`:
  the engine's cancellation (`extra.signal` from the Agent SDK and the local MCP server) combined
  with the chat's own, which `abortJigToolCalls` aborts on interrupt and when the process ends. The
  browser tool stops waiting at once; whatever it still runs is bounded by the limits above, so the
  browser is usable for the next call.
- **main.log (Jon):** calls of 10 s or more, every timeout, crash, recreated page and dialog, never the
  page's text.

## D-320: Claude's browser has one page per chat

Jon, 2026-11-04: Claude's browser was one offscreen page every chat drove. When two task chats used it
at once, one chat's element numbers pointed at elements that had gone ("No such element"), and a login
in one chat sent the other back to the login page. Asked for a page per chat, a decision on sessions,
and tabs in the view.

- **One page per chat (Jon).** `main/browser/pages.ts` (`BrowserPages`) keeps a `BrowserPage`
  (`service.ts`, the page that was the whole service) per chat id, made on a chat's first
  `jig_browser_*` call. Element numbers, console, network log, window size, recovery notices and
  frames are per page. The tools keep their names and arguments; the handler's `SessionMeta.id`
  picks the page. A jig-tester subagent runs inside its parent chat and calls the parent's tools, so
  it shares the parent's page (Jon). The safety settings are unchanged (helper window, sandbox,
  contextIsolation, no preload, downloads cancelled, permissions denied, http/https/file only).
- **Closing pages (Claude, on my own: the limits).** A page closes when its chat is archived or
  deleted (`onSessionClosed`, from the session manager), from Close page in the view, after 15 minutes
  without a tool call or your input while no view watches it, and when a fifth chat needs one: at most
  4 are open, the least recently used one not being driven closes. Why: each page is a Chromium
  renderer (often 100–300 MB); four covers a queue task, its user's own chat and two more, and 15
  minutes outlasts a dev server rebuild or a sign-in you are helping with. A chat whose page Jig
  closed hears why on its next call, so Claude opens the page again instead of guessing.
- **Sessions: shared by default, separate as a setting (Claude, on my own, recommended).** Pages share
  `persist:jig-browser` (`browser.pageSessions: "shared"`), so one sign-in to the dev server serves
  every chat and Test something… chat; the incident came from sharing the page, not the cookies.
  The cost: a logout in one chat logs out the others, and chats signed in as different users replace
  each other's cookie; the docs say so and `jigContext` tells Claude not to log out unless the task
  needs it. `"separate"` (Settings → Chats) gives each page an in-memory session of its own, fully
  apart and gone with the page, for work that needs different users side by side.
- **Requests are routed per session (Claude, on my own).** A session takes only one `webRequest`
  listener per event, so with pages sharing one, each page installing its own (as before) would have
  replaced the others'. `pages.ts` installs one set per session and hands each request to the page
  with that `webContentsId`.
- **The view (Jon; details Claude, on my own).** A fixed-height strip of fixed-width tabs above the
  address row: the chat's name and project swatch, the page title muted below, a pulsing dot while the
  chat drives the page (a call runs or ended under 5 s ago). Later the same day (Jon): one line per
  tab, as tall as the main area's tab strip; the page title moved to the tooltip. The chat in front's tab is selected by
  default, else the page used last; a clicked tab holds until another chat comes to the front. Its ⋯
  (and context menu) has Open chat and Close page. The view's title row was merged into the address row
  (Console, Network and the badges sit beside the address) to keep the page tall.
- **IPC:** every `browser.*` method takes `chatId`; `browser.pages` (method and event) replaces the
  `browser.state` event; `browser.frame` and `browser.reveal` carry `chatId`; `browser.input` is
  `{ chatId, input }`.

## D-321: Teams captions retry until the meeting allows them, and the transcript falls back to Whisper on this computer

Jon, 2026-11-04: in the two daily stand-ups on Jig 0.7.0 the transcript showed only "Captions could not
start" about 1.5 s after joining, so there was no transcript, notes or actions. The same Sprinta Daily
(same link) got 627 captions on 0.3.0 the day before, a colleague on an older Jig got captions in the
same meeting, and one-to-one calls kept working. Asked for the real reason, a fix, and a transcript
made on this computer when Teams captions aren't available.

- **Cause (Claude, from the calling SDK 2.0.0's code).** For a Teams *meeting* the SDK checks your
  `startLiveMeetingCaptions` capability before starting captions; a one-to-one call checks
  `startLiveCallingCaptions` instead. The meeting's capabilities arrive a moment after the call is
  Connected; until then the capability reads `NotInitialized` (not present), and `startCaptions` throws
  "Captions feature is disabled in meeting policy." (403/45203) although nothing is disabled. Jig
  started captions the instant the call said Connected and never tried again. Since D-292 the call
  window and its Teams call agent are made at Jig's start and kept, so a join reaches Connected in about
  a second instead of after the agent's own start-up: the start now always beat the capabilities. That
  is the regression from 0.3.0. The colleague's Jig (and 0.3.0) were slow enough to win the race.
  The D-277 translation change and the chat polling don't touch the start (checked).
- **The fix (Claude, on my own: the timings).** The captions and capabilities features are taken as
  soon as the call exists. On Connected, a capability still `NotInitialized` gets up to 8 s
  (`capabilitiesChanged` ends the wait early). A failed start is retried after 2, 4, 8, 15 and 30 s
  (a capability change during a wait retries at once); "already active" (someone else started them)
  counts as running; a real restriction (`MeetingRestricted`, `UserPolicyRestricted`, `RoleRestricted`,
  Teams Premium; not `FeatureNotSupported`, see D-382) or an unsupported language stops at once and says that the organiser or the
  organisation's policy turned captions off. After `startCaptions` resolves Jig waits up to 20 s for
  `CaptionsActiveChanged`, since several SDK refusals return without an error. When running captions
  stop, Jig tries once more after 3 s. `CaptionsKindChanged` re-binds the captions object. Pure logic:
  `shared/meetingTranscript.ts` (`captionStartDecision`, `captionErrorText`).
- **The real reason is kept (Jon).** The transcript's notice says "Captions could not start:" plus the
  SDK's message and codes, the status bar's tooltip shows it, and main logs every capture status change
  (`[meetings] Meeting capture` / `Meeting capture gap`) to `main.log`. Why the red banner never showed:
  the error went to the call window's status bar, and every button there (`run()`, e.g. Unmute) clears
  it first, so it was gone before anyone looked. Caption failures no longer use the banner.
- **Local transcript (Jon; how Claude, on my own).** When Teams captions failed twice (about 6 s) or
  gave up, and `meetings.localTranscription` is on (default), the call window transcribes the call
  itself: the calling SDK's remote audio (`call.remoteAudioStreams[i].getMediaStream()`, supported in
  2.0.0) and your microphone (`getUserMedia` on the call's microphone, echo-cancelled; silence while
  you're muted) go through Web Audio at 16 kHz, are cut into pieces of 4–10 s at a 0.7 s silence
  (`SpeechChunker`), and each piece goes to dictation's Whisper worker (the Speech settings' model and
  graphics card choice, the meeting's spoken language). Audio stays in the call window's memory until
  its piece is transcribed and is never written or sent; only the text goes to main through
  `meetings.caption`, with `source: "local"`. Your microphone's lines are "You" (your real name since D-383); a piece of the call's
  audio goes to the participant whose `isSpeaking` overlaps it most (at least a third of it and twice
  anyone else), else "Unknown speaker" (`attributePiece`). More than 4 pieces waiting: newer ones are
  skipped with one notice, so the call stays smooth. The model isn't downloaded: the notice says to
  download it in Settings → Speech (no download prompt during a call).
- **Switching (Claude, on my own).** Teams captions win whenever they run (`nextSource`): the first
  Teams caption or `CaptionsActiveChanged` stops the local transcript, and a local piece mostly said
  after Teams took over is dropped (`keepLocalPiece`), so no line is written twice. The transcript
  shows "Teams captions unavailable — transcribing on this computer" once, a small **Local** mark beside
  the speaker, and the status bar "Transcribing locally". Notes, Ask Claude, actions and Claude's
  caption translation read local lines like any other; `transcriptText` marks them as transcribed on
  this computer with a speaker that may be a guess.
- **Control (Jon).** `meetings.localTranscription` (Settings through chats, the transcript panel's ⋯
  menu). It isn't an AI call in the background: Whisper runs on this computer (D-208).

## D-322: Noise suppression on your microphone in calls, Azure's deep one by default

Jon, 2026-11-04: in a live meeting colleagues asked "who is typing on their keyboard?". Jon types
during meetings; with the Teams app nobody notices, and colleagues also find his microphone overall
worse through Jig than through Teams, with the same microphone (the Logi C270 on the monitor, his
best one). Asked for noise suppression on by default, a switch, and a check of the whole mic path.

- **What was missing (Claude, from the code).** Jig's calls (start, join, answer) passed only
  `audioOptions: { muted }`: no audio effects. Teams' own app runs Microsoft's voice processing
  (noise suppression among it); the ACS web SDK only does so when the app starts it.
- **The fix (Jon: on by default; how Claude, on my own).** `@azure/communication-calling-effects`
  1.3.2 (the GA release matching GA calling 2.0.0; Microsoft pairs GA with GA, preview with preview),
  pinned exactly like the calling SDK. When a call's `localAudioStreams[0]` exists (right after
  start/join/accept, on Connected, on `localAudioStreamsUpdated`, after Devices… and on the stream's
  `audioSourceChanged`), the call window runs `Features.AudioEffects` on it: `isSupported` +
  `startEffects({ noiseSuppression: new DeepNoiseSuppressionEffect() })`. Unsupported or failing:
  `'BrowserNoiseSuppression'` (Chromium's own, weaker on typing); neither: the call goes on without it.
  It never throws into the call. One change at a time (`noiseChain`); the state follows the feature's
  `effectsStarted`/`effectsStopped`/`effectsError` events into `MediaState.noiseSuppression`
  (`deep`, `browser`, `starting`, `unavailable`, `off`). Echo cancellation's effect was left out on
  purpose: the browser's echo cancellation stays on, and adding a second effect would only add risk.
- **Loading (Claude, on my own).** The module is imported dynamically, so its 4.4 MB chunk (the audio
  part only; Vite tree-shakes the 8 MB video effects) loads in the call window on the first call. Its
  WebAssembly is inlined (base64, passed as `wasmBinary`) and its AudioWorklet comes from a `blob:`
  URL: no extra files to package and no download. The call window's CSP (`contentSecurityPolicy(…,
  meetingRoom)`) therefore adds `blob:` to `script-src` (worklets follow `script-src`); WebAssembly
  already had `'wasm-unsafe-eval'`. Other windows keep the stricter policy. The package's `exports`
  has no types entry, so `tsconfig.web.json` maps its typings with `paths`.
- **Control (Jon).** `meetings.noiseSuppression` (default true; Settings through chats). In a call:
  the dock's ⋯ menu has **Noise suppression** with a check and its state as a badge (On, Basic,
  Starting, Unavailable, Off), and Devices… has the same switch with one line saying what runs.
  Switching applies to the call at once. No layout shift: the menu and dialog keep their rows.
- **The rest of the mic path (Claude, checked).** The calling SDK opens the microphone itself with
  `echoCancellation`, `noiseSuppression` and `autoGainControl` all true (it turns them off only on
  Safari) and sets no `channelCount`/`sampleRate` (WebRTC's 48 kHz mono). Jig passes no constraints,
  and no Chromium switch touches WebRTC audio processing (only the fake engine's
  `use-fake-device-for-media-stream`, in tests). The sandboxed window changes nothing there. **But**
  "System default" was wrong for the microphone: the SDK lists devices as `microphone:<id>` and drops
  the synthetic `default` entry (marking the real default device `isSystemDefault`), so Jig's lookup
  of `"default"` never matched and took the *first* microphone, whichever Windows lists first. Jig now
  takes the `isSystemDefault` microphone. Speakers have the same bug; that fix (and naming the device
  in the selectors) is the queued "System default picks the wrong device" task (done in D-323).

## D-323: Meeting devices follow Windows' default device, name it, and remember what you pick

**Who:** Jon (the bug, what to do, and no webcam-vs-headset hint); Claude, on my own (how "System
default" is resolved, which Windows default, the test service's devices). **When:** 2026-11-04.

**Why.** In the Join dialog all three selects said "System default", yet the meeting played through
Speakers (Realtek) while Windows' default output was the JBL headphones. The calling SDK (2.0.0) never
lists a device with the id `default`: it drops Chromium's `default` and `communications` entries,
marks the real device behind `default` as `isSystemDefault`, then sorts its list by its own priority
and sets the mark on the *top* item (and later on whichever microphone is active). Jig looked for the
id `"default"`, found nothing and took the first device.

**What.**
- **"System default" = Windows' default device** (Settings → Sound, "Default device"), not the default
  *communications* device. The SDK itself filters Chromium's `communications` entry out, and Teams on
  the web runs on the same stack, so following `default` is what Teams does; Jon's report also names the
  default device as the expectation. Jig reads it from `navigator.mediaDevices.enumerateDevices()`: the
  real device whose label ends the `default` entry's ("Default - Headphones (…)"), else the one in its
  `groupId`, else the text after " - " (`windowsDefaultName`, `shared/meetingDevices.ts`). Then
  `resolveDefault`: that name, else the SDK's `isSystemDefault`, else an id `default`, else the first.
  Microphone and speakers both; the camera's default is the first camera (Windows has none).
- **One place picks devices.** `MeetingMedia` keeps the picks per kind (`""` = System default) and
  applies them before joining, in Devices…, before placing or answering a call, and after a device
  change; `selected()` returns the picks, so Devices… opens on "System default (…)" when that is in use.
- **The selects name the device:** "System default (JBL Tune 775NC)" — `shortDeviceName` keeps the
  product in Windows' "Kind (Product)" names and drops a "2- " prefix and a USB id. The selects are
  `w-full min-w-0 truncate` in fixed columns, so a long name is cut off (full name in the tooltip) and
  nothing moves. A pick that is unplugged shows "Not connected (default is used)", as in Speech.
- **Device changes in a call:** the SDK's `audioDevicesUpdated`/`videoDevicesUpdated` and Chromium's
  `devicechange` (which also fires when Windows' default changes without a device coming or going),
  debounced 400 ms, re-resolve the list: System default moves to the new default, a missing pick falls
  back to it and comes back when it is plugged in again, the call's camera switches its source, and open
  dialogs relabel (`MeetingMedia.onDevices`).
- **Remembered picks:** `meetings.json` `devices` {microphone?, speaker?, camera?: {id, name}}, written by
  `meetings.devices` (call window only) when you join from the dialog or apply Devices…. System default
  isn't stored. Next time a remembered device that isn't connected falls back to System default, the
  status line says "<name> isn't connected, so System default is used.", and it stays remembered unless
  you pick another device for that kind.
- **No microphone-quality hint (Jon).** The planned "your microphone is the webcam's; the headset may
  sound better" hint was dropped: Jon's webcam mic is his preferred microphone. Never steer people away
  from a webcam microphone.
- **Test meeting service:** sample devices with neutral names (Contoso Cam HD, Contoso Headset,
  Fabrikam Audio), so the dialogs, Devices… (now enabled there) and the e2e test show real lists.

## D-324: Screen sharing never sends your computer's sound; the share dialog says so instead of a switch

**Who:** Jon (asked for a "Share sound" switch, off by default, and not to ship one that does nothing);
Claude, on my own (the finding, the wording). **When:** 2026-11-04.

**Why.** Jon thought his computer's sound was shared with his screen. It isn't, and it can't be in a
supported way:
- Jig answers Electron's `setDisplayMediaRequestHandler` with `{ video: source }` only, never `audio`,
  so no system sound reaches the SDK.
- The calling SDK (2.0.0, and the newest 2.1.1-beta.1) only sends screen-share sound when its internal
  config `enableAudioSharing` is on. It is off by default and turned on only for Microsoft's own Teams
  clients (internal platform overrides) or by Microsoft's remote config; no `CallClientOptions` field or
  `startScreenSharing` option sets it. With it off the SDK never creates the audio mixer that adds
  "SystemAudio" to the call, so `startScreenSharing(new LocalVideoStream(streamWithAudio))` would send
  the picture and silently drop the sound. Microsoft's feature table lists "Share system audio during
  screen sharing" for the web SDK, but there is no public API for it.
- Windows loopback (`audio: "loopback"`) captures everything the computer plays, including the meeting
  itself, so the others would hear themselves; there is no supported way to leave the call out.

**What.**
- **No switch.** The "Share a screen or window" dialog's footer says **"Sound isn't shared, only the
  picture"** (muted-speaker icon, hint colour) beside Cancel. It is in the footer, so nothing moves.
- The display-media handler keeps answering video only, with a comment pointing here. No
  `sound` argument on `meetings.selectShare`.
- **Likely reason for the impression:** without a headset the microphone picks up the speakers, so a
  video played while sharing is heard through your microphone (deep noise suppression, D-322, damps
  steady noise but not music or speech).
- **Revisit** when the SDK gets a public option for system audio (check its changelog on updates):
  then add the switch, off on every open, and pass `audio` only when it is on.

## D-325: A release rerun after failed e2e tests runs only what failed and what the fixes touch

**Who:** Jon: when a run fails, the next one shouldn't run the whole e2e suite, only what needs to be
rerun.

- A whole-suite `npm run e2e` on a clean checkout that fails writes `.jig-e2e-failed.json` (ignored):
  the commit and the spec files with a failed test (from Playwright's JSON report; flaky tests and
  errors outside a test don't count; with no failed test nothing is recorded and the next run is whole).
- `npm run e2e -- --resume`, which the release runs, reruns those specs plus the ones the commits since
  need (`e2e/affected.json`, the same selection as `npm run e2e:changed`, the release's own files left
  out), when that commit is an ancestor of HEAD and the tree is clean; otherwise the whole suite. When
  they pass it records a whole-suite pass for HEAD (D-272), since every other spec passed on the earlier
  commit and nothing since affects it; when they fail it records the new failures for HEAD.
- Trade-off (Claude, on my own): a change `e2e/affected.json` doesn't map runs its fallback specs, not
  the whole suite, as with `npm run e2e:changed`.

## D-326: An all-queues dashboard in the Tasks add-on, and addon_tasks_list across projects

**Who:** Jon: "I have 2 queues running and keep switching project to see their progress." One overview of
every queue, opened from the Tasks add-on itself as a main-area tab. Also Jon: a chat in another project
couldn't find a task in this project's queue (`addon_tasks_list` listed only the chat's own project, and
the raw data was cut off at 60 KB).

- The Tasks add-on contributes a `dashboard` tab (`workbench.tab`), opened with `ctx.openTab("dashboard")`
  from an **All queues** button (layout-dashboard) beside the Tasks view's project picker and from the
  picker's first item. Same params, so opening it again focuses the open tab.
- A summary strip in six fixed slots (queues running, tasks running, needs you, queued, finished today,
  cost today), then a card per project with tasks, sorted needs you, running, paused with tasks queued,
  finished, the rest (projects keep their order within). Every card has the same rows and height: header
  with the state badge at the far right, a segmented bar, the run's counts, time and cost, the current
  task (its chat, time, and why it needs you), the next two queued titles and the last finished task.
  Empty rows keep their slot. A footer counts projects without a queue; with no queue anywhere, one
  message with Add tasks.
- Click a card: the Tasks view on that project's queue (a request the view takes when it opens; it
  overrides the shown project like the picker does). The chat link opens the chat. Start/Pause is a
  hover action; right-click or ⋯ has Open queue, Open current chat, Start/Pause.
- Data: the host's `dashboard` builds the cards from the stored queues and histories only (no chat
  reads); the logic is in `lib/dashboard.ts`. It refreshes on the host's `changed` event, like the view;
  only elapsed times tick locally.
- "Why it needs you": `AddonChatInfo.waitingFor` (`question`, `plan` or `permission`, from the chat's
  pending card). The host reads it once when a task's chat starts needing you and keeps it on the task
  (`Task.waitingFor`, dropped when it works again). (Claude, on my own: one read on that change rather
  than none, so the card can say what you're asked.)
- The run a card counts (Claude, on my own): the open run's tasks plus the ticked queued ones; with no
  open run, what Start would take, or else the last run's tasks. "Paused" also covers a queue with
  tasks queued that was never started (Start is what it needs either way). Finished today counts the
  queues' and history's tasks finished since local midnight, each once.
- `addon_tasks_list` takes `project` (name or id) and `all` (every queue, one line per task: id,
  status, title, under the project's name and id), so any chat finds a task and edits it with
  `addon_tasks_edit` and its `project`.

## D-327: Teams chats as bubbles, and senders named from the chat's members

**Jon** asked for a real chat layout ("shouldn't all be aligned on the left") and for names instead of
"Someone"; the details are **Claude, on my own**.

- One `ChatPanel` (`features/meetings/Chat.tsx`) draws the lobby's chats and the in-call Chat panel.
  Your messages are on the right in `bg-accent-soft` bubbles, everyone else's on the left in
  `bg-raised` ones. Bubbles are `rounded-2xl` with the corner toward the sender squared on a group's
  first bubble and softened between bubbles of one group. The time sits inside the bubble's bottom
  right corner (a spacer on the last line keeps text from running under it); hover shows day and time.
- Grouping and day dividers are pure (`chatTimeline`, `chatDayLabel` in `shared/meetingChat.ts`): one
  sender's messages group while each follows the one before within 5 minutes (`CHAT_GROUP_GAP_MS`) on
  the same local day; senders are told apart by id (then name), so two people with one name don't
  merge. Only the first message of someone else's group has their picture and name; yours have
  neither. Dividers say Today, Yesterday, the weekday within a week, else "Oct 27" (with the year when
  it isn't this year).
- Width by the scroll area's container, not the window: the messages sit in a centred `max-w-3xl`
  column (the wide lobby pane stays readable); bubbles are at most 70 % of it from `@md`, and in a
  narrow panel (the call's ~300 px Chat) others' bubbles may fill the column beside the picture while
  yours stop at 85 %, so they stay visibly on the right.
- Scrolling: the view follows new messages while you're at the bottom. Scrolled up, it keeps the first
  message in view at the same place when messages are added above it or drop off the top (Graph's
  newest 50 move on), so nothing you read moves.
- Web links in messages are clickable (opened with `app.openExternal`); `(image)`/`(attachment)` are
  muted italic.
- Names: Graph's `from.user.displayName` is empty for some senders (seen in a one-to-one chat with
  someone from another organisation; guests likely the same). The chat's members still name them, so
  `senderName` tries Graph's name, then the members' name for that user id, then (one-to-one, not
  you) the other person (`ChatDirectory.peer`, from the members or the chat's title: the call's peer
  name), and only then "Someone". `MeetingAuth` keeps a directory per chat: seeded from the chat
  list's `$expand=members`, otherwise read with `GET /chats/{id}?$expand=members` (Chat.Read) only when
  a message has a sender it can't name, at most every 5 minutes per chat; cleared on sign-out. The chat
  list's last-message preview uses the same lookup. Pictures keep coming from `meetings.photo` by the
  sender's id, which Graph gives even when the name is missing.
- `chatChanged` also compares senders, so a meeting's kept chat picks up a name found later.

## D-328: Pictures and shared files in Teams chats

**Jon** asked for images and attachments in the meeting chat and the lobby's Chats; the details are
**Claude, on my own**.

- The message model (`MeetingChatMessage` in `shared/meetingChat.ts`) keeps where things are, never
  their bytes: `images` (a picture Graph hosts: chat id, message id, hosted content id and, when the
  `<img>` gives it, width and height) and `files` (`reference` attachments, i.e. SharePoint/OneDrive
  files, and other attachments with an https address as links; name and URL). `chatImages` only
  accepts `https://graph.microsoft.com/…/chats/{chat}/messages/{message}/hostedContents/{id}/$value`
  with a valid Teams chat id and safe ids; Teams emoji (`<img itemtype=…Emoji>`) become their
  character; other pictures still read "(image)". Replies (`messageReference`) are left out; cards
  without an address read "(attachment)". A message that is only pictures or files has `text` "".
- Pictures are read by main (`meetings.chatImage`, lobby or call window): `GET
  /chats/{id}/messages/{id}/hostedContents/{id}/$value` with the Chat.Read token Jig already has, so
  **no new consent**. Only PNG, JPEG, GIF and WebP (no SVG: it can carry scripts), at most 10 MB,
  returned as a data URL and kept in memory (64 MB, oldest out first; cleared on sign-out). The
  windows never see the token; each window also keeps its last 40 pictures.
- In the bubble the words come first, then the pictures and files in one `w-60` column, then a line
  for the time. A thumbnail's box has its final shape from the start (Teams' width/height, the ratio
  held between 0.6 and 2.4; a 4:3 box when Teams gives none), with a spinner while it loads and
  "Picture unavailable" when it can't, so nothing moves. The whole thumbnail opens a viewer
  (`Dialog` + `ImagePreview`, rendered on the page so no panel clips it).
- Files are one row each: `FileIcon` by name (a link gets the link icon), the name, an open-outside
  mark at the far right; the whole row opens it with `meetings.openChatFile`, which accepts https only
  (schema and handler) and uses `openExternal`.
- The chat list's preview says "Sent an image" or "Sent a file" when a message has no words. Graph's
  `lastMessagePreview` has no attachment names, so "Sent a file: name" would need reading every chat's
  last message; not done.
- The test meeting service has a Contoso diagram (a picture it serves itself) and Shop spec.docx in
  the meeting chat and in Portal planning.

## D-329: People's Teams status on their picture in Meetings

**Jon** asked to see whether people are Available, Busy, Away… like in Teams; the details are
**Claude, on my own**.

- Main reads presence from `POST /communications/getPresencesByUserId` (batches of 650) with
  **Presence.Read.All** (delegated; users can normally consent themselves), silently, and reuses a
  read for 30 seconds so the lobby and the call window share it. Through `meetings.presence` the
  windows get availability and activity by object id, never a token. The pure part (ids, batches,
  Graph's values as a Teams-like status and words) is `shared/meetingPresence.ts`.
- Consent: Presence.Read.All is asked for separately (`meetings.presenceConnect`), never bundled into
  the chat or calendar sign-in, so an administrator who approved those but not presence doesn't break
  them. The Chats list's ⋯ menu has **Show Teams status…** while it isn't allowed; refused or failing,
  there are simply no dots (no error).
- Each window keeps one store (`features/meetings/presence.tsx`): the ids its views show, read
  together soon after they appear and every 60 seconds, only while the window is visible
  (`document.visibilityState`); hidden or closed, nothing is asked.
- The dot sits on the avatar's bottom right, over it, so nothing moves when presence loads: Available
  `bg-success` with a check, Busy/In a call `bg-danger`, Do not disturb `bg-danger` with a minus,
  Away/Be right back/Out of office `bg-warning` with a clock, Offline a `border-hint` ring, unknown
  nothing. Glyphs are cut out in `text-surface`, and the ring around the dot is the background the
  avatar sits on. Existing tokens only (every theme has them). Tooltip and aria-label: "Name: Busy, in
  a meeting"; In a call and Presenting read as the status itself, like Teams.
- Where: one-to-one chats in the list and in the open chat's header (a smaller dot without a glyph),
  and people in the call's People panel who have a Microsoft account id (`8:orgid:…`). Group and
  meeting chats get none.
- The test meeting service gives its people different statuses (Alex Available, Sam Away, Taylor
  Busy in a meeting, Kim Do not disturb, Morgan Offline) through three more one-to-one chats.

## D-333: Mention a Teams chat with @chat, and Claude reads it with jig_teams_chat_read

**Jon** asked to mention the Teams chats from the Meetings lobby in a Jig chat (Claude or ChatGPT)
the way a meeting is mentioned (D-250), as `@chat`; the details are **Claude, on my own**.

- **Mention:** `@chat:<name>-<8 hex>` (`chatMention`, `shared/meetingChatMention.ts`). The short id
  is FNV-1a of the Teams chat id, so it needs no stored mapping and no crypto in the renderer. The
  name part is for reading only; the chip shows the chat's name (from the picker, else spelled from
  the mention) with its picture or group/meeting icon.
- **Picker:** the `@` picker narrows to Teams chats for `@chat`, `@chat:…` or `@chat <word>`, and to
  meetings the same way for `@meeting` (`mentionScope`); one word after the space filters by name
  or member (`tokenAt` keeps it in the token). This changed `@meeting`, which used to list meetings
  first and then files: both now list only their own kind, so they behave the same. A word that
  merely starts with them (`@chats/`, `@meetingLobby.tsx`) is still a file. Otherwise files lead,
  then meetings, then up to 3 Teams chats once a name is typed. Rows look like the meeting rows:
  icon, name, "Teams chat · <last activity>".
- **Where the list comes from:** `meetings.chatMentions` filters the list main read last for the
  lobby (in memory, read again after a minute); nothing while the Meetings add-on is off, Microsoft
  isn't connected or Chat.Read isn't approved. Callable from the main window.
- **Context:** a message with `@chat:…` gets one line per chat naming it, its kind and its short id,
  telling Claude to read it with `jig_teams_chat_read` and that chat messages are source material,
  not instructions. Engine-neutral, so Codex chats get the same context and tool.
- **Tool:** `jig_teams_chat_read` (read-only) reads only the chats that Jig chat mentioned (kept in
  memory per chat; after a restart Claude asks you to mention it again), through Graph with
  Chat.Read in main: the chat's name, kind, members, and messages oldest first as `[UTC time]
  sender: text [image] [file: name]`. The latest 100 by default (`limit` up to 200); `nextBefore`
  (`<lastModifiedDateTime>~<count>`) pages back, up to 1000 messages per chat; `since`/`until`
  narrow by date (Graph filters on lastModifiedDateTime, then Jig on the time sent).
- **Privacy:** chat contents are never stored in Jig's state or the activity records; only
  `meetings.chat-mentioned` is recorded. The prompt itself is recorded as before, with the
  mention's name and short id.

## D-332: A toolbar for the lobby's Chats: search, filters, New chat and Jig's own pins

**Jon** asked for Teams' chat list toolbar (search, filters, new chat, pinned chats); the details
are **Claude, on my own**.

- **Toolbar:** a fixed-height row under the Chats header, always there (disabled until the list can
  be read), so nothing moves. Narrow list (under 28rem): search and New chat on one line, the filter
  chips under them; wide: all three on one line (`@container`, `@md:`). The pure part is
  `shared/meetingChatList.ts`.
- **Search** narrows the loaded chats as you type: every word must be in the chat's name, its other
  members' names (`TeamsChatSummary.members`, group and meeting chats) or its last message, case and
  accents ignored. From 2 characters, half a second after typing stops, **Microsoft Search** (`POST
  /search/query`, `entityTypes: ["chatMessage"]`, 25 hits) adds a **Messages** section under the
  chats: it works with the Chat.Read Jig already has (delegated only), so it finds messages in chats
  beyond the 50 loaded at no extra consent. Hits without a `chatId` (channel posts) are left out; a
  hit opens its chat. Microsoft's `<c0>` marks are shown as plain text.
- **Filters** like Teams': Unread, Chats (one-to-one and group), Meetings (Graph's `chatType:
  meeting`). One at a time; pressing the pressed one turns it off. An empty result says so in the
  list's space.
- **New chat** is a modal (`NewChat.tsx`) reusing Call…'s people search (`usePeopleSearch`): pick
  one or more people (a fixed-height line of chips, a fixed-height list), an optional group name for
  3+ people, and a first message. Main (`meetings.chatCreate`) first opens the one-to-one chat you
  already have with one person (no new permission needed); otherwise `POST /chats` (oneOnOne or
  group, every member, you included, an owner; Graph also returns an existing one-to-one), then
  sends the first message with ChatMessage.Send. Call…'s "no Teams chat yet" now offers
  **Start one…**, which opens New chat with that person.
- **Permission:** Chat.Create is asked for on its own (`meetings.chatCreateConnect`, like presence
  in D-329), never bundled into the chat sign-in. Silently, Jig takes a token for Chat.ReadWrite
  first (it covers creating chats, and is what Jon asked his administrator for), then Chat.Create.
  Until either is approved the modal says an administrator has to approve it, with Connect…, and
  Start chat works only for one person you already chat with.
- **Pins are Jig's own.** Microsoft Graph has no API for the chats a user pinned in Teams: checked on
  2026-11-04, `chatViewpoint` has only `isHidden` and `lastMessageReadDateTime` in v1.0 and beta, and
  `pinnedChatMessageInfo` is pinned messages inside a chat. So Pin/Unpin (a row's hover action over
  its time column, and its context menu) keeps Jig's pins in `meetings.json` (`chatPins`, chat ids in
  pin order, at most 50, typed and atomic through `MeetingStore`, host-managed like the other
  meetings data). A **Pinned** section sits above the rest ("In Jig only"; its tooltip says pins
  don't sync with Teams). Pinned chats older than the 50 newest are read one by one (up to 10) and
  count as read up to their last message (Graph gives no read time outside the list).
- The test meeting service has 9 chats (5 one-to-one, 2 groups, 2 meeting chats), message search,
  chat creation, and `JIG_MEETINGS_CHAT_CREATE=consent` for the approval-missing state.

## D-330: Claude or ChatGPT per task queue, and per task

**Jon:** "I would like to select the provider in the task queues, like ChatGPT in Podium and Claude in
Jig queues." The details are **Claude, on my own**.

- **Add-on API:** `api.chats.create` / `send` take `provider` (`"claude"` | `"chatgpt"`) and `model`
  for a **new** chat only; with `sessionId` both are refused (a chat keeps its provider for life,
  D-309). Add-ons say "chatgpt", main maps it to the `codex` engine. Main validates them in
  `addons/chats.ts` (it doesn't cross the renderer's IPC, so there is no `validate.ts` schema): a known
  provider, a model id of letters, digits and `.:-[]_`, and for ChatGPT a sign-in check
  (`providerStatus`), failing with "ChatGPT isn't signed in: …". `createChat` takes the model instead
  of the provider's default. `chats.get` tells `provider` and `model`; `AddonProject.provider` is who
  runs the project's new chats (its own, else Jig's), so add-ons can resolve a default.
- **SDK UI:** `ProviderMark` and `useChatGptReady()` from `@jig/sdk/ui` (the usage footer's mark,
  D-298), menu items take `provider` (the mark in front) and `detail`, and `ctx.openGetStarted()`.
- **The queue's choice:** `Queue.provider` (none = the project's default), set from **Runs on** in the
  Tasks view's header beside the project picker: a menu (Jig's menus) in a fixed slot; in a narrow
  view the slot shows the mark only. "Default" names what it stands for in the menu.
- **Per task:** `Task.provider` / `Task.model`, in Add tasks per chat (it goes on the chat's first
  task; a split chat keeps it) and in Edit, as one Runs on menu with each provider's models in a
  submenu ("Default model", then the families, "(latest)"). A model alone names its provider
  (`providerOfModel`). A task that continues a chat runs on that chat's provider: Edit shows it
  greyed out with the reason, the tools refuse a choice there (`checkProviderChoices`), and a stored
  choice of a task that is later moved into a chat is ignored (not cleared), so it comes back if the
  task starts its own chat again.
- **Resolution** (`runsOn`, pure, tested): once started, the provider its chat ran on (`ranOn`,
  `ranModel`, from `chats.get` for a continued chat); a task that continues a chat, that chat's; else
  the task's choice, the queue's, the project's default. Run again and runs from History keep the
  choice; putting a task back forgets where it ran.
- **Signed out at run time:** creating the chat fails; the task ends **Blocked** with "ChatGPT isn't
  signed in: sign in on Get Started, then run it again" (`startFailed`), so it pauses the queue when
  "stop when a task fails" is on, like a blocked report. Other start failures stay errors.
- **Showing it:** every task row and chat card has the provider's mark in one fixed column before the
  row's ⋯ (the effective provider, always shown; the tooltip says from where), the details have a
  "Runs on" fact with the model, and the All queues card shows the queue's provider beside its state.
- **Codex chats:** nothing new was needed: the queue's context reaches every chat through
  `turnContext`, and `addon_tasks_report` is on the `jig` MCP server Codex chats get (D-313). The fake
  engine's Codex chats now report over that MCP server, so the e2e test covers it.
- **Claude's tools:** `addon_tasks_add` tasks take `provider` and `model`; `addon_tasks_edit` takes them
  per task (`"default"` / `null` back to the queue's choice) and `runsOn` for the queue (tasks then
  optional); listings say who runs each task and the queue's Runs on.
- The fallback-provider task (carry on with the other provider when a chat hits its limit) hadn't
  landed; it should keep `ranOn` true to the chat that actually ran.
- The queue's Runs on picks a model too since D-408 (`Queue.model`).

## D-331: A change runs its affected e2e specs; the release fixes the tests that fail

**Who:** Jon, 2026-11-04, after the 0.9.0 release met three failing specs that the changes in it had
written or changed but never run. Extends D-258 and D-325.

- **Before committing** a change to the app or an e2e spec: `npm run verify` and `npm run e2e:changed`
  (the specs `e2e/affected.json` picks; in Jig through the Tests add-on, so Jon sees it); fix what fails.
  Docs-only and unit-test-only changes run nothing. Unit tests still run at release (`npm run check`).
- **The whole suite runs only at release**, never at other moments (Jon): only a run on the release's
  own source proves it clean. D-272's skip stays, since it needs a full pass on that same source.
- **Failing tests in a release are the release's to fix** (the jig-release skill's "When tests fail"):
  sort each one (outdated test, test bug, regression in the released changes, environment), never skip
  or delete a test or loosen the suite's retries/timeouts, prove the fix on the failed specs, commit and
  resume. Stop and report after two rounds or when a fix needs more than a small app change. Flaky tests
  don't block; they're reported with a task offered. Claude, on my own: the two-round limit and the
  four kinds.

## D-334: Codex's Don't ask runs without a sandbox, and silent commands are flagged

**Who:** Jon, 2026-11-04, after a ChatGPT queue task in Don't ask couldn't run a single command.
Replaces D-311's Don't-ask sandbox (`never` with workspace-write and network).

- **What happened:** Codex 0.166.0 ran the chat with `never` and workspace-write. With
  `[windows] sandbox = "elevated"` in `~/.codex/config.toml`, every command (PowerShell, then cmd)
  went through Codex's elevated Windows sandbox and hung for minutes with no output. The fallback,
  `jig_terminal_run`, was refused: "MCP tool call requires approval, but approval policy is never".
  The day before, a Don't-ask chat with `never` and danger-full-access ran 247 commands without trouble.
- **Don't ask = `never` with danger-full-access** (`sandboxPolicy: { type: "dangerFullAccess" }`, at
  `thread/start` and on each mode switch's `turn/start`), like Claude Code's bypassPermissions, which
  has no sandbox either. The other modes are unchanged.
- **Jig's tools run in it without extra config.** Why the call was refused: Codex decides an MCP
  tool's approval from its `approval_mode` (Jig pre-approves only `readOnly` tools); `auto` with no
  annotations needs approval, and inside a sandbox `never` turns that into a refusal. With full access
  Codex runs MCP tools unasked. Checked live with 0.166.0: an unannotated tool is refused with
  workspace-write + `never`, runs with danger-full-access + `never`, and also runs when a chat started
  in Ask before changes switches to Don't ask (the turn's overrides decide). So Jig doesn't pre-approve
  all its tools in the thread's config, which would also have outlived a switch back to a stricter mode.
  Claude, on my own: the live check and not adding `default_tools_approval_mode`.
- **A silent command is flagged in the chat** (`SilentCommandWatch`, `engine/codexSilentCommands.ts`):
  a Codex command that has printed nothing for 3 minutes gets a warning notice with the command ("press
  Stop to end the turn if it hangs"); when it finishes, the same notice (by key) says after how long.
  Codex keeps waiting either way; Jig doesn't stop the command. Not in the queue report: the report is
  the chat's own, so the chat's agent would have to mention it. Claude, on my own: the 3 minutes and
  the wording.

## D-335: View is the top bar's one layout menu; no layout or ? button

**Who:** Jon, 2026-11-04. Builds on D-174 (grouped top bar menus).

- **One layout menu.** The top bar had two: View (Reset layout, Save layout as…, Show a hidden view…,
  three Toggle… actions, Layouts ›) and the layout icon button on the right (the regions as checked
  entries, Views ›, Layouts ›, Reset layout). They are merged into View: **SHOW** (Left sidebar, Right
  sidebar, Bottom panel as checked entries with their shortcuts; Views ›), **LAYOUT** (any other layout
  action, Layouts › with Save layout as… and Manage layouts…, Reset layout last), then **APPEARANCE**.
- **Nothing twice.** The region entries replace the three Toggle… actions in the menu, Save layout
  as… lives only in Layouts ›, and Views › covers "Show a hidden view…" (a hidden view shows unchecked
  and opens from there). Those actions stay registered for search and shortcuts. Claude, on my own:
  dropping "Show a hidden view…" from the menu, and drawing the region entries without icons so their
  checks line up in one column.
- **Fewer icon buttons.** The layout button and the `?` (What Jig can do) are removed from the right
  of the top bar; What Jig can do stays in the Jig menu (top left).

## D-336: "Don't ask" safety checks wait a minute for you, then are declined

**Who:** Jon, 2026-11-04 ("I'd rather have it ask me, but wait only for a minute max; if I don't
answer, then decline"). Supersedes the "declines at once" part of D-293; the rest of D-293 stays
(deny, not allow; the denial message; questions and plans just wait).

- **Ask, then decline.** In "Don't ask" mode a request Claude Code still sends (its own safety
  checks, e.g. "Dangerous rm operation on critical path") shows the normal permission card with a
  countdown ("Declines in 0:42", a fixed slot at the right of the Allow/Deny row, tabular figures, so
  nothing moves). The chat is "Needs you" meanwhile, which raises the usual desktop notification and
  taskbar flash. An answer in time is used as is. Without one, Jig resolves it with D-293's denial
  message, sends `permission_resolved` with `timedOut: true`, and the card turns into the warning
  notice "Declined automatically in Don't ask mode: … (no answer within a minute)". Claude carries on.
- **The wait is a setting:** `engine.dontAskWaitSeconds` (default 60, 0–600; 0 = decline at once
  with D-293's notice, as before), in Settings → Chats → All chats ("Don't ask: wait for you").
  Read when the request arrives. **Not protected** (D-077): it never approves anything, it only
  decides how long a request waits before it's declined. Claude, on my own: the name and place
  (`engine.` beside `defaultPermissionMode` rather than a new `permissions` section), the 600 s
  cap and the choices in Settings (decline at once, 30 s, 1, 2, 5 minutes).
- **Timers never leak:** the pending request keeps its timer; answering, an aborted request (Stop,
  interrupt), the process exiting (stop, archive, delete, quit) all clear it, and the timer itself
  does nothing once the request is gone.
- **The task queue keeps going.** The Tasks add-on already treats a chat that needs you as
  `needs_you` (an active task, not blocked, not skipped; "A queued task needs you" notification);
  when the request times out the chat works again, the task is running again and the queue waits for
  the turn as usual. A timed-out denial is not "you rejected a tool call": `userStoppedAt`
  (`main/addons/chats.ts`) ignores it, so a turn that ends without a report still gets the queue's
  request for one (D-318). A queue chat in Don't ask can lose at most the wait per safety check.
- **Codex chats unchanged:** in Don't ask, Codex runs with approval policy `never` and has no
  equivalent safety prompt (D-334); should one ever reach `askPermission`, it gets the same wait.
- Tested with the fake engine's "safety check" message (asks in every mode), unit tests in
  `manager.test.ts` and `e2e/dont-ask.spec.ts` (2 s wait).

## D-337: ChatGPT chats get the search and tester helpers as tools, each on its own model

**Who:** Jon, 2026-11-04 (he expected ChatGPT chats to have the same per-role models as Claude chats:
Default, Subagent fallback, Tester, Search). How it's built: Claude, on my own.

- **Tools, not subagents.** Codex has no subagents, so the roles are two Jig tools on a Codex chat's
  `jig` server: `jig_search_code({ question, thoroughness })` and `jig_test_page({ url, steps })`.
  Each runs one separate `codex exec` (Codex's own CLI and sign-in; no agent runtime of Jig's own)
  in the chat's folder, stopped with the chat, counted on the ChatGPT usage meter.
- **Scoped.** Search: read-only sandbox (no network), Codex's shell for reading, the user's config
  ignored and no MCP servers (no Jig tools), no AGENTS.md; on Windows the `unelevated` sandbox,
  since without a mode Codex refuses every command and the user's mode lives in the ignored config.
  Tester: no shell, one MCP server of its own for the call serving only the chat's browser tools,
  pre-approved; its token in an environment variable (`bearer_token_env_var`), safe because nothing
  in that Codex can run a command. Search is `readOnly` (runs unasked); the tester asks once,
  like the browser tools that click and type.
- **Capabilities:** `subagents` stays false for Codex (no `agents` are passed); new flags
  `searchHelper` and `testerHelper` (true for Codex only) decide who gets the tools and guidance.
- **Models:** `engine.codexSearchModel` and `engine.codexTesterModel` (default `luna`, Codex's
  "fast and affordable" family) and `engine.codexHelperFallbackModel` (default `terra`, the
  balanced one) for a role set to "". Families resolve at call time (D-310). All three are
  protected (D-077): they run programs and spend the plan.
- **Settings:** three rows after ChatGPT's Default model, in the Claude group's order, same picker
  width.

## D-338: A chat that hits its plan's limit carries on with the other provider, in the same chat

Supersedes D-309's "a chat is Claude or Codex for its whole life" for this case: a chat's provider
can change after it started, through a handoff. Everything else of D-309 (one engine per provider,
capabilities, Claude the default, everything non-chat on Claude Code) still holds.

- **Who:** Jon, 2026-11-04 ("if the chat stops because it hit a limit, resume with the fallback
  provider", in the same chat). How it's built: Claude, on my own, from his design.
- **A typed limit.** Both normalizers turn a plan limit into `{ type: "error", code: "rate_limit",
  window?, resetsAt? }`: Claude's from its `rate_limit` assistant error (the reset from the
  `rate_limit_event` before it, or an old message's `|<seconds>` ending); Codex's from
  `usageLimitExceeded` / `rateLimitExceeded`, the reset from the latest `account/rateLimits/updated`
  (the full window's, else the fullest's). A warning (`allowed_warning`) never stops anything. When
  the provider doesn't say when it resets, the usage meter's full window does (`planResetsAt`).
- **The limit card** (`ChatItem` `limit`) replaces the plain error, with the turn's "Failed" line
  hidden under it: what happened, when it resets, and Continue with the other provider (primary,
  only when its meter has room: `planHasRoom`), Wait and resume at the reset (Jig sends "carry on"
  then, a timer that survives a restart through `SessionMeta.limit`), Dismiss. Three fixed lines;
  the third swaps its buttons for what was chosen, so nothing moves. A turn its limit stopped
  leaves the chat's queued messages queued. Builder chats only get Dismiss and Wait (they stay on
  Claude Code).
- **Continuing in the same chat.** The old provider's process ends, a divider goes into the
  transcript ("Continued with ChatGPT · Claude's limit reached"), and the chat's provider, model and
  effort become the new provider's (its project's or Jig's defaults; the permission mode stays,
  mapped like a new chat's). The old provider's session id and model go into
  `SessionMeta.providers` (so the saved-conversations list still maps it to this chat); the new
  provider starts a fresh session. Its first message brings a handoff Jig builds from the
  transcript by rules, without an AI call (`shared/handoff.ts`, at most 16 000 characters): the
  goal (your first message), your latest messages, the last replies, the latest plan, open to-dos,
  the files the chat edited plus `git diff --stat`, and where it stopped. It goes inside
  `<jig-handoff>` and isn't shown in the transcript. Switching back is the same mechanism.
- **Rewind stops at the handoff:** messages before the divider belong to the other provider's
  session, so they get no rewind and the host refuses it.
- **Setting:** `engine.onLimit` (`ask` default, `switch`, `wait`; Settings → Chats) and per project
  (`Project.onLimit`, the project dialog). `switch` continues when the other plan has room, else
  waits for the reset, else asks. Protected (D-077): it decides which plan pays.
- **Task queue:** the same setting. A chat with a limit hasn't finished: with `ask` its task needs
  you ("Hit its plan's limit"), otherwise it keeps running while the chat waits or carries on, so
  the queue doesn't start the next task meanwhile. A queued task's new chat starts on the other
  provider when its own plan is used up and the setting is `switch` (`chats.create` returns
  `provider`). A task that finished on another provider records it (`ranOn`, `startedOn`), and its
  details say "started on Claude".
- **Handing over by hand** at any time between turns came next: D-339, through the same
  `continueWith` with reason `manual`.

## D-339: Hand a chat over to the other provider whenever you want

Extends D-338 from the limit case to any moment, and with it ends D-309's "a chat keeps its provider
for life": a chat changes provider through a handover, by its limit or by you. One engine per
provider, capabilities and Claude as the default still hold.

- **Who:** Jon, 2026-11-04 (the visible way, the confirmation dialog and what it must say, no slash
  command). The choices below the first point are Claude, on my own.
- **Where:** the composer's provider picker (after the first message its heading says "Hand this chat
  over to", picking the other provider opens the dialog) and **Hand over to ChatGPT… / Claude…** in
  the chat's ⋯ menu. Before the first message the picker still just switches (D-314): there is
  nothing to carry over, so no dialog. No Jig slash command (D-091). Builder, attempt and worktree
  chats stay on Claude Code: the ⋯ entry isn't there, the picker's entries say "Stays on Claude Code".
- **Always a confirmation dialog** (Jon): Claude → ChatGPT, the model and permission mode before →
  after, what carries over, what doesn't, what is different there (`featuresLost` from
  `ENGINE_CAPABILITIES`, whose plan pays, no cost estimate on ChatGPT, a warning when the other
  plan's meter has no room), Cancel and Hand over. No "don't ask again": a handover changes which
  plan pays and drops the old provider's own conversation, so it is never silent when you start it.
  The dialog opens after the host has answered `sessions.handOverPlan`, so nothing in it loads.
- **Only between turns; disabled while one runs** (Claude, on my own): while a turn runs (working,
  needs you, starting) both entries are greyed out with "After this turn" beside them, and the host
  refuses (`invalid_args`). Chosen over "offer it after the turn" because that needs a pending
  state the chat would have to show and keep; stopping the turn first (Esc) then handing over does
  the same thing explicitly. No room on the other plan is a warning only: you may know better than
  the meter.
- **What carries over** (Claude, on my own):
  - **A summary, not the full history:** the same rules-built handoff as D-338 (`buildHandoff`: goal,
    latest messages, last replies, plan, open to-dos, files edited, `git diff --stat`, where it
    stopped; ≤ 16 000 characters, no AI). The other CLI can't take a foreign session's history, and
    replaying it all as text would fill the new context with stale tool output. The transcript in Jig
    keeps everything, above the divider.
  - **Files and changes** stay where they are: same folder, same working tree; nothing is copied.
  - **Model and effort map to the same tier** (`mapModelAndEffort`): opus ⇄ Sol, sonnet ⇄ Terra,
    haiku ⇄ Luna (D-310's families, from an alias or a full id like `claude-opus-5-5` or
    `gpt-6.1-sol`); the effort stays when the other provider has it, `ultra` becomes `max` on Claude.
    A model Jig can't place (the provider's default, a custom id) takes that provider's defaults
    (project's, then Jig's). This applies to the limit handover too (`providerDefaults`), replacing
    D-338's "the new provider's defaults".
  - **Permission mode** stays, mapped like a new chat's (Plan only only where the provider has it).
  - **Not carried:** the old provider's own conversation (its session id is kept in
    `SessionMeta.providers`), rewind to messages before the divider (D-338), the context meter
    (starts again).
- **Nothing is sent by the handover:** unlike the limit case, Jig doesn't send a "carry on"; the
  handoff goes with your next message (`handoffPending`). The divider reads "Claude → ChatGPT ·
  handed over by you" (a limit one "· Claude's limit reached"), appended at the end of the transcript
  so nothing above it moves.
- **What else assumed a provider for life:** capabilities follow `SessionMeta.provider`, which the
  handover changes, so hidden features come and go with it; history and saved conversations already
  follow `providers` (D-338); usage tokens add up across providers and the cost stays Claude Code's
  estimate. Add-ons still can't change a started chat's provider (`chats.send` with `provider` and
  a `sessionId` is refused): handing over is your choice, in the dialog.

## D-340: The chat header doesn't show the provider; the composer does

- Status: accepted. Amends D-309/D-314's "the chat header always shows the chat's mark".
- **Who:** Jon, 2026-11-04: "in the chat, I don't need the provider in the top bar, I already have it
  in the input area."
- **What:** the chat tab's header no longer has a `ProviderMark`. Who runs a chat is shown once, by
  the composer's provider picker (D-314), which is also where you hand it over (D-339). The handover
  divider, the Chats list, saved chats and the Tasks queue keep their marks. `ProviderMark` itself
  stays (picker, lists, dialogs).
- **Layout** (Claude, on my own): nothing takes the freed slot; the tenant spacer before the context
  meter absorbs it, so the header's right-hand group simply starts one item later. This also ends the
  slide D-339's status noted (the mark moving while the context meter is hidden after a handover).

## D-341: A new chat changes project until its first message

- Status: accepted.
- **Who:** Jon, 2026-11-04: a new chat that hasn't started should be able to change its project, from
  the top bar's project picker and from a dropdown on the project name in the chat header; once the
  first message is sent it stays in its project.
- **What:** `sessions.switchProject` moves an unstarted chat (`meta.draft`, no turns, items or queue)
  to another project as if it had been created there: the project's default workspace as its folder,
  and the provider, model, effort and permission mode `createChat` would give it (`chatDefaults`,
  `modeFor`). Any engine a model list started goes; the first message starts one in the new folder.
  After the first message it is `not_allowed`; "Move to project" (`sessions.setProject`) still files a
  started chat elsewhere without touching its folder or settings.
- **Following the top bar** (Claude, on my own): only the chat in front (its tab showing in the pane
  you work in) follows, and only on a change of the active project, never when a chat comes to the
  front (that makes its own project active, D-163). Two new chats in different projects therefore
  never pull each other along. Picking a project in the chat header also makes it the active project.
- **Defaults win** (Claude, on my own): the new project's provider replaces one picked by hand on the
  empty chat, as starting the chat there would have.
- **Header** (Claude, on my own): the project shows as a swatch and name in a fixed box (`h-7`, chevron
  slot). Unstarted it is a button like the top bar's project switcher and the Tasks queue's project
  picker, opening a "Start this chat in" menu of projects with their swatches; started it is the same
  box as plain text with the chevron slot kept empty, so nothing beside it (the status) moves.
- **Starter prompts:** the empty chat now shows the project's starter prompts (Settings of the
  project), else Jig's; they follow the switch.

## D-342: A board card shows what Azure DevOps' work item form shows

- Status: accepted.
- **Who:** Jon, 2026-11-04: "we need to support images, attachments, links... whatever devops shows in
  the details of a card, we should as well if possible". His example: a User Story whose description
  holds a pasted screenshot, which Jig showed as plain text without the image.
- **What:** the card dialog has Azure DevOps' tabs, Details · Links (n) · Attachments (n), in the same
  fixed height. Details: the description, acceptance criteria, repro steps, system info and custom HTML
  fields as rich text (images, lists, formatting), each editable in place; the discussion as rich
  text; in the side column every other field with a value (Reason, Severity, Value area, Risk,
  Business value, Time criticality, Activity, Effort, estimates, Start/Target/Due dates, Found in,
  Integration build, Custom.*), labelled by the type's field names (cached an hour) or from the
  reference name. Links: development (pull requests with title and status, commits with their
  message, branches, builds; best effort, at most 8 read), work items grouped by link type with each
  one's type, title and state (one batch request) — a click opens that card in the dialog — and
  hyperlinks. Attachments: aligned rows (icon, name, size, date); images open in Jig, other files
  download in the browser.
- **Images need a sign-in, Jig never holds it (D-018):** the host downloads an attachment with
  `az rest --output-file` into the add-on's data folder (`attachment-<id>`, reused afterwards) and
  answers a data URL (`attachment`). It only fetches attachment URLs of the board's own organisation
  (`attachmentId`), images only (by their bytes), up to 20 MB. Boards gets `fs:read` for it.
- **Edits lose nothing:** the old dialog saved the description from a plain textarea as
  `textToHtml(text)`, which wiped images and formatting in Azure DevOps. Now a rich field is a
  contentEditable editor that is only sent when you changed it, with every shown image put back on
  its attachment URL (`data-jig-src`), as `descriptionHtml`, `acceptanceHtml` or `html[field]`.
  Pasting images or files is refused with a message (uploading attachments is left out, Claude, on my
  own); pasted HTML is sanitized and its images dropped. Claude's `update` tool gets
  `descriptionHtml`, `acceptance` and `acceptanceHtml`; its plain `description` says it replaces images.
- **Safe HTML** (Claude, on my own): `sanitizeHtml` (DOMPurify, already Jig's) is new in `@jig/sdk/ui`
  because add-ons can't import packages; `.jig-rich` keeps stored inline colours and fonts in the HTML
  (so saving loses nothing) but draws them in the theme's, so Azure DevOps text reads in Jig Dark.
  Links in rich text never navigate Jig's window: they open in the browser (Ctrl/Cmd+click while editing).
- **No layout shifts:** a rich section waits for all its images (centred spinner in the Details pane),
  then shows complete; images already fetched are remembered, so a new comment doesn't bring the
  spinner back. Tabs keep the dialog's size; the formatting buttons sit in each field's header row,
  visible while you edit it.
- **Claude's `card` tool** stays plain text: images as `[image: name]`, rich fields as text, comments
  as text; `descriptionHtml` / `acceptanceHtml` only when they hold images (so an edit can keep them).

## D-343: One quit flow, and add-ons can ask before Jig quits

- Status: accepted.
- **Who:** Jon, 2026-11-04: "Time tracker: warn if it's running when I close Jig. Show a modal if I try
  to close Jig while the time tracker is tracking." Per AGENTS.md this starts as an add-on API, not
  one-off core code; Meetings' own native "Quit Jig and leave the active meeting?" box is folded into it.
- **Slot `app.quitGuard`** (manifest `contributes.quitGuards: [{ id, run }]`): `run` is a host.ts export
  called with no arguments when Jig is about to quit, answering `null` or an `AddonQuitAnswer`
  `{ message, detail?, actions?: [{ id, label, run?, args? }] }` (at most 3 actions). A manifest
  contribution, like `search`, rather than a host API to register at runtime (Claude, on my own): Jig
  knows which add-ons can ask without starting anything, the builder's check sees the export, and an
  older Jig simply ignores the key.
- **One flow in main** (`main/quit`): quitting from a menu, Alt+F4 or the window's ×, closing the last
  window, and installing an update all go through `requestQuit`. Core features register with
  `registerQuitGuard` (Meetings: "You're in a meeting"), add-ons through their guards. Every guard is
  asked at once, given 2 s (add-ons 1.75 s each, so one slow add-on is skipped and logged on its own);
  one that throws is skipped and logged. When any answers, the quit is cancelled and the workbench
  shows one modal.
- **The modal** (Claude, on my own on the layout): "Quit Jig?" (or "Restart Jig to install the
  update?"), one row per reason: the add-on's icon in a fixed slot, its name, the message and detail,
  and its actions as small buttons under the text. Footer: Cancel (focused, the default; Escape and ×
  too) and Quit anyway / Restart anyway. An action runs, then Jig quits; a failing action keeps the
  modal open and shows a toast. Without a workbench window (only the Meetings lobby left open), the
  system's own question box lists the reasons instead.
- **Flushes after the choice:** work that must end before quitting (the last chat writes, which
  sessions used to do in its own `before-quit`) registers with `beforeQuitting` and runs once, after
  the user agreed. The flow's `before-quit` listener is prepended, so later listeners see an asked or
  cancelled quit as `defaultPrevented`.
- **Updates are never blocked silently:** "Install and restart" asks the same guards first (the
  installer starts only on the choice); the old "Leave the meeting before restarting" error is gone.
  Running chats still block an install with a message, as before.
- **Hidden (tests):** `JIG_HIDDEN` never asks; e2e opts in with `JIG_ASK_BEFORE_QUIT=1`.
- **Time add-on (Jon's own, 1.1.0):** while a timer runs it answers "A timer is running: description ·
  project · 1:23", with "Stop timer and quit" (kept as an entry when it lasted a minute) and "Keep it
  running and quit"; its detail says it goes on counting from its start time while Jig is closed.

## D-344: Files keeps its tree; add-ons get a UI `activate`

- Status: accepted.
- **Who:** Jon, 2026-11-04: "the files addon loads the files every time I switch to that tab. We should
  just load it in the beginning, then keep it and refresh in the background without locking the UI
  when switching to it."
- **Why it reloaded:** a sidebar shows only its active view; switching tabs or collapsing the sidebar
  unmounts it. Files kept its tree in component state and its folder watch in the view's effect, so
  every switch started from nothing (a blank frame, loading rows, the scroll back at the top) and tore
  the host's watch down and up again.
- **The tree lives in a module-level store** (`addons/files/store.ts`), one per project: which folders
  it shows, folder listings, opened folders, git states, the filter's text and file list, and the
  scroll position. The view reads it with `useSyncExternalStore`, so coming back shows the tree in the
  same frame, where it was scrolled. Rereads replace a listing only when it differs and never put a
  loading row over one that is shown; a loading row is only for a folder opened for the first time.
  A read asked for while one runs runs once more afterwards. Like Repos' overview cache and Boards'
  stale-while-revalidate (D-302).
- **Loaded at startup, watched while the project is active:** the add-on's UI `activate` reads the
  active project's folders and git status as soon as the add-on loads, view shown or not, and keeps
  its shown folders watched (the host's ref-counted watch) until another project becomes active or
  the add-on unloads. It rereads on the view being shown, on window focus and on the watch's
  `changed` events; where a watch can't run (Linux, a lost watch) it looks every 5 s while visible.
- **New add-on API: `ui.tsx` may export `activate(ctx)`** (type `AddonUiActivate`): the UI-side twin
  of host.ts's `activate`. It runs once after the add-on's UI loads; the function it returns runs when
  the add-on unloads or reloads. No manifest key, like host `activate` (Claude, on my own).
- **No `keepMounted` for side views (Claude, on my own):** keeping a hidden view mounted in
  `Region.tsx` would still lose it when the sidebar collapses (the region unmounts) or the view moves
  to another region, would keep hidden views rendering on every change, and would hide the problem
  for one add-on instead of giving add-ons a way to keep data. A store plus `activate` covers every
  case; other add-ons can do the same.
- **`VirtualList` keeps its position:** `initialScrollTop` and `onScrollTop` (set before the first
  paint, so a restored list never shows its top first).


## D-345: An add-on's az operation stays in the tenant it started in

- Status: accepted.
- **Who:** Jon, 2026-11-04 (the bug): with his own az login active, switching to another tenant and
  back showed his pipelines with a list of errors above them, "In tenant <other>: ERROR: Identity …
  has not been materialized", for repositories that aren't in that tenant. The fix's shape: Claude,
  on my own, along the lines Jon's task asked for.
- **Why it happened:** Pipelines' `pipelines()` read the tenant (and its storage key) once when it
  started, but each `api.azure.az` ran in the tenant active at call time. A search still running at
  the switch (the view's search, the 5-minute watcher) sent its remaining calls to the new tenant;
  they failed, and the result, tagged and stored as the old tenant's, carried their errors. Under
  four minutes old, it was what the view showed after switching back. `latest()` and the in-memory
  caches (keyed by the tenant at call time) had the same race.
- **`api.azure.az(args, { tenant })`:** a key from `api.azure.tenant()` pins the run to that tenant.
  The add-on host process remembers the environment of every tenant that was active in it (main sends
  each switch), so it can run in a tenant that is no longer active; a key it never had rejects. Chosen
  over "drop the result when the tenant changed midway": a search that ran into a switch still
  finishes correctly and is kept where it belongs, instead of being thrown away and run again.
- **Pipelines pins every exported function** (`pinned(api)`: `tenant()` keeps answering the tenant it
  started with and every `az` gets its key), so az calls, caches and storage keys all agree. The view
  keeps dropping results tagged with another tenant (`otherTenant`).
- **Lists saved before the fix heal themselves:** a saved `found` with errors naming another tenant
  than its own is searched again however new, and `saved` leaves those errors out until then.

## D-346: The composer's Send and Stop are icon-only buttons

- Status: accepted.
- **Who:** Jon, 2026-11-04: the composer's action row was too cluttered; the icon is enough. The
  shape (a `Button` size, the tooltip wording, the smaller Send-now): Claude, on my own, along the
  lines Jon's task asked for.
- **What:** Stop (secondary, square icon) and Send (primary/accent: arrow, terminal for `!`, bookmark
  for `#`) show no label. Each has an `aria-label` and tooltip with the full meaning and its key:
  "Send (Enter)", "Queue: read after this turn (Enter)", "Run in shell (Enter)", "Remember (Enter)",
  "Stop (Esc)". No provider name in them: chats name the provider only where it matters (the
  app-wide sweep is a separate task).
- **`Button size="icon"`** (`ui/Button.tsx`) is the base component's square, icon-only size, as tall
  as `md` (`size-7`), so any variant (primary included) can be icon-only without one-off styling;
  the caller gives `aria-label` and `title`. `IconButton` stays the plain ghost tool button.
- **One height in the row:** Send now (`IconButton`) moved from `md` (32 px) to `sm` (28 px), so Stop,
  Send now and Send are the same square in one line; the row's height doesn't change when Send now
  appears, and Send keeps its slot in every mode and busy state.

## D-347: The permission mode moves to the chat's header and the model menu

- Status: accepted.
- **Who:** Jon, 2026-11-04: the composer's row was cluttered; the permission button goes, the model
  picker's menu gets a Permissions submenu under Effort, and the mode shows in the chat's header so
  it's always visible. The details (fixed status slot, colours, narrow behaviour): Claude, on my own,
  along the lines Jon's task asked for.
- **One list of modes:** `permissionMenu(meta)` in `sessions/menus.ts` is the only list: the header's
  chip opens it, the model menu nests it as "Permissions: <mode> ›" (`permission-submenu`), and
  `/permissions` and the + menu's "Permission mode…" open it. The modes come from `permissionModesOf`
  (Plan only only where `ENGINE_CAPABILITIES` has plan mode); switching goes through
  `sessions.setPermissionMode` as before. `permissionIcon` (ListChecks for Plan only, Shield for the
  rest) and `permissionTone` (red for Don't ask, the accent for Accept edits and Plan only, muted for
  Ask before changes) are shared by the chip and the menus.
- **The header's chip** (`permission-menu`, moved from the composer): right after the status, the
  whole chip is the button. The status text sits in a fixed slot (`w-20`, "Limit reached" fits), so
  the chip doesn't move when the status changes; what follows it is the flexible spacer, so a longer
  mode label moves nothing on the right. The header is a container: below `@2xl` the chip shows only
  its icon (the label stays in its tooltip and accessible name).
- **Shift+Tab** in the message box still goes through the modes; the hint under the box still says
  so, and the chip updates with the chat's meta.

## D-348: Every chat in the Chats list shows its provider's mark

- Status: accepted. Amends D-314.
- **Who:** Jon, 2026-11-04: every row should say who runs the chat, Claude's included, instead of
  Claude's rows leaving the slot empty (and the slot appearing only once a ChatGPT chat existed).
- **What:** the far-right slot of every row (`size-3.5`, fixed) always holds
  `<ProviderMark provider={chatProvider(m)} iconOnly />`: Claude's asterisk or ChatGPT's aperture, in
  the provider's colour, its name in the tooltip. On hover the pin button still takes the slot's place
  (`group-hover:hidden`), so the columns stay aligned. The `mixedProviders` gate is gone.

## D-349: Claude's browser doesn't take over the panel you are working in

- Status: accepted. Amends the `browser.showWhenUsed` behaviour (the view opens by itself).
- **Who:** Jon, 2026-11-05: switching the panel to Claude's browser every time a chat browses is
  disruptive while he works on another tab of that same panel. Details below are Claude, on my own.
- **Rule:** when a chat uses its page (`browser.reveal`), the renderer asks
  `revealAction(layout, view, focusedPanel())` (`shared/layout.ts`):
  - the view is already on screen → nothing;
  - its panel is the one you are working in (and is open) → no switch; its tab or icon gets a badge
    instead, counting the chats that browsed meanwhile, cleared as soon as the view is on screen;
  - anything else (another panel, a chat, Jig's window not focused, the view not open) → it shows
    itself as before.
- **"The panel you are working in"** is one shared helper, `useFocusedPanel` / `focusedPanel()`
  (`renderer/workbench/focusedPanel.ts`): the closest `data-panel` of the last `focusin` or
  `pointerdown`, cleared when Jig's window loses focus. Panels are a sidebar or its lower half, the
  bottom panel and each main-area pane (`main-left`, `main-right`; `WorkbenchPanel`). A chat marks
  itself `data-panel="chat"`, which counts as no panel: typing in a chat isn't working in the
  browser's panel, so the view still shows itself while you talk to the chat that browses.
- **The badge** is the existing view badge (`ViewBadge`, laid over the icon, no layout shift): Jig's
  own badges live in `workbench/viewBadges.ts` (`setViewBadge`) beside add-ons' `ctx.setBadge`, which
  win when both set one.
- **Extended to terminals (Jon, 2026-11-05):** a terminal a chat starts (`jig_terminal_run` →
  `terminals.reveal`) follows the same rule for the Terminals view: the new terminal becomes the
  selected one, and the view shows itself or badges its tab (counting the terminals started
  meanwhile). Terminals you start yourself (New terminal, sign-ins, scripts, Show output) still show
  the view as before: you asked for them. The mechanism is one helper for every view,
  `revealView(viewId, key)` + `useClearViewBadge(viewId)` (`renderer/workbench/revealView.ts`); a
  future view that wants attention on its own uses it rather than `workbench.showView`.

## D-350: Jig on your phone through a Telegram bot of your own

**Who:** Jon asked, 2026-11 ("I want something like a message bot or even emails … I want Jig to be
able to reach me if needed and vice versa", from his iPhone, for free, not remote desktop). The
choice of Telegram and everything below: Claude, on my own.

- **Telegram, not email or a push service.** Free, works on iPhone, two-way, inline buttons for
  Allow/Deny and answers, edits to mark an answered message, and long polling from the PC: no open
  port, router change or server. Email would need a stored app password and mailbox polling and has
  no buttons; ntfy is one-way without a server of your own. Telegram's servers see the messages: the
  page in Settings says so ("through a Telegram bot of your own").
- **Your own bot, paired by a code.** You make the bot with @BotFather and paste its token; Jig shows
  a 6-digit code you send it from your phone, and from then on reads only that account's private
  chat (other people, groups and messages older than 10 minutes are ignored; five wrong codes make a
  new one). Only one Telegram program may read a bot; a conflict is shown.
- **The token is a credential:** encrypted with the OS (safeStorage, only with a real keyring on
  Linux, as D-232) in `phone.json`, otherwise kept in memory until Jig closes ("Kept until Jig
  closes"). It never reaches the renderer, logs or add-ons; the client never logs the URL.
- **What is sent:** requests, questions and plans waiting for you (always, when sending is on), and
  finished/stopped chats with the end of Claude's reply (`phone.finished`). Builder chats are left
  out. Text from chats goes through `maskSecrets` and is cut to 1,500 characters. `phone.when`:
  `away` (default; the PC idle for `phone.awayMinutes`, default 5, or locked) or `always`. When you
  become away, requests already waiting are sent (a 30 s sweep).
- **What comes back:** a button answers its request (answered elsewhere: "This is no longer
  waiting"); a reply to a message goes to its chat: it answers a one-choice question, declines other
  waiting requests with your words (as typing instead of approving does in Claude Code), or is sent
  as a message into the running turn. Plain text goes to the last chat Jig told you about; /chats
  picks one.
- **`phone.*` is protected** (D-077): it decides what leaves the computer. Polling only runs while
  pairing or while `phone.enabled` is on; pairing turns it on.
- **Claude can text you** with `jig_phone_send` (read-only for permissions: it only sends, to you),
  told in `jigContext` to use it only when asked or blocked on you. Your reply arrives in that chat.
- **Topics when the bot has them** (Bot API 9.3/9.4, turned on in @BotFather; `getMe` says so):
  one topic per project and Jig's own, so a running queue doesn't become one wall of messages. Without
  them everything stays in one thread. Plain text goes to the last chat that wrote in that topic, never
  to a chat of another project. Finished turns arrive silently; only what waits for you buzzes.
- **Jig itself answers what isn't for a chat** (Jon: "not only talk to a chat but to Jig itself …
  go to the Podium project, start a new chat, tell it to look at card 29992 and prepare a plan, then
  send it to me for approval"). A chat of its own kind, `concierge`, one a day, visible in the chat
  list, on the helper model, with Jig's tools and four chat tools and none of Claude Code's own: it
  can't touch files or run commands, only start or talk to chats that do, so everything that changes
  something still goes through a chat's own permission requests and plans, which reach the phone with
  their buttons. Starting a chat doesn't ask (it starts in plan mode unless you say otherwise);
  writing into a running chat does. Its answers are marked as AI. This replaces "plain text goes to the
  last chat that wrote": a question about how things are going could otherwise land in a working chat
  as an instruction.
- **Pictures:** a chat can send its browser page or a picture file with `jig_phone_send`, `/screen`
  sends Jig's window, and a finished turn that used Claude's browser comes with its page. Pictures
  can't be masked like text; Jon: "there is no privacy to worry about", so the page comes by default
  (`phone.screenshots`, which turns it off).
- **Chats as rooms:** a chat opens in a topic of its own and is mirrored there live (messages,
  replies edited as they grow, steps, pictures, requests); writing there writes to the chat. One room
  per chat, only on request (a button, /chats, the chat's menu, or a chat Jig started from the phone),
  so the phone doesn't fill with topics; /close deletes the topic and leaves the chat.
- **Voice messages, not calls:** a Telegram bot can't call or be called. You send a voice note; Jig
  transcribes it on this computer (Whisper, as dictation) and answers in text and, because you spoke,
  read aloud as a voice message (the natural voice). The window does the audio: Chromium decodes
  Opus and WebCodecs encodes it, and `shared/ogg.ts` writes the Ogg file Telegram needs, so no audio
  package is added. A real call (Teams through Azure Communication Services) is left for later.
- **A switch at the top right** turns the phone on and off (`phone.enabled`); off, Jig neither
  messages the phone nor reads the bot.
- **Commands without Claude:** `/status`, `/queue`, `/pause`, `/resume` read the Tasks add-on
  (`overview`, `list`, `start`, `pause` through `addonService().call`) and the chats, and answer at
  once: asking how things are going costs nothing from the plan.
- **Replies survive a restart:** which message belongs to which chat (last 300) is kept in
  `phone.json`. **The PC stays awake** (`powerSaveBlocker`, `phone.keepAwake`) while a chat works or
  waits for you and the phone is connected: a sleeping PC sends nothing.
- Tests: unit tests for the messages and the service with fakes; `e2e/phone.spec.ts` runs the app
  against a fake Telegram server (`JIG_TELEGRAM_API`, honoured only with `JIG_ENGINE=fake`).

## D-351: Reordering inside a view drags with pointer events, so the wheel scrolls during a drag

- Status: accepted. Changes how the task queue's drag (D-307) is built; the drop rules stay.
- **Who:** Jon, 2026-11-05: while reordering a long queue he can't scroll it with the mouse wheel or
  the trackpad; only holding the pointer at the edge scrolls, which he doesn't like. Details below are
  Claude, on my own.
- **Why:** HTML5 drag and drop in Chromium on Windows runs inside the OS's modal drag loop
  (`DoDragDrop`), which doesn't deliver wheel input to the page; no handler in the page can fix that.
- **Rule:** a drag that reorders items inside one view uses `usePointerDrag`
  (`renderer/ui/usePointerDrag.tsx`, in `@jig/sdk/ui` for add-ons): pointer events on the window, a
  4 px threshold so a click stays a click, the target re-aimed on every move and after every scroll
  (a capturing `scroll` listener, with `elementFromPoint`), a label at the pointer (`ghost`), Escape /
  lost focus / pointercancel cancel, the click after a drop is swallowed, `body.jig-dragging` sets the
  grabbing cursor and stops text selection. An optional `scroller` gets a narrow (24 px) edge band
  that scrolls slowly, only as a fallback. Items mark themselves with data attributes the list reads
  from the element under the pointer.
- **HTML5 drag and drop stays** for drags that cross views or come from outside (files, tabs between
  panels, chats onto projects, Boards' columns for now): those need `dataTransfer` and drop targets in
  other components. Moving Boards and `ArrangeList` to the helper is a follow-up.
- Tests: `e2e/tasks.spec.ts` drags with the mouse, wheels mid-drag and checks the line followed.

## D-352: The task queue counts tasks one way everywhere, and progress is done of what will run

- Status: accepted. Replaces the queue strip's per-status icons and chat count (D-307 era) and the
  dashboard card's run-only "N of M finished" (D-326).
- **Who:** Jon, 2026-11-05: the strip "just looks like a bunch of random numbers" (15 chats, 5 done,
  1 running, 13 queued for 19 tasks, 13 of them left out). He wants tasks as the unit, the chat count
  kept beside it ("20 tasks in 16 chats"), and a minimal one-line strip (his mockup v2: "minimalism is
  very important for a clean UI"). Details below are Claude, on my own.
- **Rules** (`addons/tasks/lib/counts.ts`, `countTasks`): every task is in exactly one count, in a
  fixed order (done, partly done, failed, blocked, error, no report, running, needs you, up next,
  skipped, left out), so they add up to the total; a queued task is "Up next", or "Left out" when it's
  unticked. **Will run** is every task except the left-out and skipped ones, and progress is
  `done of will run` ("5 of 6 done", "All 6 done", "All left out"). Chats are counted as the queue
  groups them (a task that continues the chat before shares it); **chats up next** have at least one
  task up next. Time and cost are over the same tasks.
- **Where:** the Queue tab's strip (and a past run's), a chat card's header, and the All queues
  dashboard's cards, which now count the whole queue like the strip instead of only the current run.
  The progress line/bar is `ProgressParts` (`parts.tsx`): done, the rest that ran, then running, as
  shares of what will run; left-out tasks aren't drawn.
- **Colour only where it needs an eye:** running (info), needs you (warning), failed and error
  (danger); every other count is muted text. No icons in the strip; the breakdown is a hover/focus
  tooltip.

## D-353: A chat can revise the report of a task it ran

- Status: accepted. Extends late reports (D-318).
- **Who:** Jon, 2026-11-04: a queue task reported "partial"; he cleared up a misunderstanding in the
  same chat, the work was finished, and he asked it to "report the task as done", which the tool
  refused because the task already had a report. He wants a chat to be able to revise its own
  task's report whenever it likes. Details below are Claude, on my own.
- **Rule:** `addon_tasks_report` accepts a task of this chat that ended with a report (`canRevise`:
  finished, reported, not skipped), by `taskId`, or without one as the last resort after the running
  task and the unreported ones (`reportTarget`): unreported tasks still come first, and another chat's
  task is still refused. `applyReport` replaces the report, sets the status from the new outcome and
  keeps the times and cost, like a late report; a failed or blocked revision pauses by the D-318 rule
  (not when the chat went on with a later task), and no report ever starts or un-pauses the queue.
- **Kept:** the report it replaced, as `revised: { at, from }` on the task (only the last one; the
  chat's transcript has the rest), so the details and Claude's list can say "Partly done → Done".
  `reportedLate` stays as it was: a revision is not a late report.
- **Shown quietly:** a pencil mark left of the status badge in the status slot (right-aligned, so
  the badge and the status icon don't move and stay aligned with other rows), with "Reported again:
  was …" on hover; the details show "Revised <when>, was …" with the old summary on hover.
- **Telling the chat:** the tool's description says it revises; the running task's context says to
  report again with the task's id when a follow-up changes the outcome, and a chat whose task ended
  keeps one line naming that task and its id.
- **Gap:** only tasks still in the queue; one already cleared (only in History) can't be revised.

## D-354: History shows what a run's tasks ran on, from the tasks

- Status: accepted. Extends History (D-248) and providers per task (D-330, D-338, D-339).
- **Who:** Jon, 2026-11-05: a run's provider in History, both marks when it mixed them, counts on
  hover, derived from what the tasks actually ran on, never a guess for old runs. Details below are
  Claude, on my own.
- **Derived, not stored:** `runProviders(tasks)` counts each started task's `ranOn` (set when its chat
  starts, and moved to the provider that finished it after a handover) and its `startedOn` when that
  differs, so a task handed over mid-chat counts for both. The queue's "Runs on" at the time is never
  used. A handover between two tasks of one chat shows on the later task's `ranOn`. No new field: runs
  are already the tasks as they ended.
- **Old runs:** a started task without `ranOn` counts as "not recorded" (said in the tooltip); a run
  with none recorded leaves the slot empty.
- **Shown:** a fixed "Ran on" slot between Cost and Status (`@max-xl:w-8 @xl:w-20`): the marks, most
  tasks first, with the name (or "Mixed") beside them when the container is `@xl`; tooltip "Ran on
  ChatGPT · 5 tasks, Claude · 1". The run page's header shows the same at its right, beside ⋯, so a
  provider joining an open run grows leftward and moves nothing.

## D-355: A finished run's report, made on demand from History

- Status: accepted. Extends History (D-248) and the AI features (D-297).
- **Who:** Jon, 2026-11-05: a structured report for some finished runs, asked for from History, kept
  with the run, not a chat; sections for what was done, things to be aware of, what's stuck, what
  needs you and the follow-ups reshaped into proposals to queue. Details below are Claude, on my own.
- **Where: a main-area tab** (`report`, one per run, keyed by project and run), not a page inside
  History: a long document reads best wide and can stay open beside the queue while its proposals
  are queued. It is laid out by its container, so it also works narrow (marks and badges in fixed
  slots, the commit column folds under the line).
- **When:** only from your action (the History row's report action in a fixed slot left of Status, or
  Run report in the run page's header), never in the background; an open run's action is off with a
  tooltip. Opening a run with a saved report shows it; without one, it starts making it. Regenerate
  replaces it (and its Queued marks).
- **How:** one call through `ctx.ai.answer` with a new AI feature `taskRunReport` (Settings → AI
  features; Claude's chat model or ChatGPT's `sol` by default; 10-minute timeout). `ctx.ai.answer` is
  new: `ctx.ai.ask` with the provider and model that answered, which the report shows. The input is
  the tasks' reports, never transcripts (reports carry what matters and transcripts would be large
  and costly); prompts are cut first, then answers and long texts, to stay under 150k characters.
  The answer is JSON, checked against the run (`parseRunReport`): unknown ids go, a follow-up belongs
  to one proposal, and follow-ups the AI left out stay as their own proposals so none is lost.
- **Kept:** in the add-on's project storage under `reports` (by run id), apart from `history` so the
  History list stays light; removed with the run and pruned to runs still in the history.
- **Disclosure:** a fixed line under the header, "AI-generated report · check important details",
  with the provider mark, model and when it was made.

## D-356: You can mark a task that ended in Error or without a report as done

- Status: accepted. Extends late and revised reports (D-318, D-353).
- **Who:** Jon, 2026-11-05: a ChatGPT task did all its work and committed it, then hit its plan's
  usage limit before reporting; it showed Error, its chat couldn't report (still at its limit) and no
  other chat may report it. He wants to close it as done by hand, from its menu, with an optional
  note, shown as set by him rather than reported. Details below are Claude, on my own.
- **Rule:** only a finished task in Error or No report (`canMarkDone`); others keep their own way
  (a report, a revision, Run again). `markDone` sets Done and a report `{ outcome: done, summary:
  note or "Marked as done by you.", no notes or follow-ups }`, keeps the times, cost and chat, drops
  the error into `markedDone: { at, was, error? }`. Its chat may still report it later (a revision).
  Being Done, it counts as done everywhere (queue strip, History, dashboard); a closed run's copy in
  History follows, as late reports do.
- **From a chat: a new tool, not `addon_tasks_edit`.** `addon_tasks_mark_done { taskId, note?,
  project? }` for when the user asks ("mark t33 done"). Edit only changes queued tasks and is safe
  while the queue runs; closing an ended task is a different act, so it gets its own tool, which is
  not read-only: the user approves each call on its card. Its description says to use it only when
  the user asks.
- **Shown:** Mark as done… in the ⋯ menu (beside Put back, Run again and Remove, which stay) and in
  the details' footer; a small modal with the task, its error and a one-line note (no inline
  expander); a quiet hand-set mark left of the status badge (the revised mark's slot), so nothing
  moves.
- **Gap:** only tasks still in the queue; one only in History can't be marked.


## D-357: e2e:changed diffs against the last passing run, not origin/main

- Status: accepted. Refines D-331.
- **Who:** Jon, 2026-11-05: he works on main and doesn't push during a session, so "uncommitted +
  since origin/main" counted every unpushed commit; once one touched a broad file (e.g.
  `apps/desktop/src/main/index.ts`) every later run picked the whole suite (~8 min) even for a
  one-file change. He wants the specs the change being committed needs: the uncommitted changes plus
  what changed since the last passing e2e:changed or full e2e run, else uncommitted only, with an
  option for the old base, and the base printed. Details below are Claude, on my own.
- **Base (`chooseBase` in `scripts/e2e-select.ts`, unit-tested):** `--since <ref>` when given
  (diffed from its merge-base with HEAD, like before); otherwise the newer of the last passing
  e2e:changed and the last passing whole suite whose source git still has; otherwise HEAD.
- **A pass records the working tree, not HEAD:** `e2e:changed` usually runs on uncommitted changes
  that are committed right after, so recording HEAD would count that commit again in the next run.
  It writes the working tree as a tree object through a scratch index (`git add -A` + `write-tree`
  with `GIT_INDEX_FILE`; the real index is untouched, ignored files left out) to
  `.jig-e2e-changed.json` (git-ignored, beside D-272's `.jig-e2e-passed.json`), and diffs that tree
  against a snapshot of the current one, so untracked files count too. Recorded when the run passes or
  needs no specs; never with `--list`; a failed run leaves the older record.
- **Gap:** an unreferenced snapshot tree can be pruned by `git gc` after a couple of weeks; the run
  then falls back to the full-suite pass or HEAD.

## D-358: A hidden Jig puts its window on screen where nobody sees it, so it draws at full speed

- Status: accepted. Refines how `JIG_HIDDEN` works (the e2e tests).
- **Who:** Jon, 2026-11-05: hidden test windows redrew about once a second, so every test was slow and
  raced the DOM (a drag started on a row that hadn't re-rendered). He asked to turn off background
  throttling only while `JIG_HIDDEN` is set, without anything becoming visible. What follows is
  Claude, on my own, after measuring.
- **Throttling wasn't the cause:** a never-shown window reports `visible` and runs its timers at full
  speed either way; it gets about one animation frame a second because Chromium only draws windows
  that are shown. `backgroundThrottling: false` alone (and Chromium's
  `disable-renderer-backgrounding` switches) changed nothing.
- **What does it:** `showUnseen` (`main/appWindows.ts`) shows the workbench window while Jig runs
  hidden: not focusable (it never takes focus), not on the taskbar, fully transparent, at
  (-30000, -30000), with `showInactive`. It then draws ~50 frames a second instead of ~1. `keepHiddenPagesDrawing` also turns background throttling off for every page a
  hidden Jig opens (`web-contents-created`), and `mayThrottle` keeps "Hey Jig"'s setting from
  turning it back on. Never in the user's normal app: all three do nothing without `JIG_HIDDEN`.
- **Only the workbench window:** meeting windows stay hidden in tests (`revealWindow` does nothing),
  since their logic depends on `isVisible()` (a hidden call window waits for calls, D-292). Claude's
  browser is an offscreen page with its own frame rate.
- **Measured** (Windows, `tasks`, `split` and `workbench` specs together): 119 s → 67 s, e.g.
  dragging tasks 56 s → 13 s, the Tasks queue test ~70 s → ~10 s; the whole suite 4.3 min, all
  passing. Input used to wait for the next frame too, which hid races that now showed:
  - in the app: Stop while a turn was still being put together (add-ons' context, before the engine
    started) did nothing, now `interrupt` waits for that start; the task queue waited for its
    one-minute tick when the view's read had recorded a task just before its chat's "idle" event,
    now that event still moves the queue on; Ctrl+N right after a project was added said "Add a
    project first", now `newSession` asks the host when the window doesn't know one yet (host events
    and call replies can arrive in either order);
  - in the tests: `page` waits for the loaded layout (`main-area`; tabs opened before it are dropped),
    boxes are measured after a dialog's opening motion (`settledBox`), the split test waits for its
    own saved layout (saving waits 300 ms), the handover test for the turn to end, the learning test
    for the shell's prompt; the fake engine's steps notice a turn stopped before they started.

## D-359: Claude's test runs answer within 100 s and are waited for by id

- Status: accepted. Refines D-244.
- **Who:** Jon, 2026-11-05: `addon_tests_run` waited for the whole suite and failed after 120 s
  ("toolRun took longer than 120 s"), so `npm:e2e:changed` (1-8 minutes) couldn't run through it and
  chats ran it in their own shell, where he doesn't see it in the Tests view. He asked for long runs
  to work and stay visible there. The design below is Claude, on my own.
- **Where the limit is:** the add-on host's call timeout (`HostProcess.call`, 120 s by default), which
  every add-on tool goes through. It stays: a hung add-on call must still fail. Codex chats give Jig's
  tools 1800 s, so the host's limit is the one that counts.
- **The add-on answers in time instead:** `run` starts the suite (or joins its run already going) and
  waits at most `wait` seconds (default 90, at most 100, `lib/report.ts`). Done in time: the result
  as before (counts, failing tests, last 60 lines). Still going: "still running" with the run id, how
  long so far, the output's last 15 lines and the instruction to call `addon_tests_wait` with the id.
  `wait` (read-only, no prompt) waits the same way for a run started by `run` or in the view, and can
  be called again until it's done; it never starts or stops a run. The run itself is the view's run, so
  it shows live there, with its toast and history.
- **Finished runs are found by id** for 20 runs while Jig runs (with their output); after a restart
  `wait` says the id is unknown and points at `list`, which shows each suite's last result.

## D-360: Claude changes files with its edit tool, never through the shell

- Status: accepted. Supersedes the Windows scripts line of D-257.
- **Who:** Jon, 2026-11-05. In the last 40 chats Claude edited files about 360 times through the shell
  (158 Python string-replace scripts in heredocs, 106 `sed -i`, 99 `cat > file <<EOF`) and only 73
  times with the Edit tool. TypeScript inside a Python string inside a bash heredoc goes through three
  escaping layers, and `\n`, quotes and `$` change silently: Python turned a `\n` inside a TS string
  literal into a real newline and broke a spec. Claude Code's own "Don't ask" prompt suggests "sed,
  heredocs, or short scripts", and D-257's Windows line fixed shell quoting but kept code inside Python
  string literals and never mentioned Edit. The wording below is Claude, on my own.
- **The rule, on every platform** (`fileEditGuidance` in `main/engine/jigTools.ts`, part of
  `jigContext`): change files with the Edit tool, or Write for new ones; don't edit code through the
  shell, even when commands run without asking; a scripted change across many files is a script file
  that reads its replacement text from files, not string literals.
- **Per provider:** Codex chats get the same `jigContext`, so their wording names `apply_patch`, Codex's
  own edit tool, instead of Edit/Write.
- **Windows only:** run Python with `-X utf8` (it prints as cp1252 and crashes on characters like ✅;
  `-I` ignores `PYTHONIOENCODING`), and in Windows PowerShell 5.1 chain with `;` or `if ($?)`, not `&&`.

## D-361: Decision numbers are reserved by npm run decision, the moment they're needed

- Status: accepted.
- **Who:** Jon, 2026-11-05: several chats work on Jig at once and each took "the next D-xxx" by
  reading the log; two picked D-350, and the one that committed second had to renumber its code
  comments and docs. He asked to make that impossible or trivial, by reserving the number at once or by
  a placeholder replaced at commit time. The choice and the details are Claude, on my own.
- **How:** `npm run decision -- "Title"` (`scripts/decision.ts`) appends `## D-xxx: Title` with the
  first fields to `docs/decisions.md` straight away and prints the number; the chat then fills in the
  entry and uses that number everywhere. The next number is one above the highest heading in the log
  of every worktree (on disk, uncommitted entries included) and every local branch (committed), read
  and written under a lock file in the git directory (`jig-decision.lock`, stale after 30 s), so runs
  at the same moment get different numbers. Pure parts in `scripts/decision-lib.ts`, tested.
- **Why reserving, not a placeholder:** the chats share one checkout on `main`, so a heading written
  to the file is seen by the next chat's run the same second, however late either commits. A
  placeholder (`D-NEW`) would need every chat's placeholders kept apart in the same shared file, a
  pre-commit step that rewrites staged files (and stays out of other chats' changes), and code and
  docs that say `D-NEW` until then; a forgotten replacement would reach a commit. Reserving is one
  command and leaves nothing to replace. Gaps (a reserved number dropped) are harmless.
- **Guard:** `npm run verify` runs `check:decisions`, which fails when two headings share a number
  (the old D-165 pair is let through). If you disagree with reserving at once, the placeholder route
  can replace `scripts/decision.ts` without changing the check.

## D-362: Tasks: Claude deletes queued tasks with its own tool (addon_tasks_delete)

- Status: accepted.
- **Who:** Jon, 2026-11-05: a task queued by mistake could only be left out and renamed "delete"
  with `addon_tasks_edit`, and he removed it by hand in the Queue tab. He asked for a way for Claude
  to delete queued tasks, with the Queue tab's rules. The design choices are Claude, on my own.
- **What:** `addon_tasks_delete` takes `ids` (several at once, all or nothing) and an optional
  `project`. It deletes only tasks that are still queued: running ones, ones that need you and
  finished ones are refused with the reason (finished ones stay as the queue's history). It isn't
  read-only: the Tasks add-on draws its approval card (`DeleteTasks`), one row per id with its title,
  and when a rule blocks it the card says why and only declines.
- **A tool of its own, not `delete: true` in `addon_tasks_edit`:** edit changes tasks that stay; a
  delete is the one irreversible change, so it gets its own approval card that names what goes, and a
  description Claude can't mistake for an edit. Mixing it into edit's ordered list would also make
  later entries refer to tasks an earlier one deleted.
- **One code path with the tab:** `removeTasks` (`addons/tasks/lib/tasks.ts`) now backs both the
  Queue tab's Remove and the tool (`queuedOnly` for the tool, since the tab also removes finished
  tasks). It removes through `withoutTasks`, the helper moves use, so when the first task of a chat
  goes, the next task of that chat starts the chat (the tab used to drop the task alone, which left
  the next one continuing whatever chat came before).

## D-363: Tasks: a queued task can run in Don't ask (bypassPermissions)

- Status: accepted. **Supersedes** D-182's line "`bypassPermissions` can't be asked for" (for the
  Tasks add-on only; every other add-on still can't).
- **Who:** Jon, 2026-11-05: in Add tasks and Edit, the Permissions select offered only Accept file
  edits, Ask before edits and Plan only, and he wanted Don't ask too. The reason the line can go: Jon
  chooses it himself, per task, in the dialog, as he would for a chat in its mode menu; an unattended
  queue that stops at every command defeats the queue. The gate and the guards below are Claude, on
  my own.
- **What:** the add and edit dialogs' select ends with **Don't ask** (the chats' label,
  `PERMISSION_MODE_LABELS`, now in `@jig/sdk/ui`), red like the chats' mode menu; the select keeps its
  width. The default stays Accept file edits. Rows and details show "don't ask". Both providers offer
  it: Codex runs it without a sandbox and never asks (D-334); Claude Code still stops on its own
  safety checks (D-336).
- **The narrowest gate in main:** `api.chats` (`main/addons/chats.ts`) accepts `bypassPermissions`
  only from the built-in Tasks add-on (`BYPASS_ADDONS` and `isBuiltin`: a user add-on that takes the
  id "tasks" is refused too). Not a manifest permission any add-on could declare: a chat that asks
  nothing runs whatever its prompt says, and builder-made add-ons can send prompts.
- **Only you pick it:** Claude's `addon_tasks_add` and `addon_tasks_edit` take no permission mode;
  `jig_set_addon_data` refuses a value that adds a `permissionMode: "bypassPermissions"` anywhere in an
  add-on's data (`addsDontAsk`; it may keep the ones already there, matched by the object's `id`). The
  Tasks host checks the mode the view sends (`parsePermissionMode`). Requests reviewed from other
  add-ons (`addReviewed`) stay Plan only.

## D-364: Permission mode: back in the message box, beside the provider picker

- Status: accepted; amends D-347 (its placement; the shared `permissionMenu`, `permissionIcon` and
  `permissionTone` stay).
- **Who:** Jon, 2026-11-05: he wants the permission button back in the message box's bottom row,
  where it was before D-347, right next to the provider picker; the chip in the chat's header and the
  model menu's "Permissions: <mode> ›" entry go. The slot sizes and the narrow breakpoint: Claude, on
  my own.
- **The button** (`permission-menu`, `PermissionButton` in `sessions/Composer.tsx`): right after the
  provider picker, before the model picker; icon and label as before D-347 (Shield, ListChecks for
  Plan only; red for Don't ask, the accent for Accept edits and Plan only, muted for Ask before
  changes), the whole button opens `permissionMenu`. It sits in a fixed slot: `w-48` from
  `@2xl/toolbar` up ("Ask before changes" fits), so switching modes moves nothing beside it; below that
  it is the icon alone in a `w-7` slot (label in its tooltip and accessible name), so the model name
  keeps its room. Container variants on both sides (D-297).
- **Gone:** the header's chip, its fixed status slot (`w-20`) and the header's `@container`; the model
  menu lists only models, Effort and Other model…. `/permissions`, the + menu's "Permission mode…"
  and Shift+Tab still open or switch the modes.

## D-365: Composer: Send is a split button with a menu, and prompts can be parked

- Status: accepted; changes D-346 (the separate Send-now button goes) and extends D-308 (editing
  applies to parked messages too).
- **Who:** Jon, 2026-11-05: while a chat was working he wrote a prompt but wanted to answer what the
  chat had just said first; he wants to **park** a prompt (kept, never sent by itself, sent by hand),
  and a Send split button whose menu has Send/Queue, Send now and Park with their keys. The menu's
  extra entries, the shortcut, the icons and the storage: Claude, on my own, along the lines Jon's
  task asked for.
- **The split button:** Send (`composer-send`, unchanged) and, flush against it, a narrow chevron part
  in the same accent (`composer-send-menu`, `w-4`), always there, idle or busy, so nothing moves when
  a turn starts or ends. Amended (Jon, 2026-11-05): the halves read as one control, square inner
  corners and a hairline (`border-on-accent/25`) between them instead of a 1 px gap, and the chevron
  is disabled whenever Send is (empty box), with the same faded look, so its menu can't open. Send squares its right corners with `Button`'s `join="start"` (`end` squares the left
  ones): a `rounded-r-none` class lost to the base `rounded-md` because `cn` resolves no conflicts
  (Claude, on my own, 2026-11-05). Its menu (`openMenuAt`, right-aligned, through `ui/Menu.tsx`): **Send** idle
  or **Queue: after this turn** busy (Enter; Run in shell / Remember in `!`/`#` mode), **Send now:
  into the running turn** (Mod+Enter, enabled only while busy), **Park: keep it, send it later**
  (**Alt+Enter**, free in the composer and app-wide), a separator, **Send in a new chat**. Entries
  are disabled while the box is empty; Send now, Park and Send in a new chat also in `!`/`#` mode
  (those are commands, not messages). The separate ⚡ Send-now button is gone; Mod+Enter still sends
  now. The hint under the box says "Alt+Enter parks" while busy.
- **Parked messages are host state saved with the chat:** `Live.parked` in `sessions/manager.ts`,
  written next to `queue` in the session file (`parked`, default `[]`), sent as their own update
  (`{ op: "parked" }`) and in `SessionSnapshot.parked`. Not on `SessionMeta`: meta goes to every
  list and add-on, and the parked list belongs with the queue it sits beside. Nothing reads it when a
  turn ends, so it is never sent by itself. Parking in a new (draft) chat makes it a real chat, so it
  survives a restart. New IPC: `sessions.park` (`{ text, attachments }`, or `{ queuedId }` to move a
  queued message) and `sessions.sendParked` (`{ parkedId, now? }`: sends as `sessions.send` would:
  now, queued while busy, or into the turn; it goes back to the parked ones if sending fails).
  `sessions.editQueued` and `sessions.removeQueued` take a parked message's id too.
- **The box above the composer** (`ComposerQueue.tsx`) shows "Sends after this turn" and, under it,
  "Parked · sent only when you send it". It grows the way the queue box always did and scrolls past
  `max-h-48`. Every row is the click target (edit in the D-308 modal) and has three fixed action
  slots so both groups line up: send now (⚡, busy only, an empty slot otherwise), move (queued:
  Park; parked: Send idle, Queue busy) and remove (×). Parked rows are muted with a dashed outline.
  One icon each everywhere: `ListEnd` = the queue, `Pause` = parked, `Zap` = send now (`QUEUE_ICON`,
  `PARK_ICON`, `SEND_NOW_ICON`).
- **Send in a new chat** earns its place: a side question while a chat works is common, and it keeps
  the prompt and files (copied into the new chat with `sessions.addAttachment`). Not in builder chats.
- **Left out: "Add to Tasks queue".** The Tasks queue is an add-on and the composer is core: core
  must not depend on an add-on (it would have to come through a slot the Tasks add-on contributes).
  Parking already covers "later", and Tasks has its own Add dialog with the fields a task needs.

## D-366: Chat memory: transcripts are let go when no tab holds them, and long chats render a window of their latest rows

- Status: accepted.
- **Who:** Jon, 2026-11-05: the main window's renderer was at ~1.8 GB after a day of use; cut it. How:
  Claude, on my own.
- **Transcripts in memory** (`features/sessions/store.ts`): a chat's items stay in the renderer while
  something holds them (`holdTranscript(id)` returns the let-go: an open chat tab, a voice
  conversation) or a turn runs (`starting`, `working`, `needs_you`), and the `KEEP_RECENT` (5) newest
  of the rest, so reopening a chat you just closed is instant. Others are dropped and `ensureTranscript`
  loads them from the host again (`sessions.get`, the host's own copy). Code that reads a transcript
  without a tab awaits `ensureTranscript` and reads it right away, which eviction can't interrupt (it
  runs only when a hold ends, a transcript loads or a turn ends). Metas are never dropped: every list
  needs them.
- **Live item updates are batched per frame** (16 ms): item updates wait in a per-chat list and are applied
  together, so a streaming answer copies the item list once a frame instead of once per update, and
  a meta-only change keeps the item list as it was (no re-render of the transcript). A meta, queue or
  parked update is applied at once, with that chat's waiting item updates before it: code reads a
  chat's status right after a host call, and a status a frame late made the header lag. Updates that
  arrived before a loading transcript's snapshot are dropped when it lands: the host sends in order,
  so the snapshot has them (applying an `append` twice would double the text).
- **A long chat renders a window of its latest rows** (`Transcript.tsx`, `WINDOW` 60 rows, `BATCH` 40
  more each time you scroll within a screen of the top; `windowStart`, `rowIndexOf` in `compact.ts`).
  Rows added above keep what you read in place: the row at the top of the view is measured before
  and corrected after (Chromium's own scroll anchoring may already have done it; then nothing moves).
  Back at the bottom (following the chat) it shrinks to the latest rows again, so a tab left open
  costs only its window. Find in chat renders down from just before a match above the window, then
  scrolls to it. No spacer above the window: a spacer's height would be an estimate, and reaching it
  would jump; the scrollbar thumb grows as rows load instead, as in other chat apps.
- **Not unmounting inactive tabs:** a hidden tab keeps its DOM (its scroll position and open cards),
  which with the window is only its latest rows. Unmounting would re-render every Markdown message
  on each tab switch.
- **Measured** (fake engine, 15 chats of 600 items each, compact view): with all 15 open, JS heap
  211 → 57 MB, DOM elements 377k → 41k, renderer working set 755 → 267 MB; all closed again, JS heap
  44 → 37 MB (5 chats kept).

## D-367: Idle chats let go of their Claude Code / Codex process and resume on the next use

- Status: accepted.
- **Who:** Jon, 2026-11-05: 16 claude.exe at ~250-300 MB each (~4.5 GB) while most chats sat idle;
  stop idle chats' processes and restart them transparently. Default 20 minutes and the setting: Jon.
  How: Claude, on my own.
- **Where:** `SessionManager.sweepIdle` (`main/sessions/manager.ts`), every minute while any process
  runs (an `unref`'d interval that stops itself when none is left). `lastActive` is the last event from
  the process or the last call that needed it (`startEngine`: messages, `/` commands, MCP status,
  rewinds). Both engines: Claude Code's `query` process and Codex's `codex app-server` (with its local
  MCP server) close through `EngineSession.close`.
- **Idle means:** status `idle` or `error`, no turn starting (`live.starting`), no pending permission,
  question or plan card, no queued message, no background task (commands, subagents, monitors:
  `meta.backgroundTasks`), no carry-on with the other provider pending (`autoContinue`), and no
  `keepAwake` check answering true. The one check today is the Tasks add-on's: a task running or
  waiting in the chat, or, while a queue runs, the next queued task that continues it
  (`main/addons/taskChats.ts`, reading the add-on's own storage; registered with `keepChatAwake`).
- **Quietly, not as an exit:** `sleep` closes the process with its event token cleared and emits no
  `exit` event, so `onTurnEnd` doesn't run, the status doesn't change and the transcript gets nothing.
  Add-ons following the chat (the task queue's `chatChanged`), the builder, notifications and the
  phone hear nothing: a stopped process never advances the queue. Only `azureTenant` is cleared (the
  next process records the tenant active then).
- **Resume:** nothing new. The next `startEngine` resumes `meta.engineSessionId` exactly as after a
  Jig restart (Claude Code's `resume`, Codex's `thread/resume`), with Jig's tool servers, plugins and
  subagents rebuilt for the new process. Terminals Claude started stay Jig's; when one ends, `notify`
  starts a turn, which resumes the process. The UI shows the usual starting/working state; no new
  UI. Lists Claude Code gave once (`/` commands, models) are served from their caches while no process
  runs, so opening the picker doesn't wake a chat.
- **Setting:** `engine.idleStopMinutes` (default 20, 0–1440, 0 = keep until the chat closes) in
  Settings → Chats → All chats → Stop idle chats. Not protected: it only stops processes.

## D-368: Meetings: a fresh call window after each call

- Status: accepted.
- **Who:** Claude, on my own (Jon's task: measure the call window's idle cost and keep it light).
- **Measured (2026-11-05, installed 0.12.0, ringing on):** in a Teams meeting the call window's renderer
  held ~1.7-1.8 GB private memory. After the meeting ended (`meetings.callIdle`, window hidden, no
  call) it stayed at ~1.67 GB for the whole 12 minutes sampled, CPU flat, plus the camera service
  (`video_capture`, ~120 MB private) and the audio service (~13 MB) kept alive. Chromium doesn't give a
  renderer's heap and media buffers back once a call has used them. A fresh call window (bundle and
  calling SDK loaded, fake meeting service, no Teams agent) is ~105 MB private; the real listening
  window right after startup adds the Teams call agent's signalling, not measured with a real sign-in.
- **Decision:** once a meeting or call has run in the call window (`meetings.join` /
  `meetings.startCall` set `roomUsed`) and the window reports `meetings.callIdle`, main destroys it a
  second later and opens a fresh hidden one when Jig still needs it (ringing on and signed in, or the
  lobby open). The new window opens on the old one's `closed`, which shuts the loopback page server
  first, and only while another Jig window is open (so it never makes Jig quit). Its Teams call agent
  starts listening again within seconds, so calls keep ringing in Jig.
- **Not chosen:** background throttling while idle (the hidden window must keep the signalling and the
  ringtone on time, and it doesn't free the memory anyway); disposing the call agent or releasing
  devices in place (the renderer's heap stays as large); reloading the page (a reload keeps the same
  renderer process, so its memory isn't reliably given back).
- **Trade-off:** a call that rings in the second between `callIdle` and the new window's agent
  listening rings on the Teams app only. Prejoin of the next join loads in a new window (a moment
  slower than a warm one).

## D-369: Tasks: a parked pool at the end of the queue, and a stats header with fixed segments

- Status: accepted; extends D-279 (ticks), D-307 (moves) and D-352 (the queue's header).
- **Who:** Jon, 2026-11-05: he keeps ideas in the queue that he doesn't want done yet and keeps moving
  them to the bottom; he wants to **park** them in a pool at the end of the queue, under a divider and
  faded, never enabled by the tick that includes every task, with anything AI adds landing before
  them. He also asked for a header that shows done, running, enabled, left out and parked as fixed,
  aligned segments. The details below: Claude, on my own, along the lines of Jon's task.
- **State:** `Task.parked` (missing = not parked, so old state files read as before; nothing is
  migrated). Only a queued task is parked. A parked task never runs (`isReady` is false), no tick
  includes or leaves it out (`setLeftOut` passes it by; `leftOut` on a parked task is refused) and it
  always starts its own chat (`newChat: true`; continuing a chat is refused).
- **The pool is always last** (`poolLast`): every insert lands before it (`addTasks`, Run again, the
  Queue tab's Add, Claude's `addon_tasks_add`, joined queues), parked additions at its end. Park puts a
  task at the end of the pool (its chat goes to its next task, as when it moves away); Unpark puts it
  last before the pool, **left out**, so it never runs by surprise. Moves keep to their side:
  `dropSlots` offers a single task `parked` slots between parked tasks (a drop there parks it; a
  parked task dropped in the queue is unparked); steps (Alt+↑/↓, Move up/down/top/bottom) and Claude's
  `moveTo` stay on the task's side of the divider and say why when a place is in the other one
  (all or nothing, as before). A whole chat is never parked by a drag.
- **Claude:** `addon_tasks_list` shows `[Queued, parked]`; `addon_tasks_edit` takes `parked` (unpark =
  last before the pool, left out unless `leftOut: false` in the same edit); `addon_tasks_add` takes
  `parked` (only when the user asks; the review card has a **Park as ideas** switch, which turns off
  Start right away and Same chat). A running task's instructions name parked ones as ideas, so they
  aren't suggested as follow-ups.
- **The view:** the pool is always shown under the queue's chats: a divider "⏸ Parked · N" with **Add
  idea** (a modal: one idea, or one per line), then a dashed card of faded rows with an empty tick slot,
  "Parked" and the pause icon in the status column. Empty, it holds one row-high hint, so the first idea
  replaces it instead of pushing anything. ⋯ on a queued task: **Park: keep as an idea**; on a parked
  one: **Unpark: back to the queue**. The view's ⋯ and the empty queue have **Add an idea**.
- **Naming, with the composer's parked prompts (D-365):** both say **Park** and use the same icons
  (`pause` parks, `list-end` = back to the queue) and the same muted, dashed look: one meaning, "kept,
  never sent or run by itself". They stay two pools: a chat's parked prompts belong to that chat and
  are sent into it; parked tasks are the project's queue's ideas and run in new chats. Merging them
  would make core depend on the Tasks add-on (D-365 left that out for the same reason).
- **Counts:** parked tasks are in no count of `countTasks` (not the total, chats, "will run", progress
  or the progress line), only in `parked`; a queue with only ideas has no dashboard card. The badge
  (tasks that need you) never counted them.
- **The header (replaces the left part of D-352's line):** six fixed segments, always shown in the
  same order and place, a zero in quiet grey: done as "done/will run" (its tooltip is the full
  breakdown), running (or "need you" with the warning icon), not done (partly done, failed, blocked,
  error, no report), to run (ticked), left out, parked. Each is its own fixed width with tabular digits,
  so a changing count moves nothing; one with tasks scrolls to the first of them (parked: to the pool).
  Narrow (a sidebar, below `@xl`): icons and numbers on their own line above the controls, with time
  and cost left of the controls; from `@xl` one line; from `@6xl` the segments' words show, from `@7xl`
  "N tasks in M chats" too. Skipped tasks are only in the breakdown.

## D-370: Jig on your phone through Teams: your own bot and a relay in your Azure

- Status: accepted (planned, phase 27).
- **Who:** Jon asked, 2026-11-05 ("can we do a similar thing with Teams? so I can communicate through
  Teams"), and chose a real bot with a small relay over his own Graph sign-in; then: one channel at
  a time ("one or the other"), Jig creates the Azure resources, and "a whole system … chat rooms …
  as complete as we can do it" rather than one thread. How each is done: Claude, on my own.
- **A bot, not Jig posting as you.** Teams only notifies you of messages someone else posts. The
  Meetings sign-in (Graph, `ChatMessage.Send`) posts as you, so it would never buzz the phone. A bot
  has its own identity: its messages notify like a colleague's.
- **A relay, because a bot can't poll.** Microsoft delivers what you write to a bot by POSTing to a
  public HTTPS endpoint; there is no `getUpdates`. The relay is a small Azure Function of the user's
  own (`relay/teams/` in this repository, deployed from Jig's setup): it checks Microsoft's token on
  every incoming activity, keeps the paired user's messages (24 h) until Jig fetches them, and sends
  Jig's messages as the bot. Jig long-polls it like Telegram, so no open port on the PC, and nothing
  is lost while the PC sleeps. A dev tunnel straight to Jig was left out: it needs a CLI running
  and loses what you write while Jig is closed.
- **Credentials:** the bot's client secret lives only in the Function's settings (Azure), never in
  Jig. Jig holds one relay key, generated at setup, stored like the Telegram token (safeStorage or
  memory only, never the renderer, logs or add-ons). The relay accepts requests only with that key.
- **Your own tenant.** New bots are single-tenant (Microsoft stopped creating multi-tenant bots in
  2025), so the bot's app registration lives in the tenant where you use Teams, and its Azure Bot and
  Function in a subscription you can create resources in (normally of that same tenant; whether
  another tenant's subscription works is checked in phase 27, not assumed). The bot asks for no Graph permissions: no admin consent. Adding it to Teams is
  uploading a custom app for yourself; when the tenant blocks that, an admin approves it once.
- **Pairing like Telegram:** a 6-digit code you send the bot; from then on only that account (its
  Entra object id and tenant) is read, by the relay and again by Jig.
- **A team of your own, like Telegram's topics and rooms.** A personal bot chat has no topics, so
  the full experience lives in a private "Jig" team with the bot in it: **one channel per project**
  (made by the bot on the project's first message, like a topic), and **one thread per chat** in its
  project's channel (a room: the chat's turns mirrored live, what you write in the thread goes to
  that chat). Jig itself and everything that waits for you (permissions, questions, plans) also
  arrive in the **1:1 chat with the bot**, which buzzes; in channels the bot @mentions you only when
  something needs you, so finished work stays quiet. Buttons are Adaptive Cards, edited when answered
  on the computer. Channels are created through the bot's resource-specific consent
  (`Channel.Create.Group`, granted by you as the team's owner when you add the app, no admin);
  whether the tenant allows that is checked in setup, and without it the rooms are threads in the
  team's General channel instead. Voice notes are left out (bots don't receive them).
- **One channel at a time.** Settings → Phone picks Telegram or Teams; the phone features above the
  channel (what is sent, routing, Jig itself, commands) are shared through a `PhoneChannel`
  interface, so both stay the same product.
- **Jig creates the Azure pieces with your `az`** (Jon: "you can create the azure resources"): the
  setup window lists every resource and command first, one Create runs them in order (the active
  tenant from the top bar), with a written guide as the fallback. It never
  deletes them by itself; Disconnect says what to remove.
- **Checked against Microsoft's docs (2026-11-05, phase 27 session 2; the relay's own choices are
  D-378):**
  - Multi-tenant bot creation ended after 2025-07-31: single-tenant it is (`MicrosoftAppType`
    SingleTenant, app id, secret, tenant id). Microsoft says a single-tenant bot can still be
    installed in any tenant, but RSC needs the app registration in the user's own tenant
    (`webApplicationInfo.id`; a sideloaded app with another tenant's id is refused), so the app
    registration stays in the Teams tenant. Whether the Azure Bot resource may sit in a
    subscription of *another* tenant is not documented (Q&A answers disagree): setup must treat it
    as unsupported until the tenant check's optional step proves it.
  - The relay checks the JWT as Microsoft lists it: issuer `https://api.botframework.com` even for
    single-tenant bots, keys from `login.botframework.com`; outgoing tokens come from the bot's own
    tenant (`login.microsoftonline.com/<tenant>`), not `botframework.com`.
  - Proactive messages: a new channel thread is `POST v3/conversations` with `isGroup`,
    `channelData.channel.id` and the activity; replies go to `<channel id>;messageid=<root id>`;
    the 1:1 chat can be opened with the user's id once they have the app (personal scope). Save
    each conversation's `serviceUrl` from its activities; `smba.trafficmanager.net/teams/` is only
    the fallback.
  - RSC `Channel.Create.Group` exists (app-only, a team owner consents once when adding the app);
    renaming needs `ChannelSettings.ReadWrite.Group` too. Whether owners may consent is a tenant
    setting (since 2024 Teams' own RSC setting, earlier Entra's group-owner consent) and the app
    permission policy: the tenant check finds out.
  - Cards are Adaptive Card **1.5** (Teams renders up to 1.6, mobile included; later versions may
    not render on phones), with `Action.Submit`; no `isEnabled`, no positive/destructive styles.
  - Pictures go inline as `data:` URLs (≤ 1 MB, ≤ 1024 × 1024, PNG/JPEG; documented, marked preview).
  - Flex Consumption is GA, Linux, Node **22** or 24 (not 20), not in every region (`az functionapp
    list-flexconsumption-locations`), deployed only as a package (`config-zip`), HTTP answers within
    230 s (a 25 s long poll is fine). Table storage has no expiry: the relay prunes itself.
  - The Bot Framework SDK is archived (support ended 2025-12-31): the relay doesn't use it.

## D-371: Claude tools for Pipelines and Repos: read-only, never start a run

- Status: accepted.
- **Who:** Jon asked, 2026-11-05 (task queue: "Claude can use everything the switched-on add-ons
  offer"; the phone bot couldn't answer "are any pipelines running?"), and set the rule that pipeline
  runs and deploys are always started by him from the Run form, never by Claude. Which tools, their
  shape and the plan for the rest: Claude, on my own.
- **Pipelines gets three read-only tools** (`addon_pipelines_pipelines`, `_runs`, `_run`), on the
  same code and caches as the view (`pipelines`, `latest`, the organisations of More pipelines,
  tenant pinning D-345). `runs` takes `state` running / recent / failed; running asks Azure DevOps
  for `inProgress` and `notStarted` apart, so a long run older than the newest finished ones isn't
  missed. `run` gives stages, jobs, the failed steps with their errors and the last 40 lines of the
  first failed step's log. By default they cover your checked-out repositories' pipelines (the
  view's main list); `everywhere: true` covers More pipelines' organisations, capped at 40 projects
  a call so a call fits the add-on host's time limit.
- **No tool starts, queues, re-runs or cancels a run,** and each tool's description says so (also
  not with `az pipelines run` in a shell). The Run form stays the only way; the phone concierge's
  "Never run pipelines or deploys" stays.
- **Repos gets `status` and `commits` (read-only) and `fetch` (asks first)**, fitting the view's
  Fetch / Fetch all repos actions. No pull or push tool: they change your working tree or the
  remote, and Jon pushes himself.
- **Not added, with reasons** (plan items in `docs/plan/26-phone.md`): Scripts (listing and
  starting scripts lives on the UI context, `ctx.scripts`; the host API has no `scripts`, so a tool
  needs a new host API first), Meetings (a meetings list is Jig's own code in `main/meetings`, not
  the add-on; `jig_meeting_read` needs an id), Git and Files (chats have the shell and file tools;
  Repos' status covers the phone).
- The phone concierge's prompt names the new tools for pipeline and repository questions, so it
  answers them itself instead of starting a chat.

## D-372: Boards: the New card dialog is the card's form

- Status: accepted.
- **Who:** Jon, 2026-11-05 (task queue): fill in everything when creating a card instead of creating
  it, opening it and editing it; ideally the edit form's own fields. The details below are Claude, on
  my own.
- **What:** "New card in <column>" has the card dialog's size (xl, fixed body height) and layout: the
  title on top, the picked type's rich-text sections on the left (Description, then acceptance
  criteria, repro steps, system info… as the type's fields say), Type and the card dialog's editable
  fields on the right. Those fields are one component, `EditFields` in `cards.tsx`, shared with the
  card dialog: Column, State, Assigned to, Tags, Priority and Story points, Area, Iteration. Area and
  Iteration became editable in the card dialog too (they were read-only rows), so both forms match.
- **Type-driven:** the host's `typeForm({ board, type })` answers the type's states, rich sections
  and whether it has priority and story points (from `workitemtypes/{type}/fields`, cached an hour).
  Switching type swaps the sections (text in a section both types share stays; the last type's form
  stays on screen until the next arrives) and disables number fields the type lacks rather than hiding
  them, so nothing moves. If the fields can't be read, every field shows, as in the card dialog.
- **Paths:** `paths({ board })` reads the team's areas (`teamfieldvalues`), settings and iterations
  (cached an hour). A new card defaults to the team's area and default iteration: the team's set one,
  the current iteration when it is `@currentIteration`, else the backlog iteration (the project root).
  Claude's `_create` uses the same default when no iteration is given. Pickers show the card's own
  value (or "—") until the lists arrive.
- **Create in one go:** one `az boards work-item create` with every field (`createArgs`, reusing
  `updateArgs`), then one update for the column and state (Azure DevOps starts a card in its type's
  first state; the board's column field needs the state that goes with it), then the parent link.
  `update` takes the new card's type, since the board's cached cards don't have it yet (before, a
  new card's column move sent no state). `addon_boards_create` accepts the same fields;
  `addon_boards_update` gained area and iteration.

## D-373: Claude's terminals close themselves when the chat is done with them

- Status: accepted. Amends D-281 (the exit notice) and `jig_terminal_stop` (which used to keep the
  terminal).
- **Who:** Jon, 2026-11-05: the Terminals panel filled up with dozens of finished "Claude: …"
  terminals; when a chat is done with a terminal it started, it should close itself. The details
  below (failed terminals, the watched terminal, the hold) are Claude, on my own.
- **Rule** (`FinishedTerminals`, `main/terminals/autoClose.ts`), only for terminals a chat started
  (`sessionId`); your own terminals, scripts and sign-in terminals are untouched:
  - It exits by itself → once its exit notice has been handed to the chat (it has the code and last
    lines), it closes.
  - **Not under your eyes:** the terminal on screen (the active one while the Terminals view is visible,
    reported by the renderer with `terminals.watching`) stays until you switch away.
  - **A failure stays until seen:** a non-zero exit closes only after you have looked at it and switched
    away (a failure that happened on screen counts as seen). Why: a failed command is the one case you
    may want to read yourself, the failure toast offers "Show output" and "Ask Claude" for it (both
    need the terminal), and the chat being told doesn't mean you were. It's bounded: archiving the
    chat closes it anyway.
  - `jig_terminal_run` holds a terminal that exits during its first 1.5 s until its answer has read
    the output.
  - `jig_terminal_stop` now closes the terminal (kill + remove); the tool description and the appended
    prompt ask Claude to stop terminals it no longer needs (a dev server after testing).
  - Archiving or deleting a chat closes all its terminals (`onSessionClosed`, like its browser page).
- A row removed from the list moves the rows below it up; the row you are on never moves away, since
  the terminal on screen is never closed.

## D-374: Nothing takes the keyboard focus from where you type

- Status: accepted. A hard UI rule (AGENTS.md); builds on D-349 (views badge instead of switching).
- **Who:** Jon, 2026-11-05: when Claude started a terminal (`jig_terminal_run`), the caret jumped into
  it and the rest of his message went to the terminal. While you type, nothing may take the focus away
  except a modal you (or a real confirmation Jig must ask) open. Details below are Claude, on my own.
- **Rule:** things that happen by themselves (a chat, a tool, the task queue, a host event, an add-on)
  may still open or show a view, tab or window, but never move the caret. Only a direct action of yours
  (a click, a shortcut) or a modal may.
- **One helper** in the renderer, `mayTakeFocus(target)` (`renderer/workbench/takeFocus.ts`): yes when
  the focus isn't in a text field (input, textarea, contenteditable, a terminal), or already inside
  `target`; otherwise only within 1.5 s of your last *request*: a pointerdown outside a text field, or a
  shortcut (Ctrl/Alt/Cmd, not editing chords like Ctrl+C/V/Z/A or arrows) pressed in one. Any typing in
  a text field cancels that window, so a result that arrives after you started typing never takes the
  focus. `useTrackUserIntent` (mounted by the workbench) records it. Chosen over passing a reason
  through every reveal path, because focus is taken in effects far from what caused them (an `active`
  prop), and the user's own events are the reliable signal.
- **Where it is applied** (the background sources found in a sweep of every `.focus()`/`autoFocus`):
  `XTerm` focusing when it becomes the active terminal (a chat's `terminals.reveal`, or a finished
  terminal closing, D-373); the composer focusing when its chat tab becomes active (`sessions.reveal`,
  add-ons opening chats); `fillComposer` (text put in a message box); dictated words arriving after you
  moved on. The rest follow a direct action (menus, pickers, dialogs you open, Go to, chat search, the
  composer's own buttons, Ctrl+L in the Browser, Tasks/Boards keyboard moves) or are modals (`Dialog`'s
  focus trap, the quit confirmation, voice mode) and stay as they were.
- **Main process:** `showWindowQuietly(window, raise?)` (`main/appWindows.ts`) shows a window without
  activating it (a minimized one flashes instead). An incoming Teams call (`ring`) now comes to the
  front without the keyboard (so Enter meant for a chat can't answer it), and the Meetings lobby
  opening after a call ended does too. `revealWindow`/`focusJig` remain for what you just did
  (notification clicks, a second launch, opening Meetings, the quit dialog).

## D-375: Bottom panel span: how far the bottom panel reaches under the sidebars

- Status: accepted.
- **Who:** Jon, 2026-11-05: choose, for the left and right sidebar independently, whether the sidebar
  runs the full height of the window or the bottom panel (Task queue, Terminals…) takes that width.
  One setting on the bottom panel with four options, in Settings → Layout, as a quick pick in the bottom
  panel's ⋯ menu, and for Claude through `jig_get_layout` / `jig_change_layout`. Details below are
  Claude, on my own.
- **Model:** `Layout.bottomSpan`, one of `center` (under the centre only, both sidebars full height),
  `left` (also under the left sidebar), `right` (also under the right sidebar), `full` (the whole window
  width). Part of the layout, not of `config.json`: it is where the panels are, so it is saved with
  `layout.json`, kept in named layouts (`SavedLayout.bottomSpan`, optional; older named layouts leave
  it as it is), reset by Reset layout, and undone like any layout change from a chat's change card.
- **Default `right`, not `center`.** The request described today's layout as "both sidebars run all the
  way down", but the code had the bottom panel running under the centre *and the right sidebar* (the
  right sidebar sat above it). The default keeps what every user already sees; nobody's window changes
  until they pick another shape. Flip `DEFAULT_BOTTOM_SPAN` if centre-only should be the default.
- **One grid, panels never remount.** The workbench lays the sidebars, the main area and the bottom
  panel out on one CSS grid (`Panels` in `Workbench.tsx`: columns `auto 1fr auto`, rows `1fr auto`);
  the option only changes `grid-template-areas`. Every panel stays mounted in the same element, so
  switching keeps terminals, views and scroll positions, and widths, heights, collapsed and hidden
  states are untouched (`setBottomSpan` changes nothing else). A collapsed or empty sidebar is a
  zero-width column, a collapsed bottom panel a zero-height row, so every combination works without
  special cases.
- **Menu:** a new `MenuEntry` kind, `{ label, choices }`: a row of small icon buttons (`menuitemradio`,
  the current one marked with the accent), choosing one closes the menu. The shapes are drawn by
  `BottomSpanIcon` (`workbench/bottomSpan.tsx`), a tiny picture of the window in the text colour at
  Lucide's stroke width, since Lucide has no icon for each shape. Settings → Layout uses the same
  pictures in a `SegmentedSwitch` (Centre / Left / Right / Full), first in the section.
- **Tools:** the layout op `{ op: "span", span }` (chat tools and the builder's `stage_layout`);
  `jig_get_layout` reports `bottom panel width`.

## D-376: A limit nobody answers resumes by itself at the reset

Extends D-338: the limit card's question stays, but leaving it unanswered no longer leaves the chat
stopped for good.

- Status: accepted.
- **Who:** Jon, 2026-11-05 (the question stays, answering always wins, the chat shows it waits and
  when it resumes, you can cancel, a queued task waits instead of failing, never twice or after you
  took over; reuse the reset time Jig's usage meter already shows). The rest is Claude, on my own.
- **Where the reset comes from:** both providers say it. Claude: the `rate_limit_event` before the
  limit error (or an old message's `|<seconds>` ending); ChatGPT: the latest
  `account/rateLimits/updated`. Missing that, the usage meter's full window (`planResetsAt`, the
  same data as the status bar's usage card). Nothing was infeasible for either provider.
- **Model:** with `ask` and a reset ahead, `limitHit` puts the chat in the existing `waiting` state
  with `ChatLimit.auto: true`, so everything waiting already does (the timer, re-arming at start,
  the task queue keeping the task running with `limitResetsAt`) applies unchanged. The card stays
  `waiting` with Continue (when the other plan has room) and "Resumes by itself at 14:00 unless you
  choose" with **Don't resume**, which is `cancel`: back to `ask`, the card's Wait and Dismiss, and a
  queued task that needs you. Choosing Wait yourself drops `auto`. No new setting: `ask` now means
  "ask, and resume at the reset if I don't answer"; the setting's description says so.
- **Answers win, once:** Continue, Dismiss, Don't resume, a message of yours and a handover all end
  or change the wait before the timer can fire; the resume clears `meta.limit` before its turn
  starts, so the timer, a wake and a restart can't each resume it.
- **A reset already in the past doesn't wait** (any policy): the meter is stale and a resume would
  hit the same limit again, every second. The card just asks. No backoff retries: with a reset known
  for both providers there's nothing to guess.
- **Jig closed or the computer asleep at the reset:** a waiting chat is resumed a moment after Jig
  starts (as D-338's explicit wait already was), however long ago the reset was: you left it to carry
  on. Timers can be put off by a sleep, so `powerMonitor` `resume` and `unlock-screen` call
  `SessionManager.wake()`, which resumes the chats whose reset passed and re-arms the others.
- **Visible:** the chat header says "Waiting for the limit · resumes 14:00" instead of "Limit
  reached"; a waiting task has a clock mark left of its Running badge (the quiet-mark slot, nothing
  moves) and the dashboard's Now row says "Resumes at 14:00".

## D-377: Phone channels: one PhoneChannel interface, messages in a small HTML subset

- Status: accepted. Phase 27 session 1 (the groundwork for D-370's Teams channel).
- **Who:** Jon chose one channel at a time and a shared phone product behind a `PhoneChannel`
  interface (D-370). How it is cut: Claude, on my own.
- **The interface** (`main/phone/channel.ts`): who the bot is (`identify`), long polling (`poll` +
  `read`, which turns the channel's update into Jig's `PhoneUpdate`: a message with sender, chat,
  place, reply-to, text or voice, or a tap), `send` (text, buttons, silent, mention, reply-to,
  picture), `edit`, `typing`, `answerTap`, places (`createPlace` for Jig / a project / a chat with an
  optional parent, `renamePlace`, `deletePlace`), and optional `setCommands`, `sendVoice`,
  `download`. Failures are a `ChannelError` with a reason (`auth`, `conflict`, `unreachable`,
  `gone`, `unchanged`) and the user's words; the service decides what to do with each. What a
  channel can do is `PHONE_CHANNEL_CAPABILITIES` in `shared/phone.ts` (voice, silent, edits, places,
  commands), like `ENGINE_CAPABILITIES`; Telegram's places also depend on its bot having topics on.
  `PhoneService`, `mirror.ts` and `concierge.ts` use only this; `TelegramChannel` (`telegram.ts`)
  holds everything Telegram-specific (topic colours, the caption limit, `getUpdates`' offset, the
  "thread not found" and "not modified" errors).
- **Messages stay a small HTML subset, not Markdown** (a change from the plan's "Markdown text +
  button rows"): `messages.ts` and `mirror.ts` already mask and escape everything from a chat and
  produce `<b>`, `<i>`, `<code>`, `<pre>`, `<a href>`; Teams renders that same subset in bot
  messages, so a Teams channel needs at most small changes and the masking/escaping stays in one
  pure place. Markdown would have needed a second escaping layer per channel, and the existing
  tests (which had to pass unchanged) assert this markup. Buttons stay rows of text + data
  (≤ 64 bytes, Telegram's limit for all), which Teams turns into Adaptive Card actions.
- **Ids are the channel's own:** message refs and places are `number | string` (Telegram's
  numbers, Teams' strings), so `phone.json` keeps Telegram's shape and old files stay valid.
- **Saved state per channel:** `phone.json` is `{ telegram?, teams? }`; the flat file from before is
  read as Telegram's. `phone.channel` ("telegram" default, "teams"; protected with the rest of
  `phone.*`) picks one; switching disconnects the other (its goodbye message, its entry removed)
  and reads the new one's. Until the Teams channel exists, picking it leaves the phone off and
  Connect says Teams isn't in this version yet.
- Found on the way: `rooms` was never read back from `phone.json` (the schema didn't list it), so
  rooms were forgotten on restart; the per-channel schema keeps it.

## D-378: Teams relay: plain fetch, what it keeps, pairing and the tenant check

- Status: accepted (phase 27 session 2; nothing deployed yet).
- **Who:** Claude, on my own, building D-370's relay from the queued task (Jon: "never create Azure
  resources or deploy in this task").
- **No Bot Framework SDK.** It was archived and Microsoft stopped supporting it on 2025-12-31; the
  successors (Teams SDK, M365 Agents SDK) bring a whole app framework for four REST calls. The relay
  (`relay/teams/`) talks to Microsoft with `fetch`: client-credential tokens from the bot's own
  tenant (`login.microsoftonline.com/<tenant>`, scopes `api.botframework.com/.default` and
  `graph.microsoft.com/.default`), the Bot Connector's `v3/conversations` calls, and Graph's
  channel calls. The incoming JWT is checked by hand with `node:crypto`, every step Microsoft's
  page lists: RS256, issuer `https://api.botframework.com` (also for single-tenant bots), audience
  the app id, 5 minutes of skew, a key from the OpenID metadata (cached, refreshed every 12 h and
  once for an unknown key, at most every 5 minutes), the key's endorsement of `msteams`, and the
  `serviceurl` claim equal to the activity's. A failure answers 403.
- **One bundled file.** esbuild bundles the relay with `@azure/functions` and `@azure/data-tables`
  into one CommonJS `index.js` (zip ~140 KB, no node_modules, no remote build); Flex Consumption
  runs the zip as deployed (`az functionapp deployment source config-zip`). The installer carries it
  in `resources/relay/teams-relay.zip`.
- **What it keeps.** Activities only from the bot's own tenant. Before pairing, only a 6-digit code
  written in a 1:1 chat; once paired, only the paired account (Entra object id + tenant); the bot's
  install and channel events always (no text, and they tell Jig the team and channels). Kept
  trimmed (no attachment contents, text cut at 16 000 characters) in one table of the Function's
  storage account. Table storage has no expiry of its own, so `after` hides anything older than 24 h,
  an hourly timer deletes it, and `GET /api/updates?after=n` deletes what Jig confirmed (≤ n).
  Cursors come from a counter row advanced with its ETag, so instances never share one. Records:
  the pairing, the 1:1 chat per account, the team (with its Microsoft 365 group id for Graph) and
  its channels.
- **Pairing is Jig's call.** The relay doesn't know the code: Jig reads the code from the updates
  and calls `PUT /api/pairing` with the sender's object id (the relay then forgets the other
  accounts' 1:1 chats); `DELETE /api/pairing` is Disconnect (forgets the pairing, 1:1 chats and
  every waiting update). An endpoint the plan didn't list.
- **Channels with RSC** `Channel.Create.Group` (make) and `ChannelSettings.ReadWrite.Group`
  (rename); `GET /api/health` probes the grant by listing the team's channels (403 = not granted),
  cached 5 minutes, and a 403 from making a channel answers `rsc_missing`, so Jig falls back to
  General threads (D-370).
- **The tenant check** is a tab-only package (`npm run teams:check -- package --app-id …`, into
  `.tmp/teams-check/`) with the same RSC request, tied to an app registration Jon makes himself:
  RSC needs `webApplicationInfo.id` to be an app registered in the user's own tenant, so a made-up
  id would not show what the real bot meets. `teams:check -- prove` then makes and renames a
  channel with that app's own token, the same call the relay makes. Instructions in the plan.

## D-379: Teams phone channel: the 1:1 chat through the relay

- Status: accepted.
- **Who:** Claude, on my own, building phase 27 session 3 from the queued task (Jon asked for the Teams
  channel, D-370; how it is cut is mine).
- **The 1:1 chat first, through the same `PhoneChannel`.** `main/phone/teams.ts` is a client of the
  relay (`GET /api/updates` long poll, 25 s, the service's backoff and warnings) and a
  `TeamsChannel`. The account is the Entra object id; only the 1:1 chat (`personal`) counts as
  private, so channel posts wait for session 4's places (`identify` reports no places yet).
- **The credential is one string, `https://<relay>#<key>`** (`TEAMS_CREDENTIAL` in `shared/phone.ts`),
  so `phone.json`, `phone.connect` and safeStorage stay as they are for Telegram's token. The key
  travels only in the `x-jig-relay-key` header, never in URLs, messages or logs; the address isn't a
  secret. `JIG_TEAMS_RELAY` replaces the address only with the fake engine (tests).
- **Pairing goes through the channel:** `PhoneChannel` gained optional `pair(account)` and
  `unpair()`. After the right code, Jig calls `PUT /api/pairing` before saving the owner (refused =
  stay unpaired); Disconnect calls `DELETE /api/pairing` after the goodbye.
- **One Jig per relay, like Telegram's 409:** Jig sends a stable reader id (`x-jig-reader`, a hash of
  the computer's name and the Jig home); the relay answers `409 another_reader` to another reader
  while the last one polled within 90 s, which Jig shows as the conflict warning. A small relay
  change (protocol + `updates`), made together on both sides.
- **Rendering:** text is Teams' `xml` format, the same HTML subset with `\n` as `<br>` outside
  `<pre>`. A message with buttons is an Adaptive Card 1.5: its text as TextBlocks (bold, italic,
  links as card Markdown; `<pre>` monospace; inline code plain, cards have no code style), one
  `ActionSet` per button row, `Action.Submit` data `{ jig: <Telegram's callback data> }`, so taps parse
  the same way; a card stays a card when updated (answered: same text plus the answer line, no
  buttons). The card's first line is the notification's preview (`summary`).
- **Taps:** Teams has no toast for a tapped card, so only a refusal ("This is no longer waiting.") is
  written back as a message; taps older than 10 minutes are ignored (Jig was closed).
- **Commands:** Teams' command menu comes from the app package (`teamsCommandLists(COMMANDS)`, for
  session 5's package); picking one sends the bare title, so `status`, `screen`, `close`, `chats`,
  `help` alone and `queue|pause|resume` with up to three words become commands. Anything longer
  stays text for Jig itself.
- **Replies:** Teams' 1:1 chat has no reply threads; a quoted message (`<blockquote itemid>`) or
  `replyToId` is used when present. Whether Teams sends the quote's id to bots in the 1:1 chat needs
  the real check; per-chat threads (session 4) are the dependable way to talk to one chat.
- **Pictures** are fitted to Teams' inline limit in main (`nativeImage`: ≤ 1024², JPEG at falling
  quality until ≤ 1 MB); one that can't fit is left out with a note. No typing indicator (the relay
  has none), no silent messages, no voice (D-370).

## D-380: Teams phone: the Jig team, a channel per project, a thread per chat

- Status: accepted (phase 27 session 4).
- **Who:** Jon asked for the team, channels and rooms (D-370); how they map onto `PhoneChannel`:
  Claude, on my own.
- **Places on Teams:** Jig's place is the team's General channel (its id is the team's), a
  project's is a channel of its own (`POST /api/channels`, named after the project), a chat's is a
  thread in its project's place (`createPlace` kind `chat` posts the thread's first message, the new
  `PlaceSpec.heading` "💬 chat · project", and returns `<channel>;messageid=<root>`). Sending to a
  thread replies in it; sending to a bare channel id starts a post. The team comes from the relay's
  `/api/health` (learned from the install event); no team = no places, and `identify` returns a
  `note` that Settings → Phone → Team shows (`PhoneState.topicsNote`).
- **A thread per chat, not per room** (capability `threads`, Teams only): unlike Telegram, where a
  project's chats share its topic, every chat that writes gets its own thread (`SavedPhone.threads`),
  and what you write there goes to it. A room is that same thread following the chat live
  (`mirror.ts` as for Telegram), so Open thread / `/chats` / Open on my phone reuse it; `/close`
  stops following and posts a note (a bot can't delete a thread; Jig never deletes channels).
  Jig itself, the test and pairing stay in the 1:1 chat; a new post in a project's channel goes to
  Jig itself with that project (`PhoneUpdate.area`: the thread's channel).
- **What waits goes twice:** the full card in the chat's thread with an @mention (channels only
  buzz for mentions) and a short card in the 1:1 chat (`shortCopy`: head, project, one line, the same
  buttons). Both are kept on the `SentRequest` and both are updated when it's answered, from either
  or from the computer.
- **Places change on the phone:** the channel reports `PhoneUpdate` kind `places` from the relay's
  events: the bot added to a team (Jig says hello in General), a channel deleted (its project and
  chat threads are forgotten and made again on the next message), the bot removed or the team
  deleted (everything but the 1:1 chat forgotten). A send that answers 404 is treated the same.
- **Renamed with the project:** `names` keeps the name each project's place got; when projects
  change, `renameTopics` renames Telegram topics and Teams channels (not General, not threads).
  This also closes Telegram's old gap.
- **Without RSC:** a 403 `rsc_missing` (or health saying `missing`) makes project places General;
  threads are headed with their project, a post in General isn't tied to any project, and the note
  says why. Granting it later only helps projects that haven't written yet (gap, until Disconnect).
- **Reading threads needs another grant:** a bot receives channel messages only when @mentioned
  unless the team grants `ChannelMessage.Read.Group`; the tenant check's package now asks for it and
  session 5's app package must too. Without it you @mention Jig in the thread (the mention is
  stripped from the text).

## D-381: Teams setup in Settings → Phone: one modal, Create runs listed az commands

- Status: accepted (phase 27 session 5; never run against real Azure in the build, Jon's real check is
  session 6).
- **Who:** Jon asked for setup in one modal where Jig creates the Azure pieces with his `az` (D-370);
  how the modal and the runner work: Claude, on my own.
- **Settings → Phone starts with the channel** (a segmented Telegram | Teams control, always first);
  switching asks first only when the current channel is set up, and disconnects it (D-377). Switching
  away from Teams keeps the setup's record, so switching back and pressing Continue reconnects the
  same Azure pieces (a new secret and key, below).
- **One modal, a fixed list on the left, the picked row's detail on the right** (stacked in a narrow
  window): 1 Where, 2 Create (eight steps), 3 Add to Teams (package, upload for yourself, a private
  team, add the app to it), 4 Pair. Every row has the same slots (number, title and what it makes,
  status at the far right); the detail has a fixed footnote for the hint or the error, so nothing
  moves when a step finishes or fails. While Create runs, the selection follows the running step.
- **Opening the modal only reads** (`az account show`, `account list`, `functionapp
  list-flexconsumption-locations`); every creating command is listed with placeholders before it
  runs, and runs only on Create, in order, from the first not done, with Jig's `az` for the active
  tenant (`runAz` + `azureContext`). A failure stops there with az's error; Retry goes on from it.
  Only subscriptions of the active tenant can be picked (D-370: the bot in another tenant's
  subscription stays unsupported until the tenant check proves it).
- **What Create runs:** `ad app create` (single-tenant) and `ad sp create`; `provider register
  --wait` for Microsoft.Web, Microsoft.Storage and Microsoft.BotService (a fresh subscription refuses
  `bot create` without it); `group create`; `storage account create` (Standard_LRS, TLS 1.2, no
  public blobs); `functionapp create` (Flex Consumption, Node 22) and `functionapp show` for its
  host name (Flex hosts aren't always `<name>.azurewebsites.net`); `config-zip` with the relay
  package; `ad app credential reset --append` (2 years) and `functionapp config appsettings set`;
  `bot create` (F0, SingleTenant, endpoint `/api/messages`) and `bot msteams create`; then Jig asks the
  relay's health until it answers (up to 4 minutes) and connects (pairing). The settings go in before
  the bot so the relay is configured before Teams can reach it. Names: `jigphone<6>` and
  `jig-phone-<6>` (a random suffix), the group `jig-phone` unless you change it.
- **Secrets:** the bot's secret is read from `credential reset`'s answer into memory and handed to az
  only in a private temporary file (`--settings @file`, deleted right after), never as an argument,
  never shown, saved or logged; it's dropped once the settings are set. The relay key (32 random
  bytes, base64url) is made in memory at the same step and lives until `phone.connect` stores it
  encrypted. After a restart in between, Continue runs the settings step again (a new secret and key).
  `phone-teams-setup.json` keeps only the choice, the app id, the host and which commands are done.
- **The relay tells setup about the app:** `Health.app` (new, `protocol.ts`): someone in the bot's
  tenant added the app for themselves (its install event or a 1:1 message), before pairing too; the
  team comes from `Health.team`. The modal asks every 5 s while it waits, and ticks the rows.
- **The app package** (`teamsAppManifest`): manifest 1.17, the bot app id as the package id (a new
  package replaces the app), the bot in `personal` and `team`, the command list (D-379), RSC
  `Channel.Create.Group`, `ChannelSettings.ReadWrite.Group`, `ChannelMessage.Read.Group` (one list in
  `protocol.ts`, shared with the tenant check), `webApplicationInfo` = the app id, icons from Jig's
  logo (192² colour, 32² white outline). Written to `~/.jig/teams/jig-teams-app.zip` and shown in the
  file manager on a click (never into a repository or Downloads by itself).
- **Made in the portal by hand** (`docs/guides/teams-phone.md`): the modal's "Made it in the portal…"
  takes the app id and the relay's `https://<host>#<key>` (a key you put in `JIG_RELAY_KEY`), like
  the Telegram token's paste, and marks Create done.
- **Never deletes Azure:** Disconnect (Teams) and Start over list what setup made with `az group
  delete …` and `az ad app delete …` to copy, then forget the record; they run nothing.

## D-382: Teams captions: FeatureNotSupported right after Connected means not known yet, not a policy

- Status: accepted. Amends D-321.
- **Who:** Jon reported it (2026-11-05, Sprinta Daily, on a build with D-321); the fix and its
  timings are Claude, on my own.
- **What happened.** The transcript said "Captions could not start: Captions feature is disabled in
  meeting policy. (403/45203). Teams says captions aren't allowed for you here (FeatureNotSupported)…"
  43 ms after Connected, after one try, although captions were on in that meeting, the same meeting
  worked on 0.3.0 and colleagues on older Jig got captions. D-321 listed `FeatureNotSupported` (and
  `NotCapable`, `CapabilityNotApplicableForTheCallType`) as restrictions and treated only
  `NotInitialized` as "still loading". With the warm call agent (D-292) the SDK evidently reports
  `FeatureNotSupported` for `startLiveMeetingCaptions` before the meeting's capabilities arrive: the
  same race D-321 fixed, under another reason name.
- **Decision.** Only reasons that name a policy (`MeetingRestricted`, `UserPolicyRestricted`,
  `RoleRestricted`, `TeamsPremiumLicenseRestricted`) can stop the tries. `FeatureNotSupported` counts
  as "not known yet" like `NotInitialized`: the start waits up to 8 s for `capabilitiesChanged`, and a
  failure is retried with D-321's backoff (2, 4, 8, 15, 30 s). Every other non-policy reason is
  retried too; when the tries run out the notice says what Teams reported, without blaming the
  organiser. A policy reason read before the meeting's capabilities arrived (within 10 s of Connected,
  `CAPABILITY_GRACE_MS`, and no `capabilitiesChanged` yet) gets one more try, since right after
  Connected the SDK's answer isn't the meeting's yet; a `capabilitiesChanged` during that wait tries
  at once. Read later, or on the second try, a policy reason stops at once as before.
- **Logs.** `meetings.status` takes an optional `detail` that only main.log gets (never the record):
  the caption capability's `isPresent` and reason, the try number and the ms since Connected, on
  "Starting captions", each failed try and "Capturing live captions"
  (`startLiveMeetingCaptions: not present (FeatureNotSupported); attempt 1, 43 ms after Connected`).
- **Retry captions** starts the tries from the first (attempt 0, pending retry cancelled), logs
  "Starting captions" and keeps the call's Connected time and whether capabilities arrived.
- Pure logic: `shared/meetingTranscript.ts` (`captionStartDecision` with `early`, `capabilityPending`,
  `capabilityText`).

## D-383: Meeting transcripts name you by your real name, in Teams captions and the local transcript

- Status: accepted. Amends D-321 (local lines said "You").
- **Who:** Jon reported it (2026-11-05, Sprinta Daily): with Teams captions running, his own lines
  showed his picture but "Unknown speaker"; colleagues' lines had names. Asked for the real name in
  the stored transcript so notes say who spoke. The details are Claude, on my own.
- **Cause.** Teams sends your own captions with your identifier but an empty `displayName`; Jig wrote
  `displayName || "Unknown speaker"`. The picture matched because it is looked up by `speakerId`.
- **Decision.** `captionSpeakerName` (`shared/meetingTranscript.ts`): the name Teams sends; else, when
  the id is yours, your name from the meeting sign-in; else the matching remote participant's name;
  "Unknown speaker" only when nothing matches. Ids compare with or without `8:orgid:`, case-blind
  (`sameTeamsUser`). Your identity reaches the call window with `meetings.credential`'s new `self`
  (`8:orgid:<object id>` and the MSAL account's name, else the username): an id and a name, not a
  credential.
- **One name per person.** The local transcript (D-321) now writes your microphone's lines with the
  same id and real name (it still says "You" with id "you" when the sign-in has no name), so your
  Teams and local lines carry one name and your picture. Others' local lines already use the
  participant's raw id and name (`attributePiece`). Notes already tell Claude your display name, so
  `mine` actions keep working.

## D-384: Live caption translation keeps up: batches, skips stale lines, says Not translated

- Status: accepted. Amends D-277.
- **Who:** Jon reported it (2026-11-05, a live meeting): every caption line showed "Translating…" for
  minutes and the translations never caught up. Asked for translation that stays live with either
  provider. The numbers and wording are Claude, on my own.
- **Cause.** `CaptionTranslator` chained every final caption one after another. With Meeting translation
  on ChatGPT (`ai.meetingTranslation = chatgpt`) each caption was its own `codex exec` (a cold Codex
  start, 60 s timeout), slower than people talk, so the queue only grew; nothing failed, so nothing
  said so. The local Whisper transcript (D-321) adds many short final pieces, which made it worse.
- **Batches.** Captions waiting go in one request, numbered (`<caption n="1">…`), and the answer comes
  back as `<t n="1">…</t>` per caption, mapped back by number (`shared/translationQueue.ts`:
  `batchPrompt`, `parseBatch`). A single caption answered as plain text still counts. Fewer cold starts
  with Codex, fewer round trips with Claude's warm completer.
- **Stale lines are skipped.** Before each request (`takeBatch`): captions that waited over 20 s
  (`MAX_WAIT_MS`), beyond the newest 6 (`MAX_BATCH`), or for another meeting or language are skipped
  and stay as spoken. The record counts them (`translationSkipped`, reset when the language changes)
  and the Transcript header says "Translation skipped N lines to keep up".
- **"Translating…" is honest.** A caption skipped, left out of the answer or in a failed request gets
  `untranslated: "skipped" | "failed"` and shows **Not translated** (tooltip says which) in the same
  reserved second line, so nothing moves. A final caption Teams sends again unchanged keeps its
  translation or mark (`mergeCaption`) and isn't translated again.
- **ChatGPT stays one `codex exec` per request for now.** The warm Codex completer planned with the
  editor's ChatGPT completion (one `codex app-server` reused) hadn't landed when this was built; use it
  here when it does instead of building a second warm Codex. Until then Settings → AI features says
  beside Caption translation, while ChatGPT is picked, that it's slower and Claude keeps up better.
  Claude stays the default provider for this feature.
- Also: the stored caption schema keeps `source: "local"` (D-321), which a restart used to drop.

## D-385: Your Teams chat with yourself (48:notes) in Chats, built from its messages

- Status: accepted.
- **Who:** Jon asked for it (2026-11-05): the Chats tab should list Jon's Teams self-chat, readable,
  sendable and mentionable like other chats. How it's built is Claude, on my own.
- **What Graph does (checked with Jon's own sign-in, Chat.Read + ChatMessage.Send, 2026-11-05).**
  `/me/chats` never returns the self-chat: all 246 of Jon's chats over 6 pages, none with an id outside
  `19:…`. `GET /chats/48:notes` (with or without `$expand`, and `/members`) answers 400 "Call made for
  a thread which is not a ChatThread". `GET /chats/48:notes/messages` works (newest first, also with
  `$orderby=lastModifiedDateTime desc` and a `$filter`, as `jig_teams_chat_read` pages), and
  `POST /chats/48:notes/messages` sends (201).
- **So Jig builds its row.** `TEAMS_CHAT_ID` accepts `48:notes` (`SELF_CHAT_ID`). `MeetingAuth.chats()`
  always adds it like the pinned extras; `chat("48:notes")` reads its 5 newest messages and
  `selfChat()` (`shared/meetingChat.ts`) turns them into a chat: you as its one member, the newest
  message as the preview, read up to it (only you write there). When its messages can't be read it
  gets no row. `toChatSummaries` names it "<your name> (You)" (just "You" without a name) as a
  one-to-one chat whose "other person" is you, so the row has your picture and status and a search
  for your own name finds it; it sorts by its last message like every chat.
- Opening, sending, `@chat` and `jig_teams_chat_read` then work unchanged, since they go through the
  messages endpoints. Avatar initials skip words that don't start with a letter ("(You)").

## D-386: Usage limits and closing a phone room as Jig tools

- Status: accepted.
- **Who:**
  Jon asked for both tools (2026-11-05, task queue): a tool that reports both providers' usage
  limits, reusing what Jig already shows, and one that closes a chat's room on the phone like /close.
  Names, shapes and wording are Claude, on my own.
- **`jig_usage_limits`** (read only, `main/usage/index.ts`): the footer's numbers, the same two
  `UsageService`s (Claude Code's `/usage`, Codex's `account/rateLimits/read`, D-298), no new way to
  fetch. It asks again first when the numbers are over a minute old (`UsageService.fresh`), then
  `usageReport` (`shared/usage.ts`) writes per window: % used, % left, when it resets (relative and
  ISO), extra usage, a reached limit and, after a failed ask, that these are the last known numbers.
  A provider with no windows says "no limit data" with the reason the footer gives; one not asked yet
  says Jig hasn't heard from it. Never a guessed number.
- **`jig_phone_close_room`** (`main/phone/index.ts`, `PhoneService.closeRoomOf`): the same
  `closeRoom` as /close (Telegram deletes the topic; Teams stops following live, the thread stays). It
  never touches the chat. Without `chatId` it closes the calling chat's own room. It answers plainly
  when the phone isn't connected, the chat doesn't exist, or it has no room open. Marked `readOnly`
  like `jig_chat_open`: it only stops the phone following a chat, and the room opens again.
- Both are on the `jig` server, so every chat and the phone's concierge get them (the concierge
  finds them with the tool search; its prompt and `jigContext` name them). Neither is `alwaysLoad`,
  to keep every chat's prompt small.

## D-387: Hey Jig in the status bar: always shown, click on/off, right-click menu, one icon per meaning

- Status: accepted.
- **Who:**
  Jon asked for it (2026-11-05, task queue): the status bar's "Hey Jig" always shown and working as
  an on/off switch. With Jon the same day: a left click toggles, a right-click opens the menu, no
  chevron, and the same entries are in Settings → Speech → Hey Jig so nothing is right-click-only.
  The icon scheme and the disabled "Train" entry are Claude, on my own.
- **Always shown** (`commands/WakeStatus.tsx`), in its fixed `w-24` slot, so turning it on or off
  never moves the status bar. Off: dimmed, "Hey Jig", title "Hey Jig is off · Click to listen ·
  Right-click for more". On: the phases as before (D-278), title ending "Click to turn off ·
  Right-click for more".
- **A click** runs `toggleWake` (`commands/toggle.ts`), the same function as the Jig menu action
  `jig.wake.toggle`. `speech.wake` stays protected (D-077): chats still can't turn it on; a click on
  the item is the user's own action, like the switch in Settings.
- **Right-click** (`contextMenu(wakeMenu)` through `ui/Menu.tsx`): Train Hey Jig… (disabled, "Soon",
  until the training task builds it), Voice commands… (What Jig can do → Voice commands), Speech
  settings…. Settings → Speech → Hey Jig has Train…, Show the commands and the rest of the settings.
- **One icon per meaning:** Mic = listening for "Hey Jig"; MicOff = not listening (Hey Jig off, as
  MicOff means a muted microphone in the talking window); VolumeX = Jig's own voice muted (shown
  after the label while on; Volume2/VolumeX on Settings' new "Jig's voice" Mute/Unmute row, which
  sets the same in-memory mute as "Hey Jig, mute"); ScrollText = the voice commands list (was Mic in
  Settings); AudioLines = training. The muted voice used to share MicOff with nothing else, which read
  as "not listening" although Jig was.

## D-388: Training Hey Jig stores no audio unless template matching proves necessary

- Status: accepted.
- **Who:**
  Jon approved it (2026-11-05) for the training task ("Train Hey Jig on your voice"), before it is
  built.
- **The rule:** training keeps no recordings of the user's voice. It keeps only what the training
  learns as text or numbers (the spellings Whisper writes for "Hey Jig" in this voice, thresholds),
  and the audio of each attempt is dropped once it is read, like listening itself (D-278).
- **Exception:** only if matching against audio templates (comparing sound, not text) proves
  necessary for "Hey Jig" to be heard reliably may training store audio, and then it gets its own
  decision first: what is kept, where in `JIG_HOME`, and a way to delete it in Settings.

## D-389: Train Hey Jig: five takes, learned spellings, sounds-like matching, tuned thresholds and a Whisper prompt

- Status: accepted.
- **Who:**
  Jon asked for it (2026-11-05, task queue): "most of the times it doesn't react when I say 'Hey
  jig'… When I set up Siri I had to say Hey Siri a few times… it should ask me to do it if it's not
  set." The storage rule is D-388, which Jon approved. The matching rules, thresholds, prompt and
  layout are Claude, on my own, based on the measurements below.
- **What was measured** (no microphone in tests, so a lab in `.tmp`, not kept). Windows' own voices
  (David, Zira, and Helena, who has a Spanish accent) said "Hey Jig" with commands, plus 60 sentences
  that aren't for Jig ("Hey Jake…", "Hey, did…", "Hey Siri…", "a gig tonight"). Whisper small (Jon's
  model, the app's q4 decoder) read the first 2 s, as listening does. The English voices were heard as
  "Hey jig" every time. The accented voice was heard as "Hey you", "Hey, big", "Hey, Geek", "a big",
  "Okay, you", "Any way". None of these were in the fixed spelling list, which explains Jon's misses.
  Prompts tried, with the new matcher (48 "Hey Jig" clips, 60 others): none 40/48 heard, 1 false wake;
  " Jig" 41/48, 2; " Jig." 43/48, 2; **" Hey Jig, run the tests." 48/48, 3**. All of the false wakes
  were "Hey, gee", which sounds almost the same. An earlier run showed "Hey Jig." alone makes Whisper
  drop a real "Hey Jig" as already said, and two "Hey Jig" sentences make it write "Hey Jig" for "Hey
  Jake" (14 false wakes).
- **(a) Learned starts:** the training keeps the starts the defaults don't hear as "Hey Jig" ("hey
  you"), at most three words. A greeting alone or a sentence is never learned. `matchWake` accepts
  them as wake words.
- **(b) Sounds like "jig"** (`match.ts`, `SOUNDS_LIKE_JIG`): after a greeting, a word with a j-like
  start (j, g, dj, z, ch, sh, b, d), a short i (e only after j/g) and a hard end; also "jeep", the
  letter "g" and "heyjig" as one word. After "a", only the real spellings count ("a big deal").
  "Jake", "Jack", "Jim", "Jeff", "Jill", "check", "did", "give" don't match. The unit tests use the
  recorded transcriptions, both kinds.
- **(c) Thresholds from your takes** (`tuning.ts`): the loudness gate drops to a third of your median
  take loudness and the voice score to 0.2 under yours. Training never makes Jig stricter than the
  defaults, and never goes under a floor (gate 0.005, score 0.45). The audio kept from before the
  voice was noticed went from 0.3 s to 0.5 s for every user, so a soft "hey" isn't cut.
- **(d) Whisper prompt:** transformers.js 4.3 has no `prompt_ids` (it is commented out in Whisper's
  `generate`). `decoder_input_ids` does reach it through the pipeline, so the worker builds
  `<|startofprev|>` + prompt + the usual start tokens itself (`promptIds`) and cuts the prompt off the
  result. `WAKE_PROMPT` = " Hey Jig, run the tests.", used **only** to decide whether something was
  "Hey Jig": on the first 2 s, and in the training so takes are read the same way. The prompt also
  bends the words after it ("open a new" → "open a new test"), so commands are always read without
  it. A short thing said that plainly misses is read a second time with the prompt.
- **No audio matching:** comparing sound (MFCC + DTW against the takes) isn't built. (a)–(d) covered
  every test clip, and it would need the takes' audio kept (D-388).
- **Asked when missing:** turning Hey Jig on (status bar, Settings switch, Jig menu action, all
  through `setWake`) with no `speech.wakeProfile` opens the training first. "Listen without training"
  still turns it on with the defaults. Train again: Settings → Speech → Hey Jig and the status bar's
  right-click menu.
- **Readout:** every wake check (what Whisper wrote, woke or not and why, loudness, voice score) is
  kept in memory (last 8), logged with `console.debug("[hey-jig]")` in dev, and the last four are
  shown in the training dialog under "Heard lately while listening". Nothing is written to disk.

## D-390: A default reasoning effort for Claude chats; effort defaults fall back per provider

- Status: accepted.
- **Who:**
  Jon asked for the setting (2026-11-05, task queue t103/t148): "a default reasoning effort for new
  Claude chats", with Settings → Chats as its place. The fallback order and the ChatGPT fix are
  Claude, on my own, as the task asked to decide them.
- **What:** `engine.effort` (`""` | `low` … `max`, default `""` = the model's own default) is the
  reasoning effort of new Claude chats. A new chat's defaults come from `chatDefaults`
  (`shared/chatDefaults.ts`, pure and unit-tested): the project's model and effort first, but only
  for the project's own provider (D-309); each one the project leaves empty falls back to Jig's for
  the chat's provider: `defaultModel`/`effort` for Claude, `codexModel`/`codexEffort` for ChatGPT.
  Settings → Chats → Claude chats → **Reasoning effort**, styled like ChatGPT's.
- **No model check:** Claude Code ignores an effort the model doesn't support (Haiku), the same as
  a project's effort today, so the default is passed as is.
- **The ChatGPT quirk was a bug, fixed the same way:** a ChatGPT project without an effort of its own
  gave its new chats no effort instead of `engine.codexEffort`, and so did any project that set a
  model (the model branch returned the project's effort, empty or not). Nothing chose that: the
  project-model shortcut and the `project?.provider === "codex"` test were written for the case where
  the project sets both. Now model and effort fall back independently, for both providers.
- **Why:** one rule ("the project's, else Jig's, else the model's") for both settings and both
  providers is what the Settings descriptions promise ("unless their project sets its own").

## D-391: Mark as done also for Partly done, Failed and Blocked tasks

- Status: accepted. Amends D-356.
- **Who:** Jon, 2026-11-05: he wants to close tasks a chat reported Partly done, Failed or Blocked
  when the rest of the work got finished elsewhere (e.g. a Partly done task whose remainder runs as a
  separate follow-up task), keeping what the chat said. Details below are Claude, on my own.
- **Rule:** `canMarkDone` accepts finished tasks in Error, No report, Partly done, Failed and
  Blocked; never queued, running, needs-you, skipped or already done. `markDone` keeps the chat's
  report in `markedDone.report` beside `was` (and `error`); the new report is `{ outcome: done,
  summary: your note or "Marked as done by you.", no notes or follow-ups }`.
- **Shown:** the details keep "Marked done by you …, was Partly done" and add a section "Its chat's
  report: Partly done" (its summary and notes) under the summary; the follow-ups list shows the
  chat's follow-ups so they can still be queued. Everything is there when the dialog opens, so
  nothing moves. The row keeps its quiet hand-set mark; Claude's list says "marked done by the user
  (was partly done)".
- **Late reports:** its own chat may still revise it (D-353), which replaces the mark's report, but a
  failed or blocked revision of a task you marked done never pauses the queue (`applyReport`): you
  already decided it's finished.

## D-392: Chat box: permission › provider › model at their natural width

- Status: accepted; amends D-364 (the permission button's place and its fixed slot) and through it
  D-347.
- **Who:** Jon, 2026-11-05: the fixed `w-48` slot left a big gap between "Don't ask" and the model
  button. He wants the order permission › provider › model, each button at its natural width (`px-2`,
  icon, label, chevron) beside the next with the toolbar's normal gap, and **explicitly accepts that
  these buttons shift when a label changes**. A deliberate exception to the no-layout-shift rule for
  this one group only.
- **The row's end:** `PermissionButton` (`permission-menu`), then `ProviderPicker` (`provider-menu`,
  never had a fixed width; builder chats have none), then the model button (`model-menu`), Stop, Send.
  Below `@2xl/toolbar` the permission button stays the icon alone in a centred `w-7` (label in its
  tooltip and accessible name), as in D-364. Its chevron lost a plain `block` that add-on CSS made
  win over `@max-2xl/toolbar:hidden` (D-297): the icon-only button showed a chevron spilling out of
  its slot (Claude, on my own).

## D-393: What's new: Jig's changelog in the app, from the release notes

- Status: accepted.
- **Who:** Jon, 2026-11-06: "we should have a changelog in the app so we can easily check". The
  shape is Claude, on my own.
- **Source:** the release notes `npm run release` already writes for GitHub,
  `release/jig-<version>-notes.md`. They were git-ignored (only on the releasing machine), so they
  are now tracked (`.gitignore`: `/release/*` with `!release/jig-*-notes.md`), and the release
  writes the new version's notes into its release commit, before the installer is built, so each
  installer includes its own notes. The publication commit adds them again in case a resumed
  release changed them.
- **Bundled, not fetched:** a Vite plugin (`apps/desktop/scripts/changelog-plugin.ts`) turns the
  files into `virtual:jig-changelog` at build time: version, notes, and the day from the version's
  tag (or, before the tag exists, the commit that added its notes). No network and no IPC; a build
  shows the notes up to its own version, which is what "what changed in what I'm running" needs.
  Newer versions' notes stay with Check for updates and GitHub.
- **Where:** the `jig.changelog` tab ("What's new", singleton), from the Jig menu (a "Jig" group
  action), the Version row in Settings → About (opens at the running version), a button on the
  What Jig can do page, and Get started's Updates card beside "Your version". That card also has
  **Releases on GitHub**, for versions newer than the build (Jon: the GitHub link belongs where Jig
  checks for updates and shows the version).
- **Layout:** like What Jig can do: a resizable version list (version, date, a dot for the running
  version in a fixed slot at the right) that hides in narrow tabs, and the notes rendered as
  Markdown, newest first.

## D-394: Tasks: a task whose turn Jig cut off by closing carries on once

- Status: accepted.
- **Who:** Jon, 2026-11-06 (task t150), after 2026-11-05: Jig restarted to install 0.14.0 while
  task t103 was investigating; the chat was idle afterwards, had answered since the task was sent and
  had no report, so the queue asked for the report ("Don't continue the task's work") and t103
  reported Partly done with only its investigation. The names and details are Claude, on my own.
- **The fact, from main:** `SessionMeta.cutOffAt`: set when Jig quits while a chat is working,
  starting or waiting for you (`shutdown`), or when it loads a chat saved busy (a crash or a killed
  process); cleared when the chat's next turn starts. Add-ons read it as `AddonChatInfo.cutOffAt`
  (`chats.get`). No new IPC method: chat state reaches add-ons only through the host API.
- **The rule, one place:** `afterTurn` (`addons/tasks/lib/tasks.ts`) returns `resume` when the chat
  is idle and was cut off after the queue's last message to it (the task, or its "carry on"), unless
  the task was already resumed, was asked for its report, has a report, or you stopped one of its
  turns. `resume` sends one message from the queue ("Task queue: Jig restarted, carry on with task N":
  carry on, check what was done, then report) and records `resumedAt`, so a task is resumed at most
  once. A second cut-off falls back to the D-318 rules (report request if it answered, else
  Interrupted). "Interrupted" moved into `afterTurn` too, only while catching up (`catchingUp`: the
  watcher and the view's read), as before; a chat's own status change waits instead.
- **Why not resume every time:** a task that keeps getting cut off (a crash it causes) would loop.
- The Tasks watcher now also runs a few seconds after Jig starts (`atStart`), so a cut-off task goes
  on right after a restart instead of up to a minute later.

## D-395: Tasks: queues hold while Jig installs an update, and pick up after the restart

- Status: accepted.
- **Who:** Jon, 2026-11-06 (task t150): the 0.14.0 install started in the same second the queue
  started its next task. The mechanism is Claude, on my own.
- **How:** a new Jig event, `app.updating` (`{ version? }`), for add-ons. Install and restart
  (`installWindowsUpdate`, after the quit modal) and the update from source call `announceUpdate`
  (`main/updates/announce.ts`), which runs the listeners `main/addons` registered: the event goes to
  the renderer and to every host listening, and the update waits for those hosts up to 1.5 s (within
  the installer's 2 s notice) before Jig closes. `dispatchEvent` takes an optional time limit for
  this; other events stay fire-and-forget.
- **The Tasks queue** (`updating`): every running queue pauses with `held: { reason: "update", at }`.
  A host that holds a queue remembers it in memory; a host that finds a hold it didn't make (Jig
  restarted) runs the queue again by itself (`releaseHold` in the watcher and the view's read), and so
  does one whose hold outlived 5 minutes (`UPDATE_HOLD_MS`: the install didn't happen). Start, Pause
  and Reset clear the hold. A task already running when Jig closes is carried on by D-394.
- **The release skill** never installs: it publishes, and Installed Jig offers the update; Install
  and restart is the user's. It now says the queue holds, so a release task needn't wait for anything.
- **Not done:** a "Jig is updating" label in the queue's header: the hold lasts the 2 s before Jig
  closes and ends right after the restart, so the paused state is hardly seen.

## D-396: Tasks: park a whole chat group, kept together in the pool

- Status: accepted; amends D-369 (a parked task always starts its own chat, a whole chat is never parked).
- **Who:** Jon, 2026-11-06: "i just realized, i cant park a group of tasks, i should". How: Claude, on my own.
- **State:** a parked task may continue the parked task before it, so a parked chat stays a group in the
  pool with its order and joins. Invariants: a parked task never runs; the pool's first parked task
  always starts a chat (`poolLast` fixes it after every change); nothing in the queue continues a
  parked chat and no parked task continues one of the queue (the pool is always last).
- **Park and unpark** (`setParked`): tasks that go together keep their joins (a task stays in its chat
  only when the task before it goes too); the first of them, and any task that goes alone, starts its
  own chat. Parking a group puts it at the pool's end; unparking puts it last before the pool, as
  before (left out, until the stop-line task changes that). Single tasks behave as before; moving one
  task out of a parked group splits it like in the queue (the next task takes over the chat).
- **Moves:** the pool's drop slots mirror the queue's: inside a parked card a single task joins that
  chat (`join` slots with `parked`), a whole chat lands between cards and in the pool's end, so a
  whole chat can be dragged into the pool (the old "goes to the end of the queue" fallback is gone).
  A single idea has no card and is never joined by a drop or a step (`join` slots only at a parked
  chat of several tasks); a parked chat comes from parking one, the edit dialog's "Continue the chat"
  switch (enabled for a parked task whose predecessor is parked) or Claude.
- **View:** a parked chat of several tasks is a card in the pool (same header: grip, title, count,
  provider, ⋯, "Parked" with the pause icon; faded), a single one a plain row. The chat card's ⋯ (and
  right-click) has **Park this chat** / **Unpark this chat**, with the single-task item's icons.
- **Claude:** `addon_tasks_edit` takes `parked` with `wholeChat: true` (the chat's queued tasks go
  together); `addon_tasks_add` takes `parked` with `sameChat` (one parked chat). The review card's
  Same chat switch works with Park as ideas. Nothing is migrated: old parked tasks are single.
- **Not there yet:** t156 (stop lines) and t157 hadn't landed when this was built, so unparking still
  leaves tasks out; that task changes it for groups too.

## D-397: Tasks: Reorganize, a small AI regroups and reorders what hasn't run

- Status: accepted.
- **Who:**

- Status: accepted.
- **Who:** Jon, 2026-11-06: "a button in the tasks queue to reorganize the queue (only whats not ran yet). should use ai, a small one, probably configurable in ai features, but id use a small one like luna or haiku … grouping together in the same chat when it makes sense, reordering when it makes sense". How: Claude, on my own.
- **Feature:** AI feature `taskQueueReorganize` ("Reorganize the task queue", Tasks → Reorganize; Haiku by default, ChatGPT's luna; JSON). The view asks it through `ctx.ai.answer`, so the user picks provider and model in Settings → AI features.
- **What it sees and may change:** only ticked queued tasks, in *blocks*: runs of neighbouring movable tasks. Running, finished, needs-you, left-out and parked tasks are fixed, and so is any task that holds a chat together with a fixed one (one that continues a fixed task, or that a fixed task continues), so a chat that ran or is left out never changes. It may reorder inside a block and change which tasks continue the chat before them; prompts, titles, providers and models never change. While a task runs only blocks after it count. Stop lines (t156) are meant to become one more fixed thing, so a block never crosses one.
- **Rules the answer must keep** (`lib/reorganize.ts`, checked strictly in the view and again by the host when applying; a bad answer changes nothing and says why): exactly the movable tasks once each; each block keeps its own tasks; a block's first task starts a chat; a task with its own provider or model always starts its chat (stricter than "same provider", which is how `checkProviderChoices` already works); a task never continues a chat of another project.
- **UX:** a Reorganize button in the queue header (icon only in a narrow place), off with a reason when no block has two movable tasks. It opens a modal: a fixed-size working state, then the proposed order as rows in fixed columns (new place, title, former place, tag) with Moved / Joins the chat / Own chat marks and one line of reason per changed task, and "AI-suggested order · check it before applying". Apply is one change; a toast offers **Undo reorganize**, which restores the previous order and chats (it fails with a message if the queue changed since).
- **Not done:** a tool for Claude chats (the call needs the UI's AI context; left out as not cheap).

## D-398: Tasks: stop lines instead of ticks, runs that pause where you say

- Status: accepted. Supersedes D-279's ticks (`leftOut`) and amends D-369 (unparking no longer leaves a task out), D-396 and D-397 (stop lines bound Reorganize's blocks).
- **Who:** Jon, 2026-11-06: "instead of having the checkbox to queue/unqueue, remove that, i want to have like stop lines, so i can place a divider like thing so that the run pauses there, so i can plan like different runs that will stop when they are done. thats useful for me to control when i want a release usually, maybe i want the first 10 tasks, and then to stop so i can release and install it, then go with the next block of tasks". The design below: Claude, on my own.
- **Ticks are gone:** no tick on rows, chat cards or the header; `Task.leftOut`, `setLeftOut`, the `select` host method, the edit tool's `leftOut` and the "Left out" count are removed. Stored queues are migrated on load (`normalizeQueue` drops `leftOut`): such tasks are plain queued tasks, nothing is lost. Unparking puts a task (or a whole chat) last before the pool, as a normal queued task.
- **State:** a stop line is `Task.stopAfter` on the task above it, so it stays put when tasks are moved around it. Only after a queued (not parked) or running task, and only at the end of a chat: a line that would split a chat snaps to its end (`normalizeQueue`, `setStop`). After the queue's last task it is allowed (new tasks land below it). A line after a finished task is used up, except while the queue runs (the run is about to take it, `passStops`).
- **Running:** Start runs from the top until the next line. When the task above a line has ended and tasks are still queued, the run closes (its own entry in History), the queue pauses, the line is removed and the finished notification says "Stopped at the stop line: N of M done"; the next Start runs the next block. With nothing queued after the line it is a normal finish. A Start after a pause or a failure passes a line the run already reached, so Start always runs at least one task. A line after the running task works too.
- **Moves:** a task that leaves its place hands its line back to the task before it (`withoutTasks`), so the line does not travel with it, and lines above nothing queued vanish. Drop slots in a gap with a line come in two: above it (the line then stays after the dropped tasks) and below it (`DropSlot.pastStop`); steps (Alt+↑/↓) pass over it in separate steps, Claude's `moveTo: { before }` lands below a line and `{ after }` above it.
- **Counts:** queued tasks after the next line are `later` ("After stop", where "left out" was): not in "will run" or the progress ("2/5 done" counts the finished tasks and the block). `counts().ready`, the dashboard card's `ready` and the Start button's "Start · N" (tooltip "Runs N tasks, then stops") count only the block. Parked tasks are unchanged.
- **View:** a calm full-width divider row "Stop here" (warning-coloured stop mark, a rule, "the run pauses here" when wide, a remove ✕ slot at the right edge) between chat cards; the whole row drags (grip on hover) to another gap. Added from ⋯ → **Stop after this task** (removal: **Remove the stop line after this task**, also on a running task) or from a **Stop here** pill that floats over the gap below a chat on hover (it overlays the existing 12 px gap, so nothing moves). Drags: a task over a line's top half drops above it, its bottom half below it.
- **Claude:** `addon_tasks_edit` takes `stopAfter` (true/false; also on the running task); `addon_tasks_list` shows `--- stop ---` where a line is; a running task's instructions mark queued tasks after a line as a later block.
- **Reorganize:** blocks end at a line, so nothing moves across one, and a line stays in its slot while the tasks of its block change places.

## D-399: Switching phone channels parks the old one and keeps its setup

- Status: accepted.
- **Who:**
 Jon reported that switching between Telegram and Teams in Settings → Phone left both
  unset. The fix: Claude, on my own.
- **Decision:** switching `phone.channel` only **parks** the old channel (`PhoneService.park`): polling
  stops and the in-memory state is dropped. Nothing is sent, no `unpair`, no `store.save(undefined)`, no
  Teams `setup.forget()`; the channel's credential and pairing stay in `phone.json`, so switching back
  reads them and is connected again with nothing to set up. Only the explicit **Disconnect** forgets a
  channel (goodbye message, unpair, entry deleted, Teams setup forgotten). Amends D-370 ("one channel
  at a time" stays: only the active channel polls and sends) and D-377 (each channel's saved state
  apart is now also kept across a switch).
- **Safety:** a save queued before the switch finishes first, under the old channel's kind; `persist()`
  captures its kind and channel and writes nothing once they changed; a place being made on the old
  channel is not recorded into the new one.

## D-400: Pinned tabs in the main area

- Status: accepted.
- **Who:** Jon (task queue), built by Claude.
- **Decision:** a main-area tab can be pinned (context menu, or the pin button on the tab). `LayoutTab.pinned`
  already existed in the saved layout, so it persists with it. Pinned tabs sit first in `main.tabs` in pin
  order; pinning moves a tab to the end of the pinned group, unpinning to the start of the unpinned group;
  `moveTab` stays inside the tab's group; new tabs open after the pinned group. `closeTab` and
  `closeTabsWhere` leave pinned tabs alone (x, middle-click, Ctrl+W, Close, Close others, Close all). Only
  `force` closes one, when its content is gone (deleted chat, removed project, an unsaved chat) or the view
  moved to a sidebar.
- **UI:** a pinned tab shows an accent pin button (unpins) instead of the x and is narrower (max-w-40); an
  unpinned tab has a pin slot beside the x, both fixed 20 px slots, so hovering never moves the title.

## D-401: ChatGPT (Codex) completes code too, on a warm app-server completer

- Status: accepted. Amends D-255.
- **Who:** Jon asked for ChatGPT as a third completion provider next to Copilot and Claude, and for the
  warm Codex completer to serve other features too (caption translation, D-384). The shape is
  **Claude, on my own**.
- **One provider setting:** `editor.completionProvider` (`copilot` | `claude` | `chatgpt`, default
  `copilot`) replaces the boolean `editor.claudeCompletion`; a config with `claudeCompletion: true`
  becomes `claude` when it loads (`migrateEditorConfig`; an explicit provider wins). Copilot without
  its GitHub sign-in is still "off". The status-bar menu and Settings → Editor both choose it;
  ChatGPT is disabled with "sign in first" until Codex is ready (`useChatGptStatus`, as in AI
  features). `editor.chatgptCompletionModel` (default family `luna`, the fastest; a family follows its
  newest version through `resolveCodexModel`, or pin a version) sits beside
  `editor.claudeCompletionModel`. The provider and both models are protected (D-077): they spend plan
  usage.
- **A warm `codex app-server`, never a process per suggestion:** `codexCompleter(options)` /
  `getEngine("codex").completer(options)` (`Completer`, the same shape as Claude's) keeps one
  app-server with no tools (shell and the other features off, no approvals, no web search, no
  AGENTS.md), a read-only sandbox and the caller's developer instructions. **Each ask is its own
  ephemeral thread** (no growing conversation, so nothing piles up across a meeting or a coding
  session); the next thread is opened as soon as an ask ends, which takes its ~0.2 s start off the
  next ask. Asks run one at a time; an abort or the 60 s timeout rejects that ask and interrupts its
  turn without killing the process; the process restarts when it dies; the completion code recycles
  it when the resolved model changes. `OPENAI_API_KEY`/`CODEX_API_KEY` are stripped
  (`codexSessionEnv`). The prompt and cleanup (`completionPrompt`, `cleanCompletion`) are the same
  for every provider.
- **Speed, measured honestly (2026-11-06; same file, five caret spots, ten warm asks each):** Claude
  (haiku) 0.9-8.4 s, median 3.2 s (D-255 measured ~0.9 s on a quiet day); ChatGPT (luna, `low`
  reasoning effort, the lowest those models offer) 2.3-8.2 s, median 3.8 s. Luna's time is nearly all
  the model (~3-4 s after the turn starts; the thread start is 0.2 s and hidden by the spare thread);
  `service_tier`, verbosity and an empty MCP list changed nothing measurable. So ChatGPT works but is
  not as quick as Claude's best case and far from Copilot; the editor waits for the same 0.7 s pause
  as for Claude. Pick Copilot for speed, ChatGPT when its plan is the one you want to spend.
- Caption translation switched to this completer in D-402.

## D-402: Caption translation with ChatGPT runs on the warm Codex completer

- Status: accepted. Amends D-384 (the "ChatGPT stays one `codex exec` per request" part).
- **Who:** Jon queued it (t147) as soon as D-401's completer existed; the details are Claude, on my own.
- **What changed.** With ChatGPT picked for Caption translation, `CaptionTranslator` asks one warm
  Codex process (`getEngine("codex").completer`, luna family resolved with `resolveCodexModel`,
  `low` effort, 30 s per ask) instead of starting a `codex exec` per batch. Batching (6 per request),
  the 20 s skip and **Not translated** are unchanged. Claude's path is unchanged.
- **Fallback.** If the warm ask fails (process died, timeout, Codex missing), that batch is retried as
  the old `codex exec`, the warm process is dropped, and `codex exec` serves the next 60 s
  (`WARM_RETRY_MS`) before a new warm process is tried, so a broken Codex never costs a failed ask
  plus an exec on every batch. Only when the exec fails too does the batch show Not translated.
- **Stopping.** `stop()` (language cleared, meeting ended) closes the warm process; a request still
  waiting is dropped by the generation check as before.
- **Measured (2026-11-06, real Codex 0.166, `gpt-6-luna`, the same 6-caption batch into sv-se, four
  runs each):** `codex exec` 6.4 / 5.6 / 5.9 / 6.3 s (mean 6.0 s); warm completer 5.4 / 5.8 / 5.5 / 4.9 s
  (mean 5.4 s). The warm process saves about 0.6 s (~10%) per batch: the cold start is small next to
  the model's own ~5 s for a batch. So ChatGPT still skips more lines than Claude on a fast talker, and
  the "slower with ChatGPT" note on the Caption translation row stays.

## D-403: Meetings window: Calendar, Chats and Meetings tabs; the top-bar button opens it

- Status: accepted.
- **Who:**
- **Who:** Jon asked; the layout details are Claude's.
- **What:** the Meetings window's rail has three tabs, Calendar (CalendarDays), Chats (MessagesSquare) and
  Meetings (History, the icon the history already used): Calendar is the upcoming meetings and the week,
  Chats is unchanged, Meetings is the whole meeting history view (list with folders and search, header
  with Start a chat and ⋯, notes, transcript), moved out of the main window, which no longer has the
  `jig.meetings` tab. The top-bar video button has no menu: a click opens or focuses the window.
- **Opening:** `meetings.open` takes `{ tab?, select? }` and the open window follows `meetings.show`.
  Everything that opened the history (Tools → Meeting history, `ctx.meetings.history()`, a meeting chip in a
  chat, a call that ended) opens the Meetings tab with that meeting selected. The last tab is kept in the
  window's localStorage; the first time it is Calendar.
- **Because the history now runs in that window:** its host methods accept the Meetings window (`fromJig`);
  Start a chat goes through `meetings.startChat` and the main window creates the chat (`meetings.chatNew`);
  the list width is the lobby size `history.list` (replaces `review.notes`); Call back and Open in Teams
  moved into a meeting's ⋯ menu; the old in-window review header and Ask Claude are gone (Start a chat
  replaces Ask there; the call window keeps Ask).
- **Narrow windows:** the list is at most 40% of the window; below ~770 px notes stack over the transcript.

## D-404: Jig never pretends to be another client; Artifact tool only when Claude Code offers it

- Status: accepted.
- **Who:** Jon decided it (2026-11-04, after finding the cause); the shape is **Claude, on my own**.
  Amends D-092.
- **Finding:** Claude Code offers `Artifact`, `ArtifactComments` and `ArtifactData` only when
  `CLAUDE_CODE_ENTRYPOINT=claude-desktop`, i.e. inside Anthropic's Claude desktop app. Jig runs as
  `sdk-ts`, so no Jig chat (and no hidden `callClaudeTool` call) ever has them. Tested with the bundled
  Claude Code 2.1.296 and the desktop app's 2.1.317: `ENABLE_CLAUDEAI_MCP_SERVERS` and the version make no
  difference, and the account does have artifact access. Every artifact in the history came from the
  desktop app.
- **Rule: Jig never pretends to be something it isn't.** It never sets `CLAUDE_CODE_ENTRYPOINT` (or any
  other identity, header or user agent) to another client's value to unlock a feature. In AGENTS.md as a
  "never do X" rule.
- **Jig only promises what Claude Code says it has.** `main/engine/offeredTools.ts` keeps the `tools`
  list of the latest Claude Code init message (`EngineEvent` init `tools`); `jigContext` mentions the
  Artifact tool only when that list has it (it never does in Jig; before any chat started, nothing is
  promised). The system prompt is built before a chat's own init, so it reads the last one seen.
- **Removed:** the Artifacts tab (and its Home tile, action and Go to entry), `artifacts.fromChats` /
  `artifacts.list` / `artifacts.fetch`, the claude.ai listing and its guarded calls, the fake cloud's
  artifacts, and the Releases "Publish the notes as an artifact" button (hidden until Jig's own pages
  exist). **Kept:** the Artifact card in chat (Open in Jig for the local page, Open on claude.ai) because
  a chat resumed from the desktop app can hold old calls.
- **Next:** Jig's own pages, D-405, are the replacement for artifacts.

## D-405: Pages: Jig's own artifacts, a built-in add-on Claude publishes HTML into

- Status: accepted. Follows D-404.
- **Who:** Jon decided it (2026-11-06): "we could have our own add-on that Jig can use to build its own
  artifacts, they are just HTML files right?", instead of pretending to be the Claude desktop app
  (D-404). The shape is **Claude, on my own**.
- **What:** the built-in add-on `addons/pages` (global storage). Claude (or ChatGPT, the tools are
  engine-neutral, D-313) publishes a self-contained HTML page with `addon_pages_publish` (an HTML `file`
  in the chat's folder, its project or the temp folder, or the `html` itself; extra `files`; an `id` to
  update). Jig copies the page and the files it loads (`src`, `href`, `url()`, found in the HTML) into
  `~/.jig/addon-data/pages/<id>/v<n>/`, so it outlives the scratch files; an update is a new version of
  the same page (the files it doesn't bring again carry over; the last 5 versions are kept; limits: 300
  files, 25 MB). `addon_pages_list` and `addon_pages_read` are read-only. `jigContext` makes it the default
  way to show visual output while the tool exists, and `publish` is `alwaysLoad` so it is never deferred.
- **In the app:** a card for the publish call (`toolRenderers` with the new `promote` flag, so the compact
  view shows it instead of folding it into "Used a tool": a picture of the page, title, Open in Jig, Open in
  browser, ⋯ with Show in folder and Save as…), and the Pages view (Tools → Pages, a Home tile; hidden by default,
  sidebar or main tab by container size) with Open the chat, Rename and Delete (asks first) as well.
- **Security:** a page is untrusted HTML. It opens in the Preview tab as every HTML file does: sandboxed
  frame, never same-origin, scripts off until turned on there, CSP with no network, no Node or IPC. Source
  paths must lie inside the chat's folder, its project or the temp folder (real paths, so a symlink can't
  leave); extra files only inside the page's own folder (`..` and absolute paths refused). Nothing is
  uploaded: no sharing service, no claude.ai. **Open in browser** hands the file to the user's browser,
  which has no such sandbox: that is the user's own action. The scripts switch stays Preview's per-tab
  one (off each time a page is opened), not remembered per page.
- **Add-on API:** `ctx.saveCopy(from, { name?, title? })` (`addons.saveCopy`) was missing for Save as…: a
  Save dialog for a file, a folder picker for a folder; it only copies out of the add-on's own data
  folder and never over something that exists.
- **Not done:** sharing pages (no link, no upload); comments or data APIs like claude.ai's; showing old
  versions in the UI (they are kept and `where` can return one).

## D-406: Meeting history: transcript hidden by default, beside the notes in a resizable split

- Status: accepted. Changes the history's fixed two-column notes/transcript grid (D-250, D-376).
- **Who:** Jon asked for it (2026-11-06): the transcript hidden by default with the notes at full width,
  a Transcript button with the caption count to show it, and a draggable, remembered split. Where it is
  stored and the widths are **Claude, on my own**.
- **What:** the history's header has a **Transcript** toggle (captions icon, count, `aria-pressed`) left
  of Start a chat; it only changes colour, so nothing in the header moves. Shown, the transcript sits on
  the right of the notes in a `SizedBox` (the Meetings windows' `Pane`: same `ResizeHandle`, drag,
  arrow keys, double-click resets) of 420 px by default, at least 280 px, and never so wide that the
  notes get under 320 px. When the detail area is narrower than both minimums together (600 px, measured
  on the area itself, not the window), the transcript takes the notes' place instead of squeezing them;
  the button brings the notes back.
- **Stored:** in the meetings layout (`addon-data/meetings.json` → `layout`), where the history list's
  width already lives, not in the workbench's `layout.json`: the Meetings window has no workbench store,
  so the workbench `Pane` can't run there. `historyTranscript: true` (missing = hidden) and the size key
  `history.transcript` belong to the lobby, like `history.list` (`LOBBY_SIZES`); the call window keeps
  the saved values when it saves its own layout. The lobby queues its layout changes and applies them all
  to the saved layout, so a drag and a toggle within the save delay both stick.

## D-407: Meeting actions: a status per action; run in a new chat, mark done, dismiss

- Status: accepted. Replaces the action's `queued` flag (D-217).
- **Who:** Jon asked for it (2026-11-06): per action, Run in a new chat (in the action's project, Plan
  mode, without waiting for the queue, the chat reachable from the action), Mark as done and Dismiss,
  with done and dismissed ones out of the to-do list but restorable, the actions in a fixed right-aligned
  slot and a status badge. The tabs, icons, which transitions are allowed and the messages are
  **Claude, on my own**.
- **What:** `MeetingAction.status` is `queued | running | done | dismissed` (missing = still to do) with
  `sessionId` for the chat Run in a new chat started. Old records' `queued: true` load as `queued`
  (`store.ts` transform). Only actions still to do can be edited, ticked, queued or run; the dialog's
  edits never set a status (`mergeEdits`). Run uses the queue's project check and prompt
  (`actionPrompt`: source meeting, evidence, owner) and opens nothing by itself; the card's primary
  button becomes Open the chat. Done and Dismiss are for actions still to do or running; a queued action
  belongs to the Tasks queue and is changed there. Restore (`open`) brings a handled action back to
  running when it has a chat, else to do. New drafts from Generate notes replace only the actions still
  to do.
- **UI:** the Review dialog has two tabs, To do (open, queued, running) and Handled (done, dismissed: a
  compact row with Restore), over a list of fixed height, so switching tabs or handling an action never
  resizes the dialog. Each card's header has a fixed 60 px slot left of the badge column: the primary
  icon button (Run in a new chat / Open the chat; empty for queued) and ⋯ (Run or Open, Mark as done,
  Dismiss); the badge stays at the far right (Queued, Running, Done, Dismissed, or Your action /
  Someone else while to do). What a card's action did, or why it failed, shows in the footer's
  existing text slot. The Markdown export ticks done actions and names the other statuses.

## D-408: Tasks queue: Runs on picks a model too

**Jon:** the queue-level Runs on should pick a model as well as a provider, and a task or chat that
starts a chat can override both. The details are **Claude, on my own**.

- **Stored:** `Queue.model` beside `Queue.provider` (D-330): a model of that provider only, never
  without one. `setQueueRunsOn` (pure, tested) applies a change: a model alone names its provider,
  a provider change drops a model that isn't that provider's (`providerOfModel`), Default (the
  project's) drops both. The host's `setProvider` takes `model` too (the view always sends both).
- **Header:** Runs on opens each provider's models like Add tasks and Edit do ("Default model", then
  the families); the button says "Claude · Opus" (`runsOnShort`), its slot widened from `w-32` to
  `w-40` at `@md` (the mark alone below).
- **Resolution** (`runsOn` → `newChatRunsOn`): a new chat takes its own provider and model, else the
  queue's, else the project's default. The queue's model applies only to its own provider: a task on
  the same provider without a model of its own takes it (the task's provider menu names it, "Queue's
  model · Opus", instead of "Default model"); a task on the other provider gets that provider's default
  model, so a ChatGPT model never reaches a Claude chat or the reverse. A task that continues a chat
  shows that chat's provider and model (read-only, as before). `ranOn`/`ranModel` still record what
  the chat really ran on, and when the D-338 limit handover starts the chat on the other provider the
  model is not passed (`ranModel` stays empty), so the handover never carries a model of the wrong
  provider.
- **Dialogs:** Add tasks and Edit name the inherited value "Queue default (ChatGPT · Terra)" (the
  queue's provider and model, else the project's default), buttons widened to `w-60`.
- **Rows:** the provider column shows the effective model's short name beside the mark from `@2xl`
  (`w-16`, empty slot when the provider's default), only the mark below, so nothing after it moves.
- **Claude's tools:** `addon_tasks_edit` takes `runsOnModel` beside `runsOn` (a model alone also sets
  its provider; a model of the other provider than `runsOn` is refused); listings' header says
  "New chats run on Claude (opus).", also for an empty queue. The All queues overview reports the
  queue's model.
- **Reorganize** (D-397) is unchanged: only a task's own provider or model makes it start its own
  chat; a queue model never fixes a task.

## D-409: Provider marks: a handed-over task shows both, and Claude's asterisk fills the box

**Jon:** a task whose chat was handed over to the other provider (D-338) shows both marks in its row,
in handover order, like History's "Mixed" already does for a run; and Claude's mark must look as big
as ChatGPT's everywhere, fixed in the mark itself, not per place. The details are **Claude, on my own**.

- **Handover pair:** `runsOn` returns `startedOn` beside `provider` when the task's own chat started
  on the other provider (`Task.startedOn`, already recorded by D-338); `handoverOrder` (pure, tested)
  lists them, started-on first. The queue's and History's task rows, the chat rows above them and the
  task's details draw them through one `ProviderMarks` (also used by the "Ran on"/"Mixed" cell): a
  fixed `w-8` slot for one or two marks, so rows with one or two line up. The provider column grew
  from `w-4`/`w-16` to `w-8`/`w-20` to fit it. A later task that continues that chat shows only the
  provider that finished it (it ran there alone). The row's tooltip says "Started on ChatGPT,
  continued on Claude · Opus after its limit".
- **Claude's mark:** Lucide's `Asterisk` reaches only radius 7 of its 24-unit box while `Aperture`'s
  circle has radius 10, so Claude's looked smaller. `ProviderMark.tsx` now draws its own
  `ClaudeAsterisk` with `createLucideIcon`: the same three arms at radius 10 with Lucide's stroke, so
  every place that shows `PROVIDER_MARKS` (footer, pickers, chat list, divider, tasks) changed at
  once. Still a Lucide icon in style and API; no new icon set.

## D-410: Claude's browser shows itself only when a chat opens a new page

**Jon:** the browser view switched to Claude's browser on every browser tool call, which pulled the
panel away while you were looking at something else. It now shows itself only when a call opens a
new page for the chat (`BrowserPages.begin` reveals only when the chat had no page yet: its first
browser call, or the first one after its page was closed as idle or by you). Calls on a page that is
already open still show it as driving, but never switch the panel or add a badge. The D-349 rule
still decides how a new page shows itself (show, or a badge while you work on another tab of its
panel), and `browser.showWhenUsed` off still keeps the view closed.

## D-411: Natural voice starts sooner: short first chunk, streamed pieces, warm-ups

- Status: accepted.
- **Who:** Jon: the natural voice took a couple of seconds to start talking. How it is done is
  **Claude, on my own**.
- **Measured first** (Jon's 20-core Xeon, warm disk): Kokoro makes audio in about 0.22× its spoken
  length (not half, as D-243 measured), plus ~0.4 s per call whatever its length. Claude's own time
  from the request to its first text was ~0.6 s for a one-line question (more with thinking or
  tools; Jig can't change it). Before, a reply's first sentences arrived as one span, were made in
  full (a 150-character sentence: 2.2 s) and only then played. A cold voice process (forked to first
  audio) took 2.8–3.6 s, of which ~2.2–2.9 s loading.
- **Short first chunk** (`earlyBreak` in `features/speech/speak.ts`): when nothing is being said, the
  first chunk ends at the first comma, semicolon, colon or dash with at least 4 words before it (and
  2 after), or after 8 words while the sentence is still being written; only between two whole words,
  never inside a number, inline code, a link, bold text or a code block. Everything after is queued a
  sentence per chunk (`speechChunks`), so each next one is made while the one before plays. Read
  aloud (the message button) starts the same way. The talking window still shows one line per message.
- **Pieces streamed from the host:** the voice process sends each piece's audio as soon as it is made
  (`FromVoiceHost.part`, then a last message with the count); the host passes them to the window that
  asked as `speech.part` events (new `speech.sayParts`; `speech.say` still returns the whole audio for
  the phone). The first piece ends at a comma within ~100 characters (`pieces(text, 300, 100)`), later
  ones up to 300, so even a long first sentence is heard after ~1 s. The renderer schedules the pieces
  on the AudioContext clock back to back (`playSpeech`), with the waves following each piece when it
  plays and the echo tail after the last one. Measured: first sound ~0.47–0.6 s after asking for a
  short first chunk (was 2.2 s for the sentence it came from).
- **Warm-ups** (`warmNaturalVoice`, at most once a minute): Talk start and each message you send in
  Talk; "Hey Jig" heard in the first moments of a command, and any command; a chat starting to work
  while announcements are on (its "done" comes later). **Not kept alive while `speech.wake` is on:**
  the process holds ~890 MB, too much to keep for a voice that may speak a few times a day; the wake
  check is heard ~2 s before the command ends, which hides most of the ~2–3 s load.
- **Threads:** `intraOpNumThreads` = half the logical cores, 2 to 8. Measured: 8 threads as fast as
  the default (all 20 cores), 2 twice as slow; the cap leaves cores to Whisper and Jig.
- **Timings:** in development the console prints `[voice timing]` per reply (your message → Claude's
  first text → voice asked → first audio → playing); the voice process logs its load time and each
  piece (characters, time to make, audio length; never the text) in the main log at debug level.

## D-412: Workflows: provider and model per AI step

**Jon:** "i wanna be able to select what provider and model does an ai step in workflows, default to
global default". The details are **Claude, on my own**.

- **Stored on the step, only when chosen:** `Step.provider` / `Step.model` (kind `claude` only). Left
  out = the new chat's normal defaults (`shared/chatDefaults.ts`: the project's, then
  `engine.provider` with `engine.defaultModel`/`engine.codexModel`); the current default is never
  written into the step, so a later change of the default still applies. A model alone names its
  provider and a provider change drops the other's model (`providerFields`, as `setQueueRunsOn`).
  `addon_workflows_save` takes `provider`/`model` per step ("default" or left out = none; a model of
  the other provider than the one given is refused); `get`/`describeWorkflow` show "on ChatGPT · Sol".
- **One picker:** the Tasks "Runs on" button (D-330, D-408) moved to `addons/shared/RunsOn.tsx`, with
  the pure provider/model helpers in `addons/shared/providers.ts` (re-exported by the Tasks lib); its
  menu test ids take a prefix (`workflow-runs-on-*`). In the step editor it sits beside "Who does it"
  in a fixed `w-44` slot and says "Default" when unset; the read view shows a small mark + model chip
  before the "who does it" badge (nothing for the default, so the badges stay one right-aligned line).
- **Running it:** with no choice the view keeps `sendToChat` (a new chat with the defaults, as before).
  With one, the host's `startStepChat` calls `api.chats.create({ projectId, provider, model })` then
  `chats.send`, and the view opens that chat. No SDK change was needed.
- **A workflow run by an agent (`addon_workflows_run`):** an AI step on the default stays the agent's
  to do in its own chat (as before). One with its own provider/model doesn't belong in that chat: when
  it's automatic, Jig starts the chat on that provider/model itself and goes on with the next steps;
  when it asks first or is the user's, the run stops and the agent tells the user it runs in a chat of
  its own, started from the workflow's tab.
- **Wording:** the kind is "A message to the AI" and the box "Message to the AI" (provider-neutral,
  as D-409 and the "say Jig, not Claude" direction).

## D-413: Say Jig, not Claude, where the provider doesn't matter

**Jon** (2026-11-04): now that chats run on Claude or ChatGPT, Jig's UI shouldn't name a provider where
the provider doesn't matter; call the assistant "Jig". The same goes for what chats say when they
explain Jig ("the end of Claude's last reply", "Claude can message you" → Jig), and Settings → Chats
should show what applies to both providers in one place. The wording per string, the group names and
the Settings layout are **Claude, on my own**.

- **The rule:** name a provider only where the choice of provider is the point: the provider picker
  and handover (dialog, divider), sign-in and CLI install/status, plan limits and usage per provider,
  per-provider settings (models, effort, keys, paths), costs, and `ENGINE_CAPABILITIES` messages that
  explain why something is missing for one provider. "Claude Code" stays where it means the program
  or its own things (its slash commands, MCP servers, CLAUDE.md, routines, the builder and attempts,
  which are Claude Code sessions). Everywhere else: "Jig" ("Jig's browser", "Ask Jig about this
  file", "Jig notes it here", "Let Jig judge"), or no subject at all.
- **Covers** every user-visible string in the renderer, main (notifications, dialogs, phone
  messages), the bundled add-ons (manifests, UI, tool descriptions), and the model-facing text: the
  `jig_*` and add-on tool descriptions, `jigContext`, `SETTINGS_GUIDE`, the tester/search helper text,
  and the docs (status, reference, guides, README, About page). Chats read these and echo them.
- **Chats name themselves "Jig":** `NAMING_GUIDANCE` in `main/engine/jigTools.ts`, part of `jigContext`
  (the system-prompt append both engines get): describing Jig or a chat to the user, say "Jig"; name
  Claude or ChatGPT only when the provider itself is the subject.
- **Only text changes:** identifiers, file names, IPC methods, command ids (`jig.openClaudeBrowser`),
  setting keys and stored values stay. The command group "Claude" became "Assistant" (still in the
  Chats menu; "Jig" is a group of its own with its own menu), and the Pages action joined it.
- **Settings → Chats:** the provider picker on top, then **All chats** (When a chat hits its limit,
  Default permission mode, Don't ask: wait for you, Suggest the next message, Stop idle chats, Name new
  chats, notifications, Jig's browser), checked against `main/sessions` (the suggestion, chat names,
  permission mode and the Don't ask wait apply to both engines), then **Claude chats** and **ChatGPT
  chats**, whose matching rows share names, order and descriptions: Default model, Reasoning effort,
  Helper fallback model (was "Subagent fallback model"; key `engine.subagentModel` unchanged), Tester
  model, Search model, then the provider's own rows, its program path and Allow API keys. File
  checkpoints and claude.ai connectors stay Claude-only (Codex has no rewind). The "How subagent
  models are chosen" disclosure became the fallback row's description (no inline expander).
- **Kept on purpose:** the voice command words "ask Claude" / "what did Claude say" (spoken phrases
  the matcher knows; the grammar list shows what works), the fake engine's microphone sample text.

## D-414: ChatGPT turns: an estimated cost at OpenAI API prices

**Jon** (2026-11-04): ChatGPT chats and queue tasks showed $0.00 or nothing while Claude's show the
API-price cost Claude Code reports, so a ChatGPT queue looked free next to a Claude one. Show an
API-price estimate for ChatGPT too. Replaces "Usage, no cost" in D-311. The details are **Claude, on my
own**.

- **One price table:** `shared/openaiPrices.ts` (`OPENAI_PRICES`): USD per 1M input, cached input and
  output tokens, short and long context, per exact model slug Codex lists (gpt-6.1-sol, gpt-6-astra,
  gpt-6.1-terra, gpt-6-sol, gpt-6-luna, gpt-5.6-sol/terra/luna), from OpenAI's pricing page (Standard
  tier; URL and date in the file). A model OpenAI publishes no price for is left out, never guessed.
  Update the list when OpenAI changes prices or Codex lists a new model.
- **The math:** Codex reports running totals per token update (`thread/tokenUsage/updated`). Each
  update's difference is priced at the model the turn runs on: cache reads at the cached price, the
  rest of the input (cache writes included) at the input price, output at the output price. Codex's
  output count already holds the reasoning tokens (recorded totals: input + output = total with
  `reasoningOutputTokens` > 0), so they aren't added again. A request over 272K input tokens (its
  `last.inputTokens`) uses the long-context rate. Regional/FedRAMP uplifts and Batch/Flex/Fast tiers
  are ignored: it's an estimate.
- **Per turn, not a running total:** the result carries `turnCostUsd` (a number, or `null` when part of
  the turn ran on a model without a price). The chat's reducer adds it to `SessionMeta.costUsd`, so a
  chat handed over from Claude keeps Claude's cost and adds ChatGPT's, and every view that reads
  `costUsd` (overview, transcript line, board, Tasks queue, History, dashboard) shows it without
  per-view code. `SessionMeta.costEstimated` / `costUnpriced` and the result item's flags tell views
  to explain it. A model picked mid-chat (`setModel`) is priced from the next turn on.
- **Shown as an estimate:** where a ChatGPT cost shows, its tooltip says "Estimated at OpenAI API
  prices; your ChatGPT plan isn't billed per token." A turn or task on a model without a price shows
  "—" (not $0.00) with a tooltip saying why (`taskCost` in the Tasks add-on: a ChatGPT task whose chat
  cost didn't grow has no cost). No new text in rows, so nothing moves.
- **One-shot AI features** (`main/providers`) record no cost on either provider; nothing to price.

## D-415: Add-ons import only from addons/ and @jig/sdk

- Status: accepted.
- **Who:** Jon (2026-11-06) asked for the fix after the Task queue disappeared in 0.17.0; how it's
  guarded is Claude, on my own.
- **Why:** built-in add-ons ship as their source folders (`resources/addons`) and are bundled on the
  user's computer, where `apps/` and `packages/` don't exist. D-414 imported two tooltip strings
  into the Tasks add-on from `apps/desktop/src/shared/openaiPrices.ts`: fine in a dev checkout, but
  in the installed 0.17.0 the UI bundle failed ("Could not resolve"), so every Tasks view and tab
  vanished, with the error shown only in Settings → Add-ons.
- **What:** add-on code imports only from its own folder, `addons/shared`, and packages by name
  (`@jig/sdk`, `react`…). `import type` from anywhere is fine (erased before bundling). Something
  the app and add-ons both need is copied into `addons/shared` with a test that keeps the copies
  the same (`addons/shared/costNotes.ts` + `costNotes.test.ts`). `npm run check:addon-imports`
  (`scripts/check-addon-imports.ts`, rules in `scripts/addon-imports-lib.ts`) enforces it and runs
  in `verify` and `check`, so a release can't ship it again.

## D-416: Chat tabs show status in the icon's place, no dots

- Status: accepted.
- **Who:**
  Jon (2026-11-06): no blue dot for "working" and no orange one for "done"; something subtle and
  animated while working, something else when it needs you, nothing when idle. The marks are
  Claude, on my own.
- **What:** a tab's status replaces its icon in the same 14 px slot (`TabIcon` in
  `workbench/MainArea.tsx`), so the title never moves: three dots bouncing in turn while it works
  (in the icon's colour, a chat's project colour), a bell that rings briefly every few seconds
  (warning colour) when it needs you, an alert icon (danger) after an error. Idle and finished show
  the plain icon. Reduced motion keeps the marks still.
- **Update, same day (Jon):** "finished, not seen" is back, and the same marks go in the Chats
  sidebar. One mark for a chat everywhere: `ChatIcon` (`features/sessions/status.tsx`) in its tab
  (the tab type's `IconView`), the Chats list, the chat's header, the Chats board, Home and Attempts.
  It is the speech bubble in the project's colour; working, needs you and error replace it with
  `StatusMark` (`ui/StatusMark.tsx`); a finished turn you haven't seen (`useSeenTurns`) turns it into
  the bubble with a dot in its corner, the dot drawn in the text colour (`.jig-unread`), like an
  unread badge. The round status dots (`StatusDot`) are gone; projects stay squares.

## D-417: Jig says when a switched-on add-on fails to load

- Status: accepted.
- **Who:** Jon (2026-11-06) asked for it after the Task queue vanished in 0.17.0 (D-415) with its
  error shown only in Settings → Add-ons; the form is Claude, on my own.
- **What:** 2 s after the last add-on sync (an import of a `ui.js` whose hash a reload just replaced
  fails once and loads on the next sync), every switched-on add-on with host errors (manifest, bundling)
  or a renderer load error gets a danger toast: "<name> couldn't load", the first error line, and
  Show in Settings (Settings → Add-ons, where the full error is). Told once per add-on and error
  text while Jig runs (`addonLoadFailures` in `shared/addons.ts` gives the key), so reloads and
  syncs don't repeat it; a new error tells again. An add-on the builder is previewing is left out:
  the build shows its own errors. A toast, not a banner in the views: the add-on's views are gone,
  so there is nowhere in them to say it, and a toast moves nothing on screen.
- **Also (same day):** `scripts/check-tokens.ts` checked nothing on Windows (`URL.pathname` gave
  `/E:/…`, and a try/catch turned the unreadable folder into "OK"). It now resolves the path with
  `fileURLToPath` and fails on a folder it can't read. The checker no longer reads `#101` in a
  comment as a hex colour, nor a bracket variant (`data-[tone=danger]:`) as an arbitrary value.
