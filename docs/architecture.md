# Jig — architecture

This is the canonical design document. Code worth reading for each part is listed in
`docs/reference/reference-repos.md` (mainly JetBrains' ThinkRail). It describes how Jig is built **as it is** (sections marked
_planned_ are not built yet; `docs/plan/` tracks progress). Read `docs/vision.md` first for the why.
When a change moves a boundary, a contract or a decision described here, update this file in the
same commit.

## 1. Big picture

```
┌──────────────────────────── Electron app ────────────────────────────┐
│                                                                      │
│  Renderer (React UI)          Preload            Main process (host)  │
│  apps/desktop/src/renderer ◀─ window.jig ─▶ IPC ─▶ apps/desktop/src/main
│   - workbench layout                              - projects & git    │
│   - chat, terminals, views                        - sessions (engine) │
│   - add-on UI (React)                             - terminals (pty)   │
│   - themes (CSS variables)                        - add-on host       │
│                                                   - builder           │
│                                                   - activity + learning
│                                                   - scheduler, state  │
│                                                         │             │
│                     utilityProcess per add-on host part ┤             │
└─────────────────────────────────────────────────────────┼─────────────┘
                                                          │ spawns
                              official Claude Code binary (via Claude Agent SDK)
                              signed in with the user's own Claude subscription
```

- **Main process = the host.** Owns all state and every side effect: files, git, processes, the
  agent sessions, add-on host code, the activity log. It is the only place that touches the system.
- **Renderer = the UI.** React 19 + Zustand + Tailwind v4. It never touches the system directly; it
  calls the host through a single typed bridge (`window.jig`).
- **Preload** exposes that bridge with `contextBridge`. The renderer runs with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`.
- **Helper windows.** Browser is a hidden offscreen window owned by the main process.
  `main/appWindows.ts` keeps such helpers out of everything that means "Jig's windows" (events,
  focus, notifications, quitting).
- **Pure packages** hold logic with no Electron dependency so it can be unit-tested:
  `packages/themes` (theme model + VS Code import), `packages/sdk` (add-on manifest, slots, the types
  add-ons are written against), `packages/learning` (pattern mining).

## 2. Repository layout

```
jig/
├── AGENTS.md / CLAUDE.md          instructions for coding agents (CLAUDE.md only imports AGENTS.md)
├── docs/
│   ├── README.md                  index of all docs — start here
│   ├── vision.md                  what and why, principles, non-goals
│   ├── architecture.md            this file
│   ├── decisions.md               every decision, who made it and why
│   ├── status.md                  what works today, how to try it, known gaps
│   ├── plan/                      the phased plan, one checklist file per phase
│   ├── reference/                 contracts: slots, add-on API, IPC, themes, state files
│   └── guides/                    how-tos: developing, testing, writing add-ons, themes
├── apps/desktop/                  the Electron app
│   ├── scripts/                   build.mjs, dev.mjs, dist.mjs (electron-builder), make-icon.mjs
│   ├── electron-builder.yml       packaging (Windows NSIS installer)
│   └── src/
│       ├── shared/                types shared by main, preload and renderer (IPC contract)
│       ├── main/                  host modules, one folder per domain
│       ├── preload/               the window.jig bridge
│       └── renderer/              the React UI
├── apps/launcher/                 restarts Jig after an update from source, with fallback
├── packages/
│   ├── sdk/                       @jig/sdk — add-on manifest schema, slot ids, add-on API types
│   ├── themes/                    @jig/themes — theme model, built-in themes, VS Code mapping
│   ├── learning/                  @jig/learning — command normalisation, pattern mining
│   ├── azure/                     @jig/azure — Azure tenants: keys, tenants file, sign-in checks, azEnv, az error mapping
│   └── documents/                 @jig/documents — attachment types, text from .docx/.xlsx/.pptx
├── addons/                        built-in add-ons (same format as user add-ons)
├── scripts/                       repo checks (design-token check, …)
└── e2e/                           Playwright tests driving the real Electron app
```

## 3. Processes and the bridge

### 3.1 IPC contract

All renderer ↔ host traffic goes through two channels:

- `jig:call` — request/response. `window.jig.call(method, args)` → `Promise<result>`. Methods are
  declared once in `apps/desktop/src/shared/ipc.ts` as a TypeScript map (`HostApi`), so both sides are
  typed from the same source. The main process registers one handler per method in a router; unknown
  methods are rejected.
- `jig:event` — host → renderer push. `window.jig.on(topic, listener)`. Topics and payload types are
  declared in the same file (`HostEvents`).

The renderer wraps this in small hooks (`useHost`, `useHostEvent`). Errors cross the bridge as
`{ code, message }`.

The router checks every call before its handler runs (D-089):
- it comes from Jig's own page (the main frame of `jig-app://`, or the dev server);
- the arguments are plain data;
- methods that take a path, command, URL, prompt or terminal input match a zod schema in
  `main/ipc/validate.ts`.

Add-on UI shares `window.jig`, so handlers still check what they own: folder grants, protected
settings, add-on permissions.

### 3.2 State directory

Everything Jig stores lives under **`~/.jig/`** (`JIG_HOME` overrides it; tests always set it).

