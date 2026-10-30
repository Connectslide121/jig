# Agent instructions — Jig

Jig is a personal desktop agentic workbench around Claude Code (Electron + React + TypeScript) that can
build its own tools (as layout/settings changes and add-ons — it never edits its own source, D-074).
These instructions apply to every coding agent working in this repository.

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
- **Decisions:** any choice future work depends on goes into `docs/decisions.md` (next `D-xxx`), saying
  who decided and why. Choices made without the user are marked **"Claude, on my own"**.
- **Status:** if something user-visible changed, update `docs/status.md` (what works, how to try it,
  known gaps, what needs testing on a real machine).
- **These instructions:** new conventions or "never do X" rules go here, in the same commit.

## Commands

```bash
npm install            # once
npm run dev            # Electron + Vite dev server with hot reload
npm run build          # production build into apps/desktop/dist
npm start              # run the production build
npm run check          # typecheck + lint + unit tests + design-token check — run before every commit
npm run e2e            # build, then Playwright drives the real app (Linux needs xvfb-run)
npm run dist           # package with electron-builder for this OS (Windows installer: run it on Windows)
JIG_ENGINE=fake npm run dev   # use the scripted fake engine instead of Claude Code
JIG_HOME=/tmp/x npm run dev   # use a throwaway state directory
JIG_SCREENSHOTS=1 xvfb-run -a npx playwright test e2e/screenshots.spec.ts   # regenerate screenshots (after a build)
```

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
- **Claude Code is the only engine.** Never add another agent runtime, never call the Anthropic API
  directly for agent work, never assemble the system prompt yourself (only `append` to the
  `claude_code` preset).
- **Follow Claude Code, don't reimplement it.**
  - New Claude Code behaviour reaches the UI through `main/engine/normalize.ts`, which turns SDK
    messages into `EngineEvent`s. Unknown messages are ignored, never a crash.
  - Lists Claude Code owns (commands, skills, models, MCP servers) come from the running Claude Code,
    not hard-coded lists.
  - The chat should keep matching Claude Code's terminal (`docs/reference/chat.md`).
- **Jig's tools for Claude** are registered with `registerJigTools` on the `jig` MCP server.
  - Mark tools that only read with `readOnly`, so they run without a prompt.
  - A tool may return images (`ToolOutput`); they show in the chat.
  - Tell Claude when to use a tool in `jigContext` (`main/engine/jigTools.ts`).
  - Give the fake engine a way to call new tools, so e2e tests cover them.
- **Claude Code's cloud features** (routines, artifacts) are reached only through Claude Code's own
  tools: in chats, or with `callClaudeTool` (a guarded single-tool call, D-092). Never call claude.ai
  APIs or load claude.ai inside Jig.
- **Jig's windows:** use `appWindows()` (`main/appWindows.ts`), never `BrowserWindow.getAllWindows()`,
  for anything meaning "Jig's windows" (events, focus, notifications, quitting). Hidden helper windows
  (Claude's browser) are marked with `markHelperWindow`.
- **Never read, copy, store, log or forward Claude credentials or tokens.** No login UI. Keep the
  default that strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from session environments.
- **The user's own tools and credentials** for git, GitHub, Azure, Azure DevOps (`git`, `gh`, `az`).
  Jig stores no tokens.
- **Settings are configurable from chats too.** A new setting goes into `ConfigSchema`, the
  `SETTINGS_GUIDE` in `main/configure/tools.ts` and `docs/reference/state.md`; one that decides billing
  or runs programs also goes into `PROTECTED_SETTINGS` (D-077).
- **Learning records quietly and safely.** Activity goes through `publishActivity` (`main/activity/bus.ts`),
  which masks secrets and keeps pastes only as their kind; never record raw pasted content, file
  contents or credentials (Claude's lines are recorded as hashes). Notes Claude saves
  (`jig_note_evidence`) are masked and respect the exclusions. Captured network headers are redacted
  (`redactHeaders`). Nothing calls an AI in the background except the weekly reflection.
- **Menus, not commands.** Every feature must be reachable from a visible menu or button. Do not add
  Jig slash commands. The chat's `/` picker shows Claude Code's own commands; the few Claude Code
  names Jig answers itself (`/model`, `/mcp`…) map to existing menus and are also in the + menu (D-091).

## UI and design rules

- **No layout shifts, ever (hard rule).** Nothing already on screen may move when something opens, loads
  or changes: no inline expanding panels or forms under a row, no content that pops in above or between
  existing content, no spinner that swaps for a differently sized result. A form or picker that needs
  room is a modal (`Dialog`); something that loads reserves its space first (a fixed-height slot, a
  skeleton) or appears in a modal/overlay. Applies to Jig's UI and to every add-on.
- **Tokens only.** Use the Tailwind token utilities (`bg-surface`, `text-muted`, `border-border`,
  `text-accent`, …) and the spacing/type scales. **Never** hard-code colours (`#fff`, `rgb()`, `red-500`)
  or arbitrary values (`w-[13px]`, `text-[#…]`). `npm run check:tokens` enforces this in
  `apps/desktop/src/renderer` and `addons/`.
- Reuse the base components in `apps/desktop/src/renderer/ui/` before writing new ones.
- **Loading is `<Spinner center />`:** a panel, tab or section that is loading shows one spinner,
  centered in its space; never "Loading…" text and never a spinner in a corner. **Filter and search
  fields are `SearchInput`** (the magnifier beside the text, × to clear), never an `Input` with an
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
  follow it; views that cover everything start on the right. Pick `region` (and `under`, for a
  section below another view) by that, and list new ids in `docs/reference/layout.md`.
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

## Commits

- Small, coherent commits with a clear message (what and why), including their tests and docs.
- Run `npm run check` before committing.
- No AI attribution trailers in commit messages.

## What NOT to do

- Never give the renderer Node access (`nodeIntegration`, disabling `contextIsolation` or `sandbox`).
- Never execute anything from a VS Code extension; themes are imported as JSON only.
- Never let an add-on crash the app: every contribution renders inside an error boundary.
- Never let the in-app builder change Jig's own source code (D-074). It works only through layout,
  settings and add-ons; when no slot can do something, it proposes a new extension point for the user
  to add by hand. New features of that kind start as a slot or add-on API, not as one-off core code.
- Never skip the docs. See "Keep the docs true".
