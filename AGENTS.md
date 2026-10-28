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
```

## Architecture rules

- **Main process owns every side effect** (files, git, processes, sessions, add-on host code). The
  renderer never touches the system; it calls the host through `window.jig` only.
- **One typed IPC contract**: add host methods and events in `apps/desktop/src/shared/ipc.ts` first,
  then implement the handler in `apps/desktop/src/main/` and document it in `docs/reference/ipc.md`.
- **Pure logic goes in `packages/*`** (no Electron imports) so it can be unit-tested.
- **State lives in `JIG_HOME`** (`~/.jig`); write files atomically through the state module, never
  with ad-hoc `fs.writeFile` on state files.
- **Claude Code is the only engine.** Never add another agent runtime, never call the Anthropic API
  directly for agent work, never assemble the system prompt yourself (only `append` to the
  `claude_code` preset).
- **Never read, copy, store, log or forward Claude credentials or tokens.** No login UI. Keep the
  default that strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from session environments.
- **The user's own tools and credentials** for git, GitHub, Azure, Azure DevOps (`git`, `gh`, `az`).
  Jig stores no tokens.
- **Settings are configurable from chats too.** A new setting goes into `ConfigSchema`, the
  `SETTINGS_GUIDE` in `main/configure/tools.ts` and `docs/reference/state.md`; one that decides billing
  or runs programs also goes into `PROTECTED_SETTINGS` (D-077).
- **Menus, not commands.** Every feature must be reachable from a visible menu or button. Do not add
  Jig slash commands.

## UI and design rules

- **Tokens only.** Use the Tailwind token utilities (`bg-surface`, `text-muted`, `border-border`,
  `text-accent`, …) and the spacing/type scales. **Never** hard-code colours (`#fff`, `rgb()`, `red-500`)
  or arbitrary values (`w-[13px]`, `text-[#…]`). `npm run check:tokens` enforces this in
  `apps/desktop/src/renderer` and `addons/`.
- Reuse the base components in `apps/desktop/src/renderer/ui/` before writing new ones.
- Show files and folders with `FileIcon` (the user's file icon theme), images with `ImagePreview`, and
  make side panes resizable with `Pane` instead of fixed widths.
- Every view must look right in Jig Dark, Jig Light and an imported VS Code theme.

## Testing rules

- Unit tests next to the code (`*.test.ts`), Vitest. Pure packages need tests for every exported
  function with logic.
- Host modules are tested with a temporary `JIG_HOME`.
- End-to-end tests in `e2e/` run the real app with `JIG_ENGINE=fake` and a temp `JIG_HOME`.
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
