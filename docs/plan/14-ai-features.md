# Phase 14 — AI features and previews

**Goal:** make Jig the best place to work with Claude Code: features built on what Claude Code can do
(suggestions, checkpoints, forks, parallel attempts), Claude where it saves time (commit messages,
checks, tours, standups, failed scripts), and previews for the files Claude writes (D-083…D-088).

## Checklist

- [x] Next-message suggestions, restore files to before a message, fork chat
- [x] `ctx.ai.ask` / `ctx.ai.tour` for add-ons (permission `ai`); Git: Write the commit message, Check
      before committing, Walk me through the changes, Explain / Review with Claude
- [x] Ask Claude about a failed script; desktop notifications
- [x] File previews: Markdown + Mermaid, HTML, PDF, CSV/Excel, JSON, notebooks, media, Office, code
- [x] Try several ways (parallel attempts in worktrees, judged by Claude)
- [x] Guided change tours; turn a chat into a tool; write my standup
- [x] Claude's terminals (`jig_terminal_*`) and images from tools in the chat
- [x] Browser: an offscreen page Claude drives (`jig_browser_*`), live view you can take
      over, console, screenshots in the chat (D-090)
- [x] Tests: unit for every parser and git operation, e2e per feature (`e2e/ai.spec.ts`,
      `e2e/preview.spec.ts`, `e2e/browser.spec.ts`)

- [x] Rename the visible browser feature to Browser across its view, menus, settings and About (D-216).

- [x] Native user Browser tab in the main panel, separate from Claude’s offscreen browser (D-225).

- [x] Claude's browser never hangs a chat: time limits on loads, page scripts, screenshots and every
      tool call; dialogs answer themselves; a crashed or stuck page is recreated; Stop abandons a running
      call; slow calls, timeouts, crashes and dialogs in main.log (D-319, `e2e/browser-hangs.spec.ts`)

- [x] Claude's browser has one page per chat (refs, console, network and size per page; closed with the
      chat, after 15 min idle, at most 4 open), shared logins by default, and one tab per page in the
      view (D-320, `e2e/browser-pages.spec.ts`)

- [x] Top-right globe Browser icon; Claude’s browser uses MonitorCog and has page interaction for sign-ins, read-only navigation and a hint/link to the user Browser (D-226).

- [x] Shared image zoom controls, presets and Ctrl/Cmd + scroll in image tabs, previews and Git comparisons (D-227).

- [x] ChatGPT as a second provider for one-shot AI calls through OpenAI's Codex CLI: Get started row
  with Codex's own sign-in in a private terminal, `oneShot(provider, …)`, model list per provider
  (D-294; `main/providers/`, unit tests in `codex.test.ts` and `setup/checks.test.ts`, e2e in
  `e2e/setup.spec.ts`).

- [x] Settings → AI features: provider and model per one-shot feature, ChatGPT disabled until signed
  in; JSON answers checked with a clear error (D-297; `shared/aiFeatures.ts`, `featureOneShot`, unit
  tests in `aiFeatures.test.ts`, `tour.test.ts`, `judge.test.ts`, e2e in `e2e/ai.spec.ts`).

- [x] Codex chats A: room for a second chat engine without changing behaviour: `getEngine(provider)`,
  `Engine.provider` / `capabilities` (`ENGINE_CAPABILITIES`), `SessionMeta.provider`,
  `engine.provider` with a project override, the fake engine as Codex (D-309; unit tests in
  `engine/index.test.ts`, `sessions/manager.test.ts`).
- [x] ChatGPT model families (Sol, Terra, Luna) resolved to their newest version at call time; family
  pickers in Settings → AI features (D-310; unit tests in `shared/providers.test.ts`,
  `aiFeatures.test.ts`, e2e in `e2e/ai.spec.ts`).
- [x] Codex chats B: `CodexEngine` over `codex app-server` (thread start/resume, turns, steer,
  interrupt, per-turn model/effort/mode, approvals as permission cards), `codexNormalize.ts` onto
  Claude's cards, protocol types generated from Codex 0.166.0, personal instructions from CLAUDE.md
  (D-311, D-312; unit tests in `codexNormalize.test.ts` with recorded fixtures,
  `codexInstructions.test.ts`, `engine/index.test.ts`).
- [x] Codex chats C: Jig's tools in an engine-neutral registry (`ChatTool`, `toolServers`), served to
  Codex chats by a local MCP server per chat (127.0.0.1, random token, read-only tools unasked, MCP
  approvals as permission cards), the project's approved `.mcp.json` servers passed to Codex, the
  fake engine's `call <tool> over mcp` (D-313; unit tests in `localMcp.test.ts`, `codexMcp.test.ts`,
  `projectMcp.test.ts`, `fakeMcp.test.ts`, `jigTools.test.ts`, `codexNormalize.test.ts`; e2e in
  `codex-tools.spec.ts`).
- [x] Codex chats D: the provider picker beside the model picker (`sessions.setProvider`, until the
  first message), provider-aware model/effort pickers, Codex chats without Plan only, rewind, fork
  and suggestions, provider marks in the chat header and the Chats list, Settings → Chats (default
  provider, a group per provider with `engine.codexModel`/`codexEffort`/`codexInstructions`/
  `codexAllowApiKey`), the project's "Chats run on", Codex chats refreshing the ChatGPT meter (D-314;
  unit tests in `sessions/manager.test.ts`, `composerInput.test.ts`; e2e in `chat-provider.spec.ts`).
- [x] Codex chats E: Plan only through Jig's `exit_plan` (read-only sandbox, a plan-only instruction
  per turn, Jig starting the next turn in the approved mode), questions through `ask_user`, both on
  the existing cards; saved Codex threads in Open a saved chat (`thread/list`, `thread/read`,
  continued as a copy with `thread/fork`); Claude Code's skills as extra skill roots
  (`engine.codexSkills`); a next-message one-shot (AI feature `chatSuggestions`); Ask before changes
  on `untrusted` approvals; the capability flags on; fake-engine coverage (D-315).

## Later

- Browser: several tabs, recording a session as a GIF, network requests in the console pane.
- Tours of a commit or a branch (not only uncommitted changes).
- Attempts that start from uncommitted work (a stash applied in each worktree).