| Path | What |
|---|---|
| `config.json` | user settings (theme, style, engine options, schedule, …) |
| `layout.json` | the workbench layout (layout-as-data, §6) |
| `projects.json` | registered projects |
| `sessions/<id>.json` | chat session metadata + transcript cache |
| `attachments/<session>/` | files sent in a chat and images tools returned |
| `attachments/addon-<id>/` | files an add-on keeps for messages it sends later (a task's files) |
| `attempts/` | "Try several ways" runs and their git worktrees |
| `themes/` | user themes (Jig or VS Code format) and imported themes |
| `models/` | dictation's speech models and the natural voice (Kokoro), downloaded on first use (D-208, D-243) |
| `addons/` | the user's add-ons — **a git repository** (§8) |
| `work/` | builder worktrees (§9) |
| `activity/YYYY-MM-DD.jsonl` | the local activity log (§10) |
| `suggestions.json` | the suggestion inbox and the user's past answers |
| `logs/` | host logs |
| `window-state.json`, `builds.json`, `scripts.json`, `addons-state.json`, `addon-data/`, `cache/`, `app-builds/`, `launcher/` | see `docs/reference/state.md` |

Writes are atomic (write temp file + rename). Formats are documented in `docs/reference/state.md`.

## 4. The engine — Claude Code via the Claude Agent SDK

- `apps/desktop/src/main/engine/` defines an `Engine` interface. It can:
  - start a session (cwd, model, permission mode, effort, extra folders, resume id or a rewind
    point);
  - send a user message (also into a running turn), interrupt, and change the model, mode or effort;
  - list commands and models, control MCP servers and background tasks, restore files, and close.

  It emits normalised `EngineEvent`s: text deltas, thinking, tool use, tool results with diffs and
  images, permission requests, results with usage and cost, subagent progress, command output,
  status and errors (`docs/reference/engine.md`).
- **One-shot questions** (`oneShot`: no tools, one turn) serve the AI features around the chat:
  - commit messages, the pre-commit check, change tours, the standup, judging attempts;
  - `ctx.ai.ask` for add-ons.
- `ClaudeEngine` implements it with `query()` from `@anthropic-ai/claude-agent-sdk` in **streaming
  input mode** (an async queue of user messages), so one Claude Code process serves a whole
  conversation, follow-ups can be queued and turns can be interrupted.
- `FakeEngine` implements it with scripted replies. It is used by tests and by `JIG_ENGINE=fake`.
  Development and CI never use real Claude credentials.

**Subscription, never credentials.** The SDK launches the official, unmodified Claude Code binary
(shipped by Anthropic in the SDK's per-platform package, or the user's own `claude` when
`engine.claudePath` is set). Claude Code uses its own login (`claude` → `/login`), so usage draws on the
user's Claude plan. Jig:

- has no login UI and never reads `~/.claude/.credentials.json` or any token;
- by default **removes `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the session environment**
  so a stray key can't silently switch billing to pay-as-you-go (setting `engine.allowApiKey`);
- shows the auth source reported by the session (`apiKeySource` in the init message: `oauth` /
  `none` = subscription) and warns when it is an API key;
- when Claude Code isn't signed in, tells the user to run `claude` in a terminal and `/login`
  (Jig can open that terminal for them) — sign-in always happens in Anthropic's own flow.

**Your Claude Code setup keeps working.** Sessions use `settingSources: ['user','project','local']`
and the `claude_code` system-prompt preset, so CLAUDE.md files, skills, plugins, hooks and MCP servers
behave as in the CLI. Jig only **appends** a short context block (what Jig is, which Jig tools exist and when to use the
terminal and browser tools).

**Permissions.** `canUseTool` routes permission requests to the UI:
- Allow once, Always allow or Deny;
- questions (AskUserQuestion) as option cards;
- plans (ExitPlanMode) as a plan card.

The session's permission mode (default, acceptEdits, plan, bypassPermissions) is set per session from
a menu or with Shift+Tab.

**Jig tools in every session.** Each session gets an in-process MCP server named `jig`
(`createSdkMcpServer`). Its tools are the only ones Jig adds:
- `jig_request_build`, so saying "make me a button that…" in any chat starts the builder;
- the configuration tools (`docs/reference/configure.md`);
- the terminal tools (`jig_terminal_*`);
- Browser (`jig_browser_*`).

Read-only tools run without a prompt.

**Plan usage.** Your subscription's 5-hour and weekly windows are always visible (status bar, chat
header ring, card on hover). Jig asks Claude Code for the data behind `/usage` (a prompt-less Claude Code
process, every 5 minutes and after chats) and listens to Claude Code's rate-limit events; it never reads
the login itself. Reference: `docs/reference/usage.md`.

**Configuring Jig from a chat.** Claude can read and change everything already configurable — settings
(theme, fonts, density, file icons, terminal, learning, workspace depth…), layout, add-ons on/off,
project names and colours, and install themes — through tools on the `jig` MCP server. Changes go
through Claude Code's permission prompt and leave a card with Undo in the chat; billing and
program-running settings are Settings-only. Reference: `docs/reference/configure.md`.

**File previews.** One Preview tab renders Markdown (with Mermaid), HTML, PDF, CSV/Excel, JSON,
notebooks, media, Office text and code. Image/SVG previews, image tabs and Git image comparisons share `ImagePreview`, with
a fixed-height zoom toolbar, natural-pixel scaling and an independently scrollable viewport (D-227).
Binary content is served through `jig-file:` with per-folder
grants, never from arbitrary paths. Reference: `docs/reference/preview.md`.

**The chat.** It follows Claude Code's own UI: `/` commands and skills, `@` files, `!` shell, `#`
memory, history, modes, steering a running turn, rewind, todos, plans, diffs, subagents, background
tasks, MCP status and effort, all also in menus. Reference: `docs/reference/chat.md`.
The transcript and composer share one conversation column, with matching content widths, padding
and a reserved scrollbar gutter (the composer uses `--jig-scrollbar-size` padding so its pickers can
extend above the input without clipping). The overview card has a permanently reserved column alongside it,
including empty/loading chats and when hidden, so its visibility never moves the conversation (D-189).

**User browser (D-225).** Tools → Open Browser opens a main-panel tab backed by a native
`WebContentsView`, owned by main per workbench window, with its own persistent cookie partition,
no preload, sandboxing and context isolation. Typed `userBrowser.*` IPC reports native state and
updates slot bounds/visibility. Hidden tabs and DOM menus/dialogs hide the native surface; the
reserved slot never changes size for loading/status. It is independent of Claude's tools and frames.

**Claude's terminals and browser.** Claude runs long commands in Jig terminals the user sees
(`jig_terminal_*`, `docs/reference/terminals.md`) and checks web UI in the browser: one offscreen
Chromium page owned by the main process (its own session, sandboxed), driven by `jig_browser_*` tools
with real input events and shown live in a view the user can click/type in for sign-ins.
The address is read-only; Claude owns browser navigation/viewport controls. A hint links to the
user Browser, also reachable from the top-right globe icon (D-226). Hidden helper windows are kept
out of "all windows" by `main/appWindows.ts`. Reference: `docs/reference/browser.md`.

**AI features around the chat.** Built on the same Claude Code:
- Try several ways: parallel attempts in worktrees, judged by Claude (`docs/reference/attempts.md`).
- Guided tours of changes, the pre-commit check, commit messages and the standup.
- Ask Claude about a failed script or a previewed file, and turn a chat into a tool.

Each has a menu entry. Reference: `docs/reference/ai-features.md`.

**Routines and artifacts.** Claude Code's cloud features, without Jig touching the claude.ai login
(D-092):
- In chats, Claude uses its own `RemoteTrigger` and `Artifact` tools, and Jig adds cards to open the
  results.
- The Routines and Artifacts tabs use `Engine.callTool`: a hidden Claude Code session that may make
  exactly one call to one tool, with a `PreToolUse` hook and `canUseTool` both checking it. It costs a
  small model call, so the tabs load on demand.
- Artifacts open in the Preview tab, never as claude.ai inside Jig.

References: `docs/reference/routines.md`, `docs/reference/artifacts.md`.

**Context window.** After each turn Jig asks Claude Code for its `/context` data and shows it in the
chat header; Compact sends Claude Code's own `/compact`. Reference: `docs/reference/engine.md`.

**Home.** With no tab open, the main area is the active project's Home: a New chat button (with a folder
picker and starter prompts that open a chat with the message ready; D-246), recent chats, next steps and the add-ons' widgets (also the project dashboard tab). Chat tabs show a
dot when the chat works, needs you or finished unseen. Reference: `docs/reference/layout.md`.

