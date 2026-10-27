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
│   ├── scripts/                   build.mjs, dev.mjs
│   └── src/
│       ├── shared/                types shared by main, preload and renderer (IPC contract)
│       ├── main/                  host modules, one folder per domain
│       ├── preload/               the window.jig bridge
│       └── renderer/              the React UI
├── packages/
│   ├── sdk/                       @jig/sdk — add-on manifest schema, slot ids, add-on API types
│   ├── themes/                    @jig/themes — theme model, built-in themes, VS Code mapping
│   └── learning/                  @jig/learning — command normalisation, pattern mining
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

### 3.2 State directory

Everything Jig stores lives under **`~/.jig/`** (`JIG_HOME` overrides it; tests always set it).

| Path | What |
|---|---|
| `config.json` | user settings (theme, style, engine options, schedule, …) |
| `layout.json` | the workbench layout (layout-as-data, §6) |
| `projects.json` | registered projects |
| `sessions/<id>.json` | chat session metadata + transcript cache |
| `themes/` | user themes (Jig or VS Code format) and imported themes |
| `addons/` | the user's add-ons — **a git repository** (§8) |
| `work/` | builder worktrees (§9) |
| `activity/YYYY-MM-DD.jsonl` | the local activity log (§10) |
| `suggestions.json` | the suggestion inbox and the user's past answers |
| `logs/` | host logs |

Writes are atomic (write temp file + rename). Formats are documented in `docs/reference/state.md`.

## 4. The engine — Claude Code via the Claude Agent SDK

- `apps/desktop/src/main/engine/` defines an `Engine` interface: start a session (cwd, model,
  permission mode, resume id), send a user message, interrupt, change model/permission mode, close;
  it emits normalised `EngineEvent`s (text deltas, thinking, tool use, tool result, permission request,
  result with usage/cost, status, error).
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
behave as in the CLI. Jig only **appends** a short context block (what Jig is, which Jig tools exist).

**Permissions.** `canUseTool` routes permission requests to the UI (Allow once / Always allow /
Deny); the session's permission mode (default, acceptEdits, plan, bypassPermissions) is selectable per
session from a menu.

**Jig tools in every session.** Each session gets an in-process MCP server named `jig`
(`createSdkMcpServer`) with a small set of tools — e.g. `jig_list_addons`, `jig_request_build` — so
saying "make me a button that…" in any chat starts the builder. These are the only tools Jig adds.

## 5. Projects, sessions and terminals

- **Project** = a folder, normally a git repo. Registered in `projects.json` with a display name,
  colour and icon. The project switcher lists them; every view is scoped to the active project unless
  it is a cross-project view (e.g. Repos overview).
- **Session** = one Claude Code conversation in a project, optionally in its own **git worktree**
  (_planned_) so parallel agents don't collide. Several sessions run at once; the session list shows
  status (idle / working / needs permission / error) for every project at a glance.
- **Terminal** = a pty (`@lydell/node-pty`, prebuilt binaries — no compiler needed on Windows) rendered
  with xterm.js. Terminals belong to a project and can be started by add-ons ("run this script").

## 6. The workbench — layout as data

The window is divided into **regions**: `topbar`, `left` sidebar, `main` (tabs; splitting is in the
backlog), `right` sidebar, `bottom` panel, `statusbar`. The arrangement is plain data in `layout.json`
(`apps/desktop/src/shared/layout.ts`, reference: `docs/reference/layout.md`):

```jsonc
{
  "left":   { "views": ["jig.projects", "jig.sessions"], "size": 280, "collapsed": false },
  "right":  { "views": ["addon.repos.overview"], "size": 320, "collapsed": true },
  "bottom": { "views": ["jig.terminal"], "size": 240, "collapsed": true },
  "main":   { "tabs": [ { "type": "jig.chat", "params": { "sessionId": "…" } } ] }
}
```

**No native menu bar.** The window has no OS title bar and no Electron menu bar on Windows/Linux:
the top bar is Jig's own, with Jig's own menus (Tools, project switcher, settings). macOS keeps a
minimal application menu so Cmd+C/V/Q and window shortcuts keep working (D-023).

Core features and add-ons contribute **views** with stable ids; the layout decides where they appear.
Moving, hiding or resizing a view is a layout change — which is also what the builder does for
"level 1" requests ("move pipelines to the right"). Every layout change is a pure function in
`shared/layout.ts`, shared by the renderer and the host.

