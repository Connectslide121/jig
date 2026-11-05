# Agent instructions — Jig

Jig is a personal desktop agentic workbench around Claude Code (Electron + React + TypeScript) that can
build its own tools (as layout/settings changes and add-ons — it never edits its own source, D-074).
These instructions apply to every coding agent working in this repository.

**Working on Jig means working on its source.** When Jon is working on the Jig project, change this
repository's code directly (add-ons, host, renderer, docs), never route it through the in-app builder or
`jig_request_build`, even from a chat running inside Jig. The "never edits its own source" rule is about
the in-app builder only (D-074, D-168).

Claude Code reads `CLAUDE.md`, which only imports this file. Put rules here, never in `CLAUDE.md`.
Folder-specific rules go in an `AGENTS.md` inside that folder (with a `CLAUDE.md` next to it that
contains only `@AGENTS.md`).

## Start here

1. `docs/README.md` — index of all documentation.
2. `docs/vision.md` — principles. They are binding.
3. `docs/architecture.md` — how it is built.
4. `docs/plan/README.md` — what is done and what is next.
5. `docs/status.md` — what works today, and "Continue here" for the next steps.
6. `docs/reference/reference-repos.md` — code to read for each part (clone JetBrains' ThinkRail
   beside this repo: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`).

## Keep the docs true — part of every change

A change is not finished until the code, the plan, the docs and the decision log agree:

- **Plan:** tick the checklist item in `docs/plan/NN-*.md` and the phase status in
  `docs/plan/README.md`. Add items you discover; move dropped ones to `99-backlog.md` with a reason.
- **Architecture/reference:** if you change a boundary, contract, slot, IPC method, state file or
  setting, update `docs/architecture.md` and the matching `docs/reference/*.md`.
- **Decisions:** any choice future work depends on goes into `docs/decisions.md`, saying who decided
  and why. Choices made without the user are marked **"Claude, on my own"**. **Never pick the number
  yourself:** other chats add decisions at the same time. Run `npm run decision -- "Title"` the moment
  you need one: it appends `## D-xxx: Title` to the log and prints the number, which is yours; fill in
  the entry there and use that number in code and docs (D-361). `npm run verify` fails on a number
  used twice.
- **Status:** if something user-visible changed, update `docs/status.md` (what works, how to try it,
  known gaps, what needs testing on a real machine).
- **These instructions:** new conventions or "never do X" rules go here, in the same commit.

## Commands

```bash
npm install            # once
npm run dev            # Electron + Vite dev server with hot reload
npm run build          # production build into apps/desktop/dist
npm start              # run the production build
npm run verify         # typecheck + lint + design-token check + no duplicate decision numbers (no tests) — run before every commit
npm run decision -- "Title"   # reserve the next D-xxx: appends its heading to docs/decisions.md and prints the number (D-361)
npm run check          # verify + unit tests — when releasing
npm run e2e:changed    # the e2e specs a change needs since the last passing e2e run (else uncommitted only) — before committing a change to the app or a spec (D-331, D-357); -- --since origin/main for the old base, -- --list to only print the choice
npm run e2e            # the whole e2e suite in parallel (~4-5 min): only when releasing (Linux: xvfb-run); a full pass on a clean checkout is recorded, and the release skips the suite when only the version changed since
npm run dist           # package with electron-builder for this OS (Windows installer: run it on Windows)
npm run relay:build    # the Teams relay's deployment package: relay/teams/dist/relay.zip (D-370; run by dist)
JIG_ENGINE=fake npm run dev   # use the scripted fake engine instead of Claude Code
JIG_HOME=/tmp/x npm run dev   # use a throwaway state directory
JIG_SCREENSHOTS=1 xvfb-run -a npx playwright test e2e/screenshots.spec.ts   # regenerate screenshots (after a build)
```

Claude Code chats opened in this repository load `.claude/settings.json`: after Edit/Write and
Bash/PowerShell tools, `scripts/format-after-tool.mjs` runs the installed Biome with safe fixes.
Shell tools sweep modified/untracked files in this checkout. Keep script-written text LF on Windows
(Python: `open(..., newline="\n")`); the hook is a fallback, not a replacement for `npm run verify`.
See `docs/guides/developing.md` for scope and activation.

What the fake engine does for which message is listed in `docs/guides/testing.md` → The fake engine.

## Architecture rules

- **Main process owns every side effect** (files, git, processes, sessions, add-on host code). The
  renderer never touches the system; it calls the host through `window.jig` only.
- **One typed IPC contract**: add host methods and events in `apps/desktop/src/shared/ipc.ts` first,
  then implement the handler in `apps/desktop/src/main/` and document it in `docs/reference/ipc.md`.
  A method that takes a path, command, URL, prompt or terminal input also gets a schema in
  `main/ipc/validate.ts` (D-089).
- **Pure logic goes in `packages/*`** (no Electron imports) so it can be unit-tested.
- **State lives in `JIG_HOME`** (`~/.jig`); write files atomically through the state module, never
  with ad-hoc `fs.writeFile` on state files.
- **Two chat engines, Claude the default (D-309).** Chats run on Claude Code or, optionally, on
  OpenAI's Codex (signed in with ChatGPT), behind the one `Engine` interface (`getEngine(provider)`).
  A chat keeps its provider (`SessionMeta.provider`; missing = Claude) until it is handed over to the
  other one, after a plan limit (D-338) or by you between turns (D-339, always through the handover
  dialog): `continueWith` in the session manager, a divider in the transcript, a handoff built from
  the transcript without AI; never two providers in one turn.
  Everything else agentic (the builder, attempts, worktree chats, routines, artifacts, Claude's browser) stays on
  Claude Code. Never add an agent runtime of Jig's own (each engine drives an official CLI), never call
  the Anthropic or OpenAI API directly, never assemble Claude's system prompt yourself (only `append`
  to the `claude_code` preset). A chat feature a provider lacks is a flag in `ENGINE_CAPABILITIES`
  (`shared/engine.ts`) and is hidden, not shown dead, for that provider. **OpenAI's Codex CLI** is also
  a provider for non-chat, text-in/text-out AI calls, through `main/providers/`
  (`oneShot(provider, ...)`): no tools, read-only sandbox. A new one-shot AI feature gets a row
  in `shared/aiFeatures.ts` and calls `featureOneShot`, so the user picks its provider and model in
  Settings → AI features (D-297).
- **Follow Claude Code, don't reimplement it.**
  - New Claude Code behaviour reaches the UI through `main/engine/normalize.ts`, which turns SDK
    messages into `EngineEvent`s. Unknown messages are ignored, never a crash.
  - New Codex behaviour reaches the UI through `main/engine/codexNormalize.ts`, onto the same cards
    (D-311). After updating Codex, run `npm run codex:protocol` to regenerate the protocol types in
    `engine/codex-protocol/`; never edit them by hand.
  - Lists Claude Code owns (commands, skills, models, MCP servers) come from the running Claude Code,
    not hard-coded lists.
  - The chat should keep matching Claude Code's terminal (`docs/reference/chat.md`).
- **Jig's tools for Claude and Codex** are registered with `registerJigTools` on the `jig` MCP server.
  - They are engine-neutral (`ChatTool`, D-313): never import the Agent SDK's `tool()` /
    `createSdkMcpServer` outside `engine/sdkMcp.ts`. Codex chats get the same tools, same names, from
    the chat's local MCP server (127.0.0.1, its own token, never in Codex's environment).
  - Mark tools that only read with `readOnly`, so they run without a prompt.
  - A tool may return images (`ToolOutput`); they show in the chat.
  - Tell Claude when to use a tool in `jigContext` (`main/engine/jigTools.ts`).
  - Give the fake engine a way to call new tools, so e2e tests cover them.
- **Claude Code's cloud features** (routines, artifacts) are reached only through Claude Code's own
  tools: in chats, or with `callClaudeTool` (a guarded single-tool call, D-092). Never call claude.ai
  APIs or load claude.ai inside Jig.
- **Jig's windows:** use `appWindows()` (`main/appWindows.ts`), never `BrowserWindow.getAllWindows()`,
  for anything meaning "Jig's windows" (events, focus, notifications, quitting). Hidden helper windows
  (Claude's browser) are marked with `markHelperWindow`. Show or focus a window with
  `revealWindow`/`focusJig`, and open links, files and folders with `openExternal`/`openPath`/
  `showInFolder` (same file): they do nothing while Jig runs hidden (`JIG_HIDDEN`, the e2e tests), so
  tests never take over the user's screen. A hidden Jig shows its workbench window only through
  `showUnseen` (transparent, off-screen, unfocusable), so it draws at full speed (D-358).
- **Never read, copy, store, log or forward Claude, Codex or ChatGPT credentials or tokens.** No login
  UI: sign-in is the official CLI's own flow in a private terminal (`claude auth login`, `codex
  login`). Keep the default that strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from session
  environments, and `OPENAI_API_KEY` / `CODEX_API_KEY` from Codex's (`codexSessionEnv`).
- **The user's own tools and credentials** for git, GitHub, Azure, Azure DevOps (`git`, `gh`, `az`).
  Jig does not copy those tools' credentials. The Microsoft meeting sign-in exception is below.
- **Teams media (D-217):** the official calling SDK runs only in the dedicated sandboxed meeting
  window. Main owns Microsoft sign-in, Graph, atomic meeting state and screen-source grants. Microsoft
  sign-in cache may persist only with OS-backed safeStorage encryption (D-232), never plaintext;
  calling credentials stay in memory and only the owned media window receives the calling token.
  Never retrieve resource keys or pass credentials to add-on code.
  Its typed host-managed data cannot be changed through generic add-on storage tools.
- **Jig on your phone (D-350, D-370)** goes through the user's own bot (`main/phone/`), one channel at
  a time behind `PhoneChannel`: Telegram, or Teams through the user's own relay (`relay/teams/`).
  Telegram's token and Teams' relay key (`https://<relay>#<key>`) are credentials: OS-encrypted
  (safeStorage) or in memory only, never in the renderer, logs, URLs or add-ons; the key travels only
  in the relay's header. The Teams bot's client secret never leaves Azure: setup hands it to the
  Function's settings through a private temp file and drops it; Jig never stores, shows or logs it.
  Setup runs only the `az` commands it listed, on Create, and never deletes Azure resources. Read
  only the paired account (private chat, or its Teams chat and threads), and mask and cut chat text
  before sending it.
- **Settings are configurable from chats too.** A new setting goes into `ConfigSchema`, the
  `SETTINGS_GUIDE` in `main/configure/tools.ts` and `docs/reference/state.md`; one that decides billing
  or runs programs also goes into `PROTECTED_SETTINGS` (D-077).
- **Learning records quietly and safely.** Activity goes through `publishActivity` (`main/activity/bus.ts`),
  which masks secrets and keeps pastes only as their kind; never record raw pasted content, file
  contents or credentials (Claude's lines are recorded as hashes). Notes Claude saves
  (`jig_note_evidence`) are masked and respect the exclusions. Captured network headers are redacted
  (`redactHeaders`). Nothing calls an AI in the background except the weekly reflection, naming a new
  chat from its first message (D-288), caption translation while you have picked a caption language
  in a meeting (D-277), transcribing a meeting with Whisper on this computer while Teams captions
  aren't available and `meetings.localTranscription` is on (D-321; local, audio never stored or
  sent), and the next-message suggestion after a ChatGPT chat's turn while suggestions are on (D-315).
- **Menus, not commands.** Every feature must be reachable from a visible menu or button. Do not add
  Jig slash commands. The chat's `/` picker shows Claude Code's own commands; the few Claude Code
  names Jig answers itself (`/model`, `/mcp`…) map to existing menus and are also in the + menu (D-091).

## Built-in skills

- The curated catalog is in `skills/`; load it as native Claude Code plugins through the SDK,
  without copying into personal/project Claude configuration. Keep source pins, licences and
  reference files. Only reviewed instruction/reference text is bundled; no upstream hooks,
  custom agents or executable helpers. Use `scripts/vendor-skills.py` only for deliberate updates.
- Global switches and project exclusions control the bundled plugins. User/project conventions
  take priority over generic skill advice. Do not turn the library into a second agent runtime.

## UI and design rules

- **UI quality comes first (hard rule, Jon).** Layout and good-looking, consistent UI are what this
  product is about; every change, however small, is designed, not just made to work. Lay a view out for
  every place it can be shown (a sidebar, the bottom panel, a tab): size grids by the container
  (`@container` with `@xl:`…), not the window. Make the whole row or card the click target instead of
  a small button in it, keep icons consistent in meaning across views, and look at the result (a
  screenshot) before calling UI work done.
- **No layout shifts, ever (hard rule).** Nothing already on screen may move when something opens, loads
  or changes: no inline expanding panels or forms under a row, no content that pops in above or between
  existing content, no spinner that swaps for a differently sized result. A form or picker that needs
  room is a modal (`Dialog`); something that loads reserves its space first (a fixed-height slot, a
  skeleton) or appears in a modal/overlay. Applies to Jig's UI and to every add-on.
- **Never steal focus from where the user types (hard rule, Jon, D-374).** Something a chat, a tool,
  the task queue, a host event or an add-on opens may show itself, but never moves the caret: code that
  focuses by itself asks `mayTakeFocus(target)` (`workbench/takeFocus.ts`) first. Only a direct action
  (a click, a shortcut) or a modal you or a real confirmation open may take the focus. In main, windows
  shown by events use `showWindowQuietly`; `revealWindow`/`focusJig` are for something the user just did.
- **Interaction motion (Jon, D-200).** Explicit extension-slot disclosures and workbench panel toggles
  may animate their requested expansion/collapse. Use shared `Collapse` and modal/menu motion (160 ms),
  honoring reduced motion. Do not animate arbitrary loading changes; forms and pickers remain modal.
- **Align everything (hard rule, Jon).** Things in a list or row line up in columns, always: a fixed
  slot per element (an empty one when it has nothing), the same position in every row, numbers and
  times right-aligned. Status marks, badges and colour swatches go at the far right edge, so they form
  one straight line however long the text is. Never let one element's width push the next one
  sideways. Check this on every row-like view you touch or build.
- **Container variants lose to plain utilities from add-on CSS.** Add-on stylesheets load after Jig's and
  repeat plain Tailwind utilities in the same layer, so `w-32 @xl:w-40` stays `w-32`. Set a property
  that changes with the container only through variants on both sides (`@max-xl:w-32 @xl:w-40`,
  `@max-xl:hidden @xl:flex`) (D-297).
- **Icons sit centred on text through the font, not per view (D-237).** Rows put icons and text on
  `items-center`; Inter's tuned metrics in `styles/inter.css` centre the capitals in the line box. Never
  nudge icons with margins or translate; when upgrading @fontsource-variable/inter, regenerate that file.
- **Tokens only.** Use the Tailwind token utilities (`bg-surface`, `text-muted`, `border-border`,
  `text-accent`, …) and the spacing/type scales. **Never** hard-code colours (`#fff`, `rgb()`, `red-500`)
  or arbitrary values (`w-[13px]`, `text-[#…]`). `npm run check:tokens` enforces this in
  `apps/desktop/src/renderer` and `addons/`.
- Reuse the base components in `apps/desktop/src/renderer/ui/` before writing new ones.
- **Loading is `<Spinner center />`:** a panel, tab or section that is loading shows one spinner,
  centered in its space; never "Loading…" text and never a spinner in a corner. **Filter and search
  fields are `SearchInput`** (the top-bar search field beside the text, × to clear), never an `Input` with an
  icon laid over it.
- **Menus go through `ui/Menu.tsx`** (`openMenu`, `openMenuAt`, `MenuButton`, `contextMenu`; add-ons
  through the SDK), never a hand-made dropdown. A submenu opens beside its parent, from its chevron,
  and never covers it (on the parent's left when there's no room on the right); the parent stays open.
- Icons are Lucide (`lucide-react`), in Jig and in add-ons (which share Jig's copy; manifests use
  kebab-case names, `<Icon name>` from `@jig/sdk/ui` for runtime names). Don't add another icon set.
- **A project is a square, a chat a dot:** show a project with `ProjectSwatch` (`features/projects/colors.tsx`,
  a rounded square in its colour), in lists, menus (`leading`) and the top bar; round dots are chats'
  status. Chats are indented under their project.
- Show files and folders with `FileIcon` (the user's file icon theme), images with `ImagePreview`, and
  make side panes resizable with `Pane` instead of fixed widths.
- Every view must look right in Jig Dark, Jig Light and an imported VS Code theme.
- **Where a view starts** (D-102, a guideline): views about the active project start on the left and
  follow it; views that cover everything start on the right. Pick `region` (`left2`/`right2`
  for the lower half of a sidebar) by that, and list new ids in `docs/reference/layout.md`. Only
  daily views start in a sidebar; ones used now and then start hidden (`hidden` / `startHidden`)
  and open from an action in the top bar menus (D-173).
- **Typed lists live in one place:** link types in `shared/links.ts` (`LINK_TYPES`: icon, label, how
  to guess it), workflow step kinds in `addons/workflows/lib/workflow.ts`, suggestion kinds in
  `shared/learning.ts`, a repository's release policy shape in `addons/releases/lib/policy.ts`. Add
  to them there, never ad hoc in a view.
- **Add-on data has a scope** (D-116): declare `storage.scope` (global, project, repo) and use
  `useStorage` / `ctx.storage` rather than putting project ids into keys by hand.
- **A repository's files are the user's.** Built-in add-ons write into a repository only on a user
  action (Release, Set up, Export as skill, Save in Preview) and say which files; `.jig/release.json`
  is meant to be committed and shared.
- **No real names in examples:** placeholders, sample data, tests and docs use neutral names (Shop,
  Contoso, Fabrikam), never Jon's projects, companies or colleagues.
- Say **chat** in user-facing text, never "session" (that's the code's word). Frequent actions go
  where you are (a button, a hover action); rare ones in ⋯ menus and Tools (D-094).
- A new user-visible feature gets a line on the "What Jig can do" page (`features/about/`); a new slot
  needs an example in `SLOT_EXAMPLES`. A headline feature also gets a line in `README.md`, which is the
  project's landing page (and a new slot a row in its slot table). When the UI changes noticeably,
  regenerate the screenshots (`docs/reference/about.md`); the README uses the same files.

## Testing rules

- Unit tests next to the code (`*.test.ts`), Vitest. Pure packages need tests for every exported
  function with logic.
- Host modules are tested with a temporary `JIG_HOME`.
- End-to-end tests in `e2e/` run the real app with `JIG_ENGINE=fake` and a temp `JIG_HOME`. A new
  fake-engine behaviour gets a row in the table in `docs/guides/testing.md`.
- Never use real Claude credentials in tests.
- **A change runs the e2e specs it affects; the whole suite runs only when releasing (Jon, D-258,
  D-331).** Write and update unit and e2e tests with each change. Before a commit run `npm run verify`
  (typecheck, lint, tokens; seconds) and, when the change touches the app or an e2e spec, `npm run
  e2e:changed` (only the specs it needs, usually under a minute; in Jig through the Tests add-on's
  `addon_tests_run`, so Jon sees it; it answers within 100 s, so call `addon_tests_wait` with the run
  id until it's done, D-359, never the shell instead). Fix what fails before committing. Docs-only
  and unit-test-only changes run nothing. The whole `npm run e2e` and `npm run check` run at release, never at other
  moments: only a run on the release's own source proves it clean. Run a single quick unit test file
  (`npx vitest run <file>`) when a pure function's logic is tricky, and anything else when Jon asks.
- A new spec gets a rule in `e2e/affected.json`. Tests run in parallel: no dependence on other tests or
  timing; keep each test short (the slowest sets the suite's time).
- **UI is still looked at before it's done:** a screenshot in Claude's browser or a quick `npm run dev`
  look, not a test run (the hard UI rules above still apply). For a view in a given state at all its
  widths (sidebar, bottom panel, tab) use `shootView` (`e2e/shots.ts`), with "hold until released"
  for something running: `docs/guides/testing.md` → "Put the UI in a state and screenshot it".
- **Scratch files go in `.tmp/`** (git-ignored, inside this repository): screenshots, throwaway
  scripts, temporary `JIG_HOME`s. Never create them at a drive root or elsewhere outside the repo;
  Claude Code asks before `rm -rf` on such paths even in "Don't ask" mode, which stops the task queue.
  **Delete the scratch files your task made when it's done** (one-off edit scripts, logs, screenshots
  nobody will look at again), before the final commit or report; keep only what the docs or Jon need.
  Give a script a name of its own (`.tmp/<task>-edit.py`), never a module's name (`types.py`,
  `json.py`): Python imports it from the script's folder instead of its own module.

## Commits

- Work directly on `main`. Do not create new branches; keep logical, validated commits on `main`.
- Small, coherent commits with a clear message (what and why), including their tests and docs.
- **Always commit (Jon).** Commit after each logical, validated change without being asked; never
  leave completed work uncommitted, and never ask whether to commit. Never push except for an explicitly
  requested Jig publication through the release skill below.
- Run `npm run verify` before committing (not the tests; they run when releasing, D-258).
- No AI attribution trailers in commit messages.

## Releasing Jig

For requests to release, ship or publish **Jig itself**, read and follow
[the shared jig-release skill](.agents/skills/jig-release/SKILL.md). In short: pick the version and write the notes into
`release/next.json`, then `npm run release` does the rest (D-245). It lives in the repository for
all agents: Codex discovers `.agents/skills/jig-release`, Claude Code (including chats inside Jig)
finds the forwarding entry under `.claude/skills/jig-release`; other agents use this link.
This is separate from the bundled app skills in `skills/` and from releasing projects inside Jig.

An explicit request to publish/release Jig authorizes the skill's release-scoped main/tag push and
GitHub release publication. This is the only exception to the normal no-push rule; never force-push
or silently include unfinished/unrelated work. A request to create the skill, explain releases,
prepare a release or build a local installer does not authorize publication. When authorized,
complete preparation, validation, packaging and publication without adding a redundant confirmation.
Tests that fail during a release are the release's to fix, within the skill's "When tests fail"
(D-331): it stops and reports only beyond those limits.

## What NOT to do

- Never give the renderer Node access (`nodeIntegration`, disabling `contextIsolation` or `sandbox`).
- Never execute anything from a VS Code extension; themes are imported as JSON only.
- Never let an add-on crash the app: every contribution renders inside an error boundary.
- Never let the in-app builder change Jig's own source code (D-074). It works only through layout,
  settings and add-ons; when no slot can do something, it proposes a new extension point for the user
  to add by hand. New features of that kind start as a slot or add-on API, not as one-off core code.
- Never skip the docs. See "Keep the docs true".