**What Jig can do.** A core tab (the main area's welcome screen until you add a project, and in the "Jig" menu) explains Jig with bundled screenshots and live data: the slots from
`@jig/sdk`, the add-ons that use them, your Claude Code skills (`about.skills`, front matter only), the
registered shortcuts. Its examples start a build or open a chat with a draft. Reference:
`docs/reference/about.md`.

## 5. Projects, sessions and terminals

- **Workspace** = a folder you added: a git repo, or a folder of repositories (D-075). Jig finds the
  repositories inside (three levels deep by default, `projects.repoScanDepth`; cached). Repos lists
  every workspace's repositories (`AddonWorkspace`, `ctx.workspaces`, `api.workspaces()`).
- **Project** = a group of chats **you** manage (D-101), like projects in the Claude app. It has:
  - a name and colour;
  - a **default workspace** (`path`), where its chats start;
  - a **default Git repository** (`focusRepo`), which drives the Git panel, the status bar and Git
    actions;
  - defaults for its chats (model, effort, permission mode) and **instructions** appended to
    Claude's system prompt (`jigContext`);
  - starter prompts for its Home.

  `ProjectInfo`/`AddonProject` carry the facts of the default workspace (`isGitRepo`, `repos`), so
  "the project's folder" is still `path`. Stored in `projects.json`. **Left follows the active
  project, right is global** (D-102, a guideline): Git, Files and Home follow it; Repos, Scripts,
  Pipelines and Suggestions are global.
- **Session** = one Claude Code conversation, in a project or none (`projectId?`; never set from the
  folder). It runs in any folder (`cwd`), by default the project's default workspace. You put chats
  in projects (drag and drop in Chats, a menu, or `jig_move_chat`) and pin them (`pinned`). "Try several ways" runs several sessions on one task, each in its own **git worktree** under
  `~/.jig/attempts`, so they don't collide (`docs/reference/attempts.md`). Several sessions run at once; the session list shows
  status (idle / working / needs permission / error) for every project at a glance.
- **Terminal** = a pty (`@lydell/node-pty`, prebuilt binaries — no compiler needed on Windows) rendered
  with xterm.js. Terminals belong to a project and can be started by add-ons ("run this script") and
  by Claude (`jig_terminal_run`, for dev servers and watchers you can see and stop).

## 6. The workbench — layout as data

The window is divided into **regions**: `topbar`, `left` sidebar (its lower half `left2`), `main`
(tabs, optionally split in two), `right` sidebar (lower half `right2`), `bottom` panel, `statusbar`.
A view not in a region opens as a main tab (`jig.view`); any view's tab can be dragged to any of
them (D-173, D-174). The arrangement is plain data in `layout.json`
(`apps/desktop/src/shared/layout.ts`, reference: `docs/reference/layout.md`):

```jsonc
{
  "left":   { "views": ["jig.projects", "jig.sessions"], "size": 280, "collapsed": false },
  "left2":  { "views": ["addon.repos.overview"], "size": 260, "collapsed": false },
  "right":  { "views": ["addon.scripts.scripts"], "size": 320, "collapsed": true },
  "hidden": ["addon.releases.releases"],
  "bottom": { "views": ["jig.terminal"], "size": 240, "collapsed": true },
  "main":   { "tabs": [ { "type": "jig.chat", "params": { "sessionId": "…" } } ] }
}
```

**No native menu bar.** The window has no OS title bar and no Electron menu bar on Windows/Linux:
the top bar is Jig's own, with Jig's own menus (Jig, project switcher, settings, and a few merged
action menus: Chats, Code, Build, View — D-174). macOS keeps a
minimal application menu so Cmd+C/V/Q and window shortcuts keep working (D-023).

Core features and add-ons contribute **views** with stable ids; the layout decides where they appear.
Moving, hiding or resizing a view is a layout change — which is also what the builder does for
"level 1" requests ("move pipelines to the right"). Every layout change is a pure function in
`shared/layout.ts`, shared by the renderer and the host.

**Renderer structure.** `renderer/workbench/` is the shell: a **registry** (views, tab types, menu
actions, status-bar items — a store, so add-ons can register and unregister at runtime), the layout
store, the top bar, regions, main-area tabs, status bar, the **grouped menus** (every action),
shared **Go to** search (search field, Ctrl+P or Ctrl+K), toasts and keyboard shortcuts (every shortcut is
also an action in a menu). `renderer/features/<feature>/` registers its views, tabs and actions
(`features/index.ts`). Views, tabs and status items each render inside an error boundary. Tab bodies
stay mounted once opened, so a chat or terminal keeps its state while you switch tabs.
Core `ViewDef.headerMenu()` contributes view-specific entries to a sidebar's existing ⋯ menu and
to the view's options menu when opened as a main tab. Chats uses it for the View type submenu (D-193).
Shared Dialog supports an `xl` width for longer forms. Add tasks uses it, with a compact one-line
hint and batch permissions in the footer; task rows retain their fixed height (D-194).
`shared/models.ts` supplies stable family-alias labels and options to chat, project and settings
pickers. It combines aliases with discovered explicit versions without pinning defaults (D-195).

## 7. Design system and themes

- **Tokens.** Every colour, space, radius and type size is a token. Colours are CSS variables
  (`--jig-bg`, `--jig-surface`, `--jig-text`, `--jig-accent`, …, ~30 of them) mapped into Tailwind v4's
  `@theme` so components use utilities like `bg-surface text-muted border-border`. Raw hex values and
  arbitrary Tailwind values are forbidden in UI code and add-ons; `scripts/check-tokens.mjs` enforces it
  (and the builder runs the same check on add-ons it writes). This is what makes every theme recolour
  everything, including agent-written add-ons.
- **Theme model** (`packages/themes`): `{ id, label, appearance: 'dark'|'light', colors{…tokens},
  terminal{16 ansi + fg/bg/cursor}, syntax: <VS Code tokenColors or a Shiki theme name> }`.
- **Built-in themes:** Jig Dark, Jig Light (and more over time).
- **VS Code themes.** A VS Code theme's workbench `colors` are mapped onto Jig tokens through an ordered
  list of VS Code keys per token, with derived fallbacks (mix/lighten/darken) and a contrast pass;
  `terminal.ansi*` maps 1:1; `tokenColors` are used as-is for syntax highlighting through Shiki.
  Sources: the user's installed VS Code / VS Code Insiders / Cursor / VSCodium extension folders, the
  Open VSX registry (download the `.vsix`, extract only the theme JSON — nothing is executed), and
  files dropped into `~/.jig/themes`. JSONC and `include` chains are supported.
- **File icon themes.** VS Code icon themes (Material Icon Theme, Seti, …) from the same sources;
  by default the one VS Code uses (`workbench.iconTheme`). `resolveFileIcon` in `packages/themes`
  follows VS Code's rules; icons are served by the `jig-icons:` protocol; `FileIcon` (also in
  `@jig/sdk/ui`) draws them. Reference: `docs/reference/file-icons.md`.
