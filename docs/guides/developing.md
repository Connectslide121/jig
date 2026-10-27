# Developing Jig

## Requirements

- **Node.js ≥ 22.12** (22 LTS or newer) and npm.
- **git**.
- **Claude Code signed in** with your Claude account — run `claude` once in a terminal and `/login`.
  Jig never asks for your login; it launches Claude Code, which uses its own sign-in.
- Windows: nothing else. Native pieces (terminals, esbuild, Claude Code) ship as prebuilt binaries.

## Everyday commands

```bash
npm install          # once, and after pulling dependency changes
npm run dev          # Electron + Vite dev server; UI hot-reloads, main/preload changes restart Electron
npm run check        # typecheck + lint + unit tests + design-token check (run before committing)
npm run build        # production build into apps/desktop/dist
npm start            # run the production build
npm run e2e          # build + Playwright end-to-end tests
```

Useful environment variables:

| Variable | Effect |
|---|---|
| `JIG_HOME=<dir>` | Use another state directory instead of `~/.jig` (a throwaway one for experiments) |
| `JIG_ENGINE=fake` | Use the scripted fake engine instead of Claude Code (no quota used) |
| `JIG_HIDDEN=1` | Don't show the window (used by some tests) |

PowerShell: `$env:JIG_HOME="C:\temp\jig"; npm run dev`.

## How the dev loop works

`apps/desktop/scripts/dev.mjs` starts:

1. a **Vite dev server** for the renderer (`apps/desktop/src/renderer`) — React fast refresh;
2. **esbuild in watch mode** for the main process (`src/main` → `dist/main/index.mjs`, ESM) and the
   preload (`src/preload` → `dist/preload/index.cjs`, CJS);
3. **Electron**, pointed at the dev server via `JIG_RENDERER_URL`. It restarts when main or preload
   rebuild.

The production build (`scripts/build.mjs`) does the same without watching; the bundled UI is served
from `jig-app://app/` with a strict Content Security Policy (`src/main/protocols.ts`).

## Where things go

- Host logic: `apps/desktop/src/main/<domain>/` — one folder per domain (config, projects, engine, …).
- UI: `apps/desktop/src/renderer/` — `ui/` base components, `features/<feature>/` screens.
- Shared types: `apps/desktop/src/shared/` — the IPC contract (`ipc.ts`) and settings (`config.ts`).
- Pure, testable logic: `packages/*`.

Adding a host method: declare it in `shared/ipc.ts` → `handle("x.y", …)` in main → call it with
`call("x.y", args)` in the renderer → document it in `docs/reference/ipc.md`.

## Logs

The host logs to `~/.jig/logs/main.log` (and the terminal in dev).