**Renderer structure.** `renderer/workbench/` is the shell: a **registry** (views, tab types, Tools-menu
actions, status-bar items — a store, so add-ons can register and unregister at runtime), the layout
store, the top bar, regions, main-area tabs, status bar, the **Tools menu** (every action, grouped,
with a filter box — a menu, not a command line), toasts and keyboard shortcuts (every shortcut is
also an action in a menu). `renderer/features/<feature>/` registers its views, tabs and actions
(`features/index.ts`). Views, tabs and status items each render inside an error boundary. Tab bodies
stay mounted once opened, so a chat or terminal keeps its state while you switch tabs.

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
| Menus & actions | `tools.action` (Tools menu), `context.file`, `context.project`, `context.repo`, `context.message`, `chat.toolbar` |
| Chat | `chat.toolRenderer` (custom card for a tool result), `prompt` (a reusable prompt shown as a button) |
| Background | `watcher` (host-side job on an interval or schedule), notifications/badges (API) |
| Other | `settings.page`, `theme` |

### 8.2 Runtime

- **UI part.** The host bundles `ui.tsx` with esbuild into an ES module, with `react`,
  `react/jsx-runtime`, `react-dom`, `lucide-react`, `@jig/sdk` and `@jig/sdk/ui` mapped to the app's
  own instances through `globalThis.__jigShared` (so add-ons share React and the design system). The
  host also generates the add-on's Tailwind CSS at runtime from its source with Jig's token theme
  (`main/addons/css.ts`). The renderer loads both through the `jig-addon://` protocol and renders each
  contribution inside an error boundary. A crashing contribution shows an inline error with
  "Turn off" / "Fix with AI" — never a broken app.
- **Host part.** `host.ts` is bundled to a Node module and runs in an Electron `utilityProcess` per
  add-on, talking to the host over a message port. It receives a host API (`exec`, `git`, `fs`, `http`,
  `storage`, `notify`, `emit`, `schedule`, `projects`) limited by the manifest's `permissions`.
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

Entry points (all menus, no commands): **Tools → Build something…**, `⋯ → Change this with AI` on any
add-on contribution, **Build it** on a suggestion, and the `jig_request_build` tool from any chat.

A **build job** runs a dedicated Claude Code session with Jig's builder instructions and a builder
MCP server. It follows the **levels** strictly, lightest first:

1. **Layout / settings** — staged changes to `layout.json` / `config.json`.
2. **Add-on** — first it **reads the catalog of existing add-ons** (manifests + READMEs) and decides
   whether to **change an existing add-on** (preferred when it is a natural fit) or create a new one.
   Work happens in a git worktree of `~/.jig/addons` under `~/.jig/work/`.
3. **App source** — only when 1 and 2 cannot do it (_planned_, see below).

Before anything reaches the user, the host validates: manifest schema, bundling, design-token check,
and a smoke load. Failures go back to the builder session to fix (bounded retries). Then the user sees
a **preview** (the add-on loaded from the worktree, marked "Preview") and chooses **Accept** (merge →
commit in `~/.jig/addons`, add-on goes live) or **Discard** (worktree deleted). Progress is shown as a
card in the chat that asked, and in the Builds view.

**Level 3 (_planned_).** Jig knows where its own source repo is. The builder works in a git worktree
of it, runs the repo's checks, launches the changed app as a **separate preview instance** (with a
copy of the state directory), and on Accept merges, rebuilds and restarts through a small **launcher**
that keeps the previous working build and offers "start previous version" if the new one fails to
start. The launcher and the builder core are protected: the AI changes them only after an explicit
confirmation. Where it makes sense, a level-3 change adds a new slot.

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
4. **Suggest.** Suggestions wait in the inbox (Tools → Suggestions, with a badge). **Build it** starts
   the builder with the suggestion as the goal; **Not now** snoozes; **Never** blocks that pattern.
   Answers feed the next reflection.

## 11. Git (_planned_)

Jig has its own Git tab (a built-in add-on, phase 7): branches, **commit history per branch**,
working changes, and **commit detail and file diffs opened as tabs in the main window**. The host runs
the user's `git` CLI safely (argument arrays, no shell) and parses its machine-readable output. Rebase,
graph and blame are out of scope. Jig does not run VS Code extensions or embed VS Code (D-019, D-022).

## 12. Testing

- **Unit** (Vitest): pure packages and host modules (with a temp `JIG_HOME`).
- **End-to-end** (Playwright driving Electron, under Xvfb on Linux): `JIG_ENGINE=fake`, temp
  `JIG_HOME`, real UI.
- **Checks:** `npm run check` = typecheck + lint (Biome) + unit tests + design-token check.
