# Jig — the plan

The plan is split into phases. Each phase has its own file with a goal, a "done when" and a checklist.
**Tick items as they land, in the same commit as the code.** Add items when you discover work;
never silently drop one — move it to the backlog (`99-backlog.md`) with a reason.

Status legend: ✅ done · 🟡 in progress · ⬜ not started · ⏸ blocked (reason in the phase file).
In phase files, `[x]` = done, `[~]` = written but not yet tested/wired, `[ ]` = not started.

**Next session: start with `docs/status.md` → "Continue here".**

| # | Phase | Status | Done when |
|---|---|---|---|
| 0 | [Foundations](00-foundations.md) | ✅ | repo, docs, tooling and checks exist; native automatic Biome cleanup (D-220) |
| 1 | [App skeleton](01-app-skeleton.md) | ✅ | an Electron window renders the React UI and talks to the host through the typed bridge; e2e harness runs |
| 2 | [Design system & themes](02-design-system-themes.md) | ✅ | tokens everywhere, built-in themes, VS Code themes importable, token check enforced |
| 3 | [Workbench shell](03-workbench-shell.md) | ✅ | layout-as-data regions, tabs, Tools menu, projects, settings |
| 4 | [Chat sessions](04-chat-sessions.md) | ✅ | several Claude Code sessions across projects, streaming, permissions, history |
| 5 | [Terminals & scripts](05-terminals-scripts.md) | ✅ | terminals per project; scripts startable with a click |
| 6 | [Add-on system](06-addon-system.md) | ✅ | slots, manifest, UI + host runtime, hot reload, management UI |
| 7 | [Built-in add-ons](07-builtin-addons.md) | ✅ | Git tab, Repos overview, Pipelines (Azure DevOps), Scripts |
| 8 | [Builder — levels 1 & 2](08-builder.md) | ✅ | "Build something…" changes layout/settings or creates/changes an add-on, with preview + accept |
| 9 | [Learning & suggestions](09-learning.md) | ✅ | activity log, pattern mining, "Look for patterns now", Monday 10:00 run, inbox |
| 10 | [Extension proposals (no self-editing)](10-extension-proposals.md) | ✅ | when no slot fits, the builder proposes the missing extension point; Jig never edits its own code |
| 11 | [Packaging & Windows](11-packaging.md) | ✅ | Windows installer, first-run checks, updates |
| 12 | [Workspaces](12-workspaces.md) | ✅ | a folder of repositories works as one project: Git, scripts, repos and chats across all of them |
| 13 | [What Jig can do](13-about-page.md) | ✅ | an in-app page (also the welcome screen and in the Jig menu): features with screenshots, live extension slots, add-ons, skills, configure examples, shortcuts |
| 14 | [AI features and previews](14-ai-features.md) | ✅ | suggestions, checkpoints, forks, parallel attempts, tours, checks, standups, previews for every file Claude writes, Claude's terminals and browser |
| 15 | [The chat, at least as good as Claude Code](15-chat-parity.md) | ✅ | `/` commands and skills, `@` files, `!` shell, `#` memory, history, modes, rewind, todos, plans, diffs, subagents, background tasks, MCP, effort, find |
| 16 | [Routines and artifacts](16-routines-artifacts.md) | ✅ | Claude Code routines in a tab (list, run, on/off, runs) and from chats; artifacts dropped (D-404: Jig chats never get the tool) |
| 17 | [UI/UX sweep](17-ux-sweep.md) | ✅ | Home with a chat box, New chat in the top bar, Ctrl+K, tab status dots, message actions on hover, changed files after a turn |
| 18 | [Next: Jon's list](18-next.md) | ✅ | done (the rest is in the backlog): file explorer, light editing in Preview, projects you manage, arranging Scripts/Pipelines, split view, project links, Releases (start versioning), Learning 2 (evidence, profile, coaching, check-ins, workflows); after it: worktree chats, sharing add-ons, review comments, add-on tools and data scope, a repo sweep, named layouts, Go to, workflow event triggers, chats board, add-on gallery, the task queue |
| 19 | [Model defaults and desktop polish](19-models-and-desktop-polish.md) | 🟡 | configurable native model defaults, pipeline project visibility, grouped menus, money formatting and Windows icon; installer verification remains |
| 20 | [Skills library](20-skills-library.md) | ✅ | nine curated native plugins, one library with global/project controls and AI feature defaults |
| 21 | [Speech](21-speech.md) | 🟡 | dictation with local Whisper (mic button, Ctrl+Shift+Space) with live text and WebGPU, Read aloud with a natural voice (Kokoro, on this computer), talking with Claude (voice turns, spoken replies, approve the plan by voice) in a talking window with sound waves, Claude reading the code while you plan, go-ahead hand-off with a working sound, Settings → Speech; real download, GPU and microphones need checking on a real machine |
| 22 | [Teams meetings](22-meetings.md) | 🟡 | global meeting room, calendar, screen sharing, live captions, transcript-aware Claude questions and reviewed multi-project tasks; pre-join errors/retry visible; real account/device acceptance remains |
| 23 | [Jon's notes (November 2026)](23-jons-notes.md) | ✅ | all seven sessions done (D-246–D-257): task queue per project with review and history, add-on restore/share, meeting history, Teams calls, DevOps boards and update progress, code completion (Copilot or Claude), project knowledge with claude.ai import; plus composer mentions. Real-machine checks listed in status.md |
| 24 | [Tenants](24-tenants.md) | ✅ | all six sessions done (host: tenants in their own Azure CLI folders, `azure.*` IPC, every `az` Jig runs follows the active one, D-282; the top bar avatar switch, add/manage modals, Settings → Azure, Claude's tenant tools, D-283; one `az` for Jig and add-ons, and Pipelines, Boards, Releases, Workflows and Azure links follow the tenant, D-284; chats, terminals and scripts start with the active tenant and say so when it differs, D-285; a project can pin a tenant, switching to it switches, D-286; reviewed in Dark and Light at narrow and wide sizes, session 6). Real-tenant checks listed in status.md. A tenant switch in the top bar: add Azure sign-ins (other accounts or tenants), switch, and Pipelines, Boards, Releases, Workflows, Azure links, chats and terminals follow it |
| 25 | ["Hey Jig" voice commands](25-voice-commands.md) | 🟡 | say "Hey Jig" and a command, also while Jig is minimized; Jig runs it on this computer without Claude (chats in Talk mode, status, tests, workflows, deploys after a spoken yes); the Voice commands page lists them all; real microphone and waking from minimized need checking on a real machine |
| 26 | [Jig on your phone](26-phone.md) | 🟡 | your own Telegram bot, paired by a code in Settings → Phone: requests, questions and plans with buttons, finished/stopped messages with Claude's reply, replies go to the chat, /chats picks one, Claude can text you (`jig_phone_send`) (D-350); a real bot and iPhone need checking on a real machine |
| 27 | [Jig on your phone through Teams](27-teams-phone.md) | 🟡 | Settings → Phone picks Telegram or Teams; for Teams, Jig sets up your own bot and relay in your Azure, and the bot's 1:1 chat, a "Jig" team with a channel per project and a thread per chat do everything the Telegram bot does (D-370); session 1 done: the `PhoneChannel` layer and `phone.channel` (D-377); session 2 done: the relay in `relay/teams/` (D-378), the tenant check waits for Jon; session 3 done: the Teams channel's 1:1 chat (D-379); session 4 done: the team, a channel per project, a thread per chat (D-380); session 5 done: setup in Settings → Phone, Create runs the listed `az` commands (D-381); session 6: docs done, the real check in Jon's tenant waits for him (checklist at the top of status.md) |
| 28 | [Jig factory](28-factory.md) | 🟡 | session 0 done (the `factory` add-on: run model, track graph, gates and inbox as pure, tested logic; Floor, Run, Inbox tabs, a runs view and a top-bar button showing sample runs, D-442); session 1 done (the demo kit on branch `demo-kit` with its quality gate, Storybook and block registry; `factory.demoKitPath` on Settings → Jig factory; skills that start off, D-443); the factory's skills and the critic rubric, off by default); session 2 done (the Conductor and stage runner: runs from a brief through stage chats in a worktree, gates and stage sheets on the Run tab, Inspector, re-run and fork, `factory_*` chat tools, D-449…D-452; Impeccable bundled, D-459); session 3 done (New idea from text, dictation, files, a meeting or a chat reply; the Interview tab with question cards and a live brief; the Plan step, D-460, D-461); session 4 done (the Demo review tab with device frames, versions, scorecard and pins; GD direction cards; design references; Show in Pages, D-462); session M1 done (Motion: videos as storyboards of scenes, a live preview, rendered to MP4 through a pinned HyperFrames and FFmpeg, Settings → Motion, D-463); session M2 done (a natural voice, captions, music mixed under it, captures of a page recorded as scenes with zooms and highlights, D-464); session M3 done (Motion's chat tools, a video card in chats, Write with Jig, styles from a kit, DESIGN.md or theme-factory, exports for the factory, D-465); next: session 5, the pack. New idea → an interview → a polished, critic-checked demo → once approved, the full pack (spec, stories, tests, release notes, customer letter, courses, pitch, deck, marketing, teaser), each a draft people approve at gates, partly from the phone; a built-in add-on with its own stage runner, a separate demo kit repository, sessions 0–8 doable from GitHub without Jig |
| — | [Backlog](99-backlog.md) | — | ideas and deferred work |

## How to work the plan

Phase 19 also includes compact task entry with inline attachments (D-188) and aligned chat input with
a stable overview column (D-189), one shared top-bar search with grouped action menus (D-190/D-192),
compact pipeline arrangement (D-191), paged Chats with simpler header controls (D-193), and wider
task entry with footer permissions (D-194), stable model aliases with opusplan inheritance (D-195),
and repository membership rescanning on manual Refresh (D-196);
its status remains in progress.

1. Pick the first unchecked item of the earliest unfinished phase (phases can overlap when an item
   does not depend on the previous phase).
2. Build it with tests; run `npm run check`.
3. Tick it here and in the phase file; update `docs/status.md` if something user-visible changed;
   record any decision you made on your own in `docs/decisions.md`.
4. Commit (one coherent change per commit).

Phase 19 also includes reported model attribution in Detailed chat and overview details (D-197).

Phase 19 also includes JSON Source defaults, unsent chat drafts and shared interaction motion (D-198–D-200).

Phase 19 also includes more readable Repos branch names without wider sidebars (D-201).

Phase 19 also includes shared project knowledge notes (D-202) and readable, stable busy buttons (D-203).

Phase 19 also includes a stationary whole-chat file summary with a modal breakdown (D-204).

Phase 14 also includes the Browser display-name simplification (D-216); its status remains done.

Phase 14 also includes a native user Browser in the main panel, separate from Claude’s browser (D-225); its status remains done.

Phase 14 also includes a top-right browser shortcut and clear ownership of Claude’s browser controls (D-226); its status remains done.

Phase 14 also includes shared image zoom controls (D-227), and phase 9 includes a readable Suggestions width (D-228); both remain done.

Phase 9 also includes conservative attachment/browser evidence and corrected browser feature actions (D-229); its status remains done.

Phase 11 also includes the repository-owned cross-agent release skill (D-230); its status remains done.

Phase 11 adds in-app Windows update download/install and automatic version status (D-233).
Phase 22 adds remembered lobby view, OS-protected Microsoft sign-in and bounded join failure handling
(D-231/D-232/D-234). Camera-off empty video options caused the stuck join; fixed in source.
Real meeting join acceptance remains open.
