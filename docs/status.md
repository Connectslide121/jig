# Status

_Last updated: 2026-10-27, end of the first session (planning + phase 1)._

## Continue here (next session)

1. Clone Jig and install: `npm install` (npm reads `.npmrc`, which sets `legacy-peer-deps`).
2. Clone ThinkRail beside it for reference: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`.
   Which parts to read for which phase: `docs/reference/reference-repos.md`.
3. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`.
4. Continue the plan at **phase 2** (`docs/plan/02-design-system-themes.md`). The theme package is half
   done (see below).
5. Run `npm run check` before every commit; tick plan items as they land.

## What works today

- **Phase 0 (done):** docs, plan, decision log, agent instructions, tooling.
- **Phase 1 (done):** the Electron app starts and shows a placeholder screen (version + engine).
  - `npm run dev`: hot-reloading UI; main/preload changes restart Electron.
  - `npm run build && npm start`: production build served from `jig-app://` with a CSP.
  - Typed host bridge (`window.jig` → `call()` in the renderer), config in `~/.jig/config.json`,
    window size/position remembered, host log in `~/.jig/logs/main.log`.
  - `npm run check` passes; `npm run e2e` runs 3 Playwright tests against the real app.
- **Phase 2 (started, untested):** `packages/themes` has the colour utilities, the theme model,
  Jig Dark and Jig Light, and the VS Code theme mapper (`vscode.ts`: JSONC, `include` chains, key
  fallbacks, contrast pass, terminal colours, token colours). It **typechecks and lints but has no unit
  tests yet and isn't wired into the app.** The design tokens (`apps/desktop/src/renderer/styles/tokens.css`)
  and Tailwind setup are in place.

## How to try it

```bash
npm install
npm run dev          # opens the window (placeholder screen for now)
```

## Needs testing on your machine

Things the cloud build environment couldn't verify:

- `npm install` on Windows (Electron download, `@lydell/node-pty` prebuilt binary, the Agent SDK's
  `win32-x64` package).
- The window's title-bar overlay (Windows window controls drawn over Jig's own top bar).
- Everything involving real Claude Code (phase 4 onwards).

## Known gaps / notes

- In the cloud container Electron's binary download fails through the proxy; it was installed by
  hand. On a normal machine `npm install` downloads it.
- The native Electron menu bar is not removed yet (planned in phase 3, D-023).
- `docs/plan/01-app-skeleton.md` lists the bridge as `window.jig.invoke` + renderer `call()` (the
  envelope design); see its notes.