- **Style settings** (independent of colour): density, corner radius, UI font, mono font, font size.

## 8. Add-ons and slots

An **add-on** is a folder with a manifest. Built-in add-ons live in `addons/`; the user's in
`~/.jig/addons/` (a git repository — every change is a commit).

```
my-addon/
├── addon.json      manifest: id, name, description, version, permissions, contributions
├── ui.tsx          optional: React components and handlers for UI contributions
├── host.ts         optional: code that runs in the host (Node), in its own utilityProcess
└── README.md       what it does and why — the builder reads this when considering a change
```

### 8.1 Slots

A contribution targets a **slot**. Slot ids are defined in `packages/sdk` (`SLOTS`) and documented in
`docs/reference/slots.md`:

| Group | Slots |
|---|---|
| Places | `view` (sidebar or bottom panel view; the layout decides where), `workbench.tab`, `topbar.item`, `statusbar.item`, `dashboard.widget` |
| Menus & actions | `tools.action` (grouped menus), `context.file`, `context.project`, `context.repo`, `context.message`, `chat.toolbar` |
| Chat | `chat.toolRenderer` (custom card for a tool result), `chat.permissionRenderer` (an add-on's own approval card for its tool, which can change the input), `prompt` (a reusable prompt shown as a button) |
| Background | `watcher` (host-side job on an interval or schedule), `jig.event` (host code when a chat finishes, a commit lands, the project changes; D-215) |
| Claude | `claude.tool`, `claude.context` |
| Other | `search.provider` (results in Go to), `settings.page`, `theme` |

Besides slots, the API gives add-ons toasts with buttons, system notifications, badges on their
views, live program output (`spawn`), file watching, and calling each other's shared host methods
(`exports`) — `docs/reference/addon-api.md` (D-215). Jig's events come from `main/addons/jigEvents.ts`
(chat status, the projects' `.git` folders, the active project) and are dispatched by
`AddonService.dispatchEvent` and the `addons.jigEvent` event.

### 8.2 Runtime

- **UI part.** The host bundles `ui.tsx` with esbuild into an ES module, with `react`,
  `react/jsx-runtime`, `react-dom`, `lucide-react`, `@jig/sdk` and `@jig/sdk/ui` mapped to the app's
  own instances through `globalThis.__jigShared` (so add-ons share React and the design system). The
  host also generates the add-on's Tailwind CSS at runtime from its source with Jig's token theme
  and Tailwind's default screen and container sizes, so `md:` and `@xl:` work in add-ons too
  (`main/addons/css.ts`). The renderer loads both through the `jig-addon://` protocol and renders each
  contribution inside an error boundary. A crashing contribution shows an inline error with
  "Turn off" / "Fix with AI" — never a broken app.
- **Host part.** `host.ts` is bundled to a Node module and runs in an Electron `utilityProcess` per
  add-on, talking to the host over a message port. It receives a host API (`exec`, `spawn`, `fs` with `watch`, `fetch`,
  `storage`, `notify`, `setBadge`, `emit`, `addons`, `projects`, `chats`, `azure`) limited by the manifest's `permissions`.
  Every program it runs gets the active Azure tenant's environment (`init.azure`, then `azure`
  messages when it changes; §11.1), and `api.azure.az` is Jig's one `az` runner (D-284).
- **Hot reload.** The host watches add-on folders, rebuilds on change and tells the renderer to reload
  that add-on only.
- **Built-in vs yours.** Built-in add-ons ship in `addons/`; a folder in `~/.jig/addons` with the same
  id replaces the built-in one (the builder changes a built-in add-on by copying it there).
- Code: `packages/sdk` (manifest, slots, API types), `main/addons/` (catalog, bundler, CSS, host
  process, service, git history), `renderer/addons/` (loader, `ctx`, `@jig/sdk/ui`). References:
  `docs/reference/slots.md`, `docs/reference/addon-api.md`.
- **Context.** UI components receive `ctx`: `ctx.host.call()` to reach their host part, plus core
  APIs: active project, open a tab, run in a terminal, send a prompt to a chat, notify, per-add-on storage.

Add-ons are **full React in the app process** (not sandboxed iframes): they look and feel native and
can be placed anywhere the slots allow. Safety comes from preview + accept, git history, per-add-on
disable, and process isolation for host code — see `docs/decisions.md` (D-007).

## 9. The builder — "build something"

Entry points (all menus, no commands): **Search → Build something…**, `⋯ → Change this with AI` on any
add-on contribution, **Fix with AI** on a crashed one, **Build it** on a suggestion, and the
`jig_request_build` tool from any chat. Reference: `docs/reference/builder.md`; code: `main/builder/`.

A **build job** runs a dedicated Claude Code session (a normal session of kind `builder`, in *Accept
edits* mode, working in the job's worktree) with Jig's builder instructions appended to Claude Code's
own system prompt and the `jig-builder` MCP server. It follows the **levels** strictly, lightest first:

1. **Layout / settings** — staged changes to `layout.json` / `config.json`.
2. **Add-on** — first it **reads the catalog of existing add-ons** (manifests + READMEs) and decides
   whether to **change an existing add-on** (preferred when it is a natural fit) or create a new one.
   Work happens in a git worktree of `~/.jig/addons` under `~/.jig/work/`.
3. **Extension proposal** — when 1 and 2 cannot do it, the builder doesn't change Jig: it proposes
   the missing slot or API (see below).

Before anything reaches the user, the host validates: manifest schema, bundling, design-token check,
and a smoke load. Failures go back to the builder session to fix (bounded retries). Then the user sees
a **preview** (the add-on loaded from the worktree, marked "Preview") and chooses **Accept** (merge →
commit in `~/.jig/addons`, add-on goes live) or **Discard** (worktree deleted). Progress is shown as a
card in the chat that asked, and in the Builds view.

**No self-editing (D-074).** Jig never changes its own source. When no slot can do a request, the
builder calls `propose_extension_point { reason, proposal }`; the build ends ("needs you") with the
proposal — why the existing slots and API aren't enough, and the smallest new slot or API that would let
the request be built as an add-on — which you can copy and implement in Jig's repository yourself.

## 10. Learning — activity, patterns, suggestions

1. **Record (always, no AI, local only).** The host appends events to `~/.jig/activity/*.jsonl`:
   prompts sent, tool calls (notably Bash commands) from sessions, commands run in Jig terminals, add-on
   actions and scripts run, git operations, project switches. Recording can be paused; paths/patterns
   can be excluded.
2. **Mine (no AI).** `packages/learning` normalises commands into templates (paths, ids, numbers,
   quoted strings → placeholders), counts them across days and projects, finds repeated sequences
   (n-grams within a time window) and groups similar prompts (token similarity). Only patterns above a
   threshold survive, each with concrete evidence.
3. **Reflect (AI, on demand).** When the user presses **Look for patterns now**, or on the schedule
   (default **Mondays 10:00**, configurable; a missed run happens at the next launch), a one-shot Claude
   Code query receives the mined patterns, the add-on catalog and the user's past answers, and returns at
   most 3 suggestions as JSON (validated): title, why (with evidence), level, whether to change an
   existing add-on or create one, estimated time saved.
4. **Suggest.** Suggestions wait in the inbox (Search → Suggestions, with a badge). **Build it** starts
   the builder with the suggestion as the goal; **Not now** snoozes; **Never** blocks that pattern.
   Answers feed the next reflection.

Prompt activity includes shared image/document counts even for attachment-only messages, without
file paths/content or inferred input provenance. Reflection samples retain the counts; browser gaps
require explicit web context and never imply user permission denial (D-229).
See `docs/reference/learning.md`.

## 11. Git and the built-in add-ons

Jig's own Git tab is the built-in add-on `addons/git`: the Git view (current branch, working changes
with stage/unstage/discard and commit, branches), and main-area tabs for **history per branch**,
**commit detail** and **file diffs** (side by side or inline, theme-highlighted, unchanged regions
collapsed) and branch comparison. Its host code runs the user's `git` safely (argument arrays, no
shell, `core.quotepath=off`, `GIT_TERMINAL_PROMPT=0`) and parses machine-readable output
(`addons/git/lib/parse.ts`). Rebase, graph and blame are out of scope. Jig does not run VS Code
extensions or embed VS Code (D-019, D-022).

The other built-in add-ons: `addons/repos` (all projects' repos at a glance, fetch/pull/push, switching
branches, Open in VS Code/Explorer), `addons/pipelines` (Azure DevOps through `az`, with a watcher for runs you started)
`addons/scripts` (scripts view and menu actions), `addons/files` (the project's file tree with git colours), `addons/releases` (versions, changelogs and
deploys per repository from its `.jig/release.json` policy, D-110; its Claude tools are the first
`claude.tool` contributions, D-115) and `addons/workflows` (repeated
lists of steps per project, run by hand, with help or on a schedule, D-112). They use only public slots, so they are
also examples for the builder.

### 11.1 Azure tenants (D-282)

Everything Azure and Azure DevOps is an `az` subprocess. A **tenant** is one Azure CLI sign-in in its
own folder, `~/.jig/azure/<key>/`; Jig runs `az` with `AZURE_CONFIG_DIR` pointing at the active one
(and `AZURE_EXTENSION_DIR` on your own extensions, so `azure-devops` is there in every tenant). The
Azure CLI keeps and refreshes its tokens in that folder; Jig never reads, copies or logs them, nor
`az` output. **Your az login** (no override) is always the first entry: without extra tenants nothing
changes.

- Pure logic: `packages/azure` (`tenantKey`, `parseTenantsFile`, `mergeSignIn` of `az account show`
  and ARM `/tenants`, `signInStatusFromError`, `azEnv`; `azFailure`, `decodeAzOutput`, `activeTenantRef`; `azPythonFor`, `azArgsViaFiles`).
- Host: `main/azure/index.ts` keeps `azure/tenants.json` (through the state module), runs `az login`
  for adding and signing in again (one at a time, output as `azure.signInProgress`, cancellable),
  checks sign-ins on request (`signedOut` / `expired`, never a prompt) and follows the protected
  setting `azure.activeTenant`. `main/azure/env.ts` holds the active tenant and its environment.
- One way to start `az` (D-290): `main/azure/run.ts` `azCommand` (no shell; Windows' installed az as
  its own Python with `-X utf8`, any other az with free text in `@file` arguments).
- One way to run `az` (D-284): `main/azure/run.ts` `runAz` (JSON out, decoded, failures mapped by
  `azFailure` into an `AzError` naming an added tenant). Project links use it in main; add-on hosts
  run it as `api.azure.az`. Setup checks and add-on `exec`/`spawn` (any program, so scripts that call
  `az` follow too) add the same environment; an explicit `options.env` from an add-on still wins.
- Switching emits `azure.tenantChanged` to the renderer and the add-on event `azure.tenant`
  (`JIG_EVENTS`), after host processes got the new tenant. Add-on UIs read it from `ctx.azure`
  (with the tenant's `initials`, so an add-on shows a tenant as the same avatar as the top bar).
  Pipelines and Boards key their caches and stored lists by tenant and reload (Pipelines shows a
  failed listing, like an expired sign-in, in its empty state's place); a board of another
  tenant shows a Switch card with the tenant's avatar; Releases and Workflows name the tenant in failures; Azure links list
  the tenant's subscriptions.
- Chats, terminals and scripts (D-285): a Claude Code process, a terminal (scripts run in one) and a
  `!` command start with `withAzureEnv(sessionEnv(…))` (`main/azure/env.ts`: API keys stripped as
  before, then the active tenant's environment) and keep it. `SessionMeta.azureTenant` (while the
  process runs) and `TerminalInfo.azureTenant` record it; `features/azure/TenantTag.tsx` shows it in the
  chat header and terminal tab only when it differs from the active tenant. `jigContext` names the
  tenant and user (`tenantContext`), and a message's context says so when the user switched since.
- Tenant per project (D-286): `Project.azureTenant` pins a tenant key. `followProjectTenants`
  (`main/azure/index.ts`, started by `startProjects`) watches the project store: when the active
  project (or its pin) changes and the pin names an existing tenant, it calls the same
  `setActiveTenant` as the top bar. No pin or a removed tenant = Default (nothing switches); the
  project dialog shows a note for a removed one (`pinnedTenant` in `@jig/azure`).
- Renderer (D-283): `features/azure` — the tenant avatar at the far right of the top bar (its menu
  switches; the Add and Manage modals hang off it), Settings → Azure, a store fed by
  `azure.tenantChanged`. Claude: `jig_azure_tenants` (reads) and `jig_azure_switch_tenant` (approval).

## 12. Packaging, first run and updates

`npm run dist` builds the app and packages it with electron-builder for the platform it runs on
(Windows: an NSIS installer, per user). No asar: runtime tools (esbuild, Tailwind, the Claude Code
binary, node-pty) need real files. Built-in add-ons ship in `resources/addons`. An installed Jig opens
**Get started** on its first start: version checks of Claude Code, git, gh, az (+ Azure DevOps
extension) and `code` — never a login. Updates: from a git clone, pull + build + restart through the
launcher (`apps/launcher`: waits for Jig's "ready" file, falls back to the previous build, then safe
mode with your add-ons off, and Jig shows a banner); installed, the latest GitHub release page. Guide: `docs/guides/packaging.md`; reference:
`docs/reference/setup.md`.

## 13. Testing

- **Unit** (Vitest): pure packages and host modules (with a temp `JIG_HOME`).
- **End-to-end** (Playwright driving Electron, under Xvfb on Linux): `JIG_ENGINE=fake`, temp
  `JIG_HOME`, real UI.
- **Checks:** `npm run check` = typecheck + lint (Biome) + unit tests + design-token check.

### Model defaults and desktop menus (D-129)

The main process passes the default model (Opus, D-207) and the subagent fallback to Claude Code; it does not implement model routing. Chats get the `jig-tester` and `jig-search` subagents on small models through the SDK's `agents`. New chats start in Plan mode, add-on questions use Sonnet, browser testing/searching/reflection keep Haiku. Settings preserve explicit choices and offer a preset. Top-bar group menus derive from the existing action registry and use `ui/Menu`; Ctrl+K still searches all actions.

Markdown file previews opt into HTML parsing followed by sanitization before React rendering. Local images and links still use jig-file grants; chat Markdown does not opt in.

The shared menu state optionally carries a menu-bar identity. Topbar uses that identity to switch an open menu on hover, without opening menus from an idle pointer move or switching unrelated context menus.

On Windows, main windows remain off the taskbar until ready-to-show has set their icon; relaunch metadata points at the branded executable. Hidden browser helpers explicitly skip the taskbar.

`engine.models` discovers the model catalogue through the existing no-prompt SDK control-process lifecycle. Appearance font choices use bundled fonts and generic system families with custom input/reset; no renderer filesystem access or OS font scan is introduced. Open VSX UI debounces search and ignores responses superseded by newer queries.

Regular chats are drafts until the first prompt is sent (`SessionMeta.draft`, D-199). The main
session manager suppresses draft disk writes. The main layout module filters draft/missing session
tabs on disk while retaining the live layout; the first send persists its existing open tab.

The chat's whole-chat file summary (D-204) sits outside the transcript scroll area above the composer,
with reserved space from the empty chat onward. It shares `chatStats` with the overview; its modal
shows a snapshot of per-file edit/line totals, and Undo uses the first message's checkpoint.

## Bundled skill library (D-205)

The host loads the reviewed `skills/catalog.json` and selects independent local Claude Code skill
plugins using each chat's project and config.skills.overrides. The native SDK loads their
instructions on demand; existing Claude user/project/local configuration remains enabled. A
changed selection resumes the process with updated plugins at the next turn boundary. The one
Skills library tab provides global switches and project selection, with modal details/pickers.
No project/personal setup is modified; packaged assets live in resources/skills. Full contract:
`reference/skills.md`. AI feature disclosure defaults follow the AI UX skill's effective selection.

## Speech: dictation and reading aloud (D-208)

Dictation runs Whisper on the user's machine: transformers.js on WebAssembly in a renderer Web
Worker (`features/speech/speech.worker.ts`), with the ONNX runtime bundled. The main process owns
the model files (`main/speech/`): the worker loads them from the privileged `jig-speech:` scheme
(`jig-speech://hf/<org>/<model>/<file>`, only Jig's three models), which serves them from
`~/.jig/models` or downloads them once from Hugging Face, reporting `speech.progress`. A complete
model never goes online again. `features/speech/engine.ts` reads the microphone at 16 kHz with Web
Audio (`Capture`) and `LiveText` has Whisper read the current piece again while you speak; the
composer replaces the dictated span as words come in, and nothing is sent until you press Enter.
With a graphics card the worker uses WebGPU (fp32 encoder, q4 decoder; D-209), else WebAssembly
(q8); each variant's files are downloaded separately. Read aloud and talking use the natural voice
(D-243) or the system's voices (`speechSynthesis`), through one API in `features/speech/speak.ts`
(`speak`, `preloadSpeech`, `stopSpeaking`). The natural voice is Kokoro-82M in an Electron
utilityProcess (`main/speech/voiceHost.ts` → `voice-host.mjs`, managed by `NaturalVoiceHost`, stopped
after 10 minutes unused): `speech.say` returns 24 kHz audio, which `features/speech/naturalVoice.ts`
plays with Web Audio, making the next sentence while one plays and feeding its loudness to the waves.
Text becomes phonemes there: English with espeak-ng (`english.ts`, from kokoro-js), Spanish with
rules (`spanish.ts`). The model is downloaded by `SpeechModels.ensureVoice` into `~/.jig/models`. Chromium's Web Speech recognition doesn't work in Electron and
Claude Code's own voice mode needs claude.ai, so neither is used.

Talking with Claude (`features/speech/voice.ts`, D-209) is a renderer loop around a normal chat:
voice activity detection on the microphone frames starts and ends your turn, the text goes through
the composer and `sessions.send`; Claude's streamed text is read aloud sentence by sentence
(`speakableUntil`) and talking over it cancels it. Pending permissions are read out and answered by
voice (`replies.ts`: yes → allow, else deny with what you said as feedback). The chat's `voice` flag
(`sessions.setVoice`) makes the host add `VOICE_GUIDANCE` (`main/speech/voice.ts`) to each turn's
context, so Claude answers in short spoken sentences, looks at the code (read-only, plan mode) and
presents a plan with ExitPlanMode, or, for bigger work, a task queue with `addon_tasks_add` (D-218).

The talking window (`features/speech/VoiceDialog.tsx`, D-210, D-218) is mounted once in the workbench and
follows the `useVoice` store: sound waves on a canvas (`Waves.tsx`) driven by `meter.ts` (microphone
levels; a pulse per word Claude says, since system voices give no audio) in the centre, the
conversation fading upwards under them, a plan card in the right margin while a pending ExitPlanMode
or task-queue `addon_tasks_add` waits (`planOf` in `replies.ts`), and Mute / Stop voice / End talking /
Go ahead. The go-ahead (a phrase from `isGoAhead`, or the button) approves the pending plan (a queue
is allowed with `start: true`), or sends "Go ahead" and approves the plan as it comes; then talking
ends (the chat leaves voice mode) and `cues.ts` follows the chat quietly: a chime when it finishes or needs you (the soft note every
1.17 s plays only while talking) (`speech.workSound`). "Bye" only ends talking; a chat Jig put in plan mode goes
back to its own mode once it is idle.


## Global meeting room (D-217)

The built-in Meetings add-on (global scope, addons/meetings) opens the host's dedicated media window
through ctx.meetings.open() (and ctx.meetings.history(), the core `jig.meetings` history tab, D-250). main/meetings owns an atomic MeetingStore, public-desktop MSAL sign-in,
Graph calendar reads and keyless ACS credential exchange using AzureCliCredential. It also owns
a temporary loopback server for its bundled media page: ACS rejects the workbench's custom
scheme. Its localhost URL binds only 127.0.0.1 on an ephemeral port, checks Host/method/path, serves with CSP and
no remote scripts, and closes with the window. Only its registered window/main frame gets IPC from
that exact origin. Development continues using Vite's configured origin (D-222).
MSAL sign-in persists only as OS-encrypted safeStorage ciphertext (D-232); no plaintext cache,
client secret or resource key is persisted. Only the owned window can obtain a calling credential,
write captions/status, select a screen, or send questions/actions. The first-party media renderer
uses the pinned official Calling SDK; this narrow media exception follows the speech/device pattern.
Its CSP allows SDK HTTPS/WebSocket connections and blob media/workers, while other Jig pages retain
their existing connect/media policy. No remote scripts are permitted. Microphone/camera permission
is limited to Jig's own origin/main frame; screen sharing requires an expiring one-use source selected
in the meeting window. The window is an appWindows member, not a hidden browser helper.

The window is independent of workbench mounts and project selection; CallClient, TeamsCallAgent and
caption listeners live in its media owner. Closing/reloading/crashing and application quit have explicit
lifecycle handling. Stored meeting records contain no projectId. Questions make immutable snapshots,
then create normal project/meeting-only Plan-mode chats that read paginated text with jig_meeting_read.
Notes use jig_meeting_save_notes only from the generated notes chat. Reviewed actions are sent to Tasks'
shared addReviewed export with one project/source id per task; queueing pauses the queue and is idempotent.
See addons/meetings/README.md for the UI, setup, persistence and known SDK limits.

**Project knowledge** (`main/knowledge/`, D-256, D-289) is core, not an add-on: per project, notes
(`notes.ts`, `shared/notes.ts`) and documents (`store.ts`) under `knowledge/<projectId>/`. One
message context gives Claude the notes in full and the document names; `jig_notes_*` keep the
notes, `jig_knowledge_read` reads a document. The renderer shows them on the project's Home
(`features/knowledge/KnowledgeCard.tsx`) and in the `jig.notes` view (`Notes.tsx`).
