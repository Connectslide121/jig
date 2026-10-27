# Phase 1 — App skeleton

**Goal:** the Electron app starts, shows the React UI, and the UI talks to the host through one typed
bridge. A test harness drives the real app.

**Done when:** `npm run dev` opens a window with hot-reloading UI; `npm run build && npm start` runs the
production build; `npm run e2e` launches the app with a temp `JIG_HOME` and passes.

## Checklist

- [x] `apps/desktop/scripts/build.mjs` — esbuild for main (ESM) and preload (CJS), Vite for renderer
- [x] `apps/desktop/scripts/dev.mjs` — Vite dev server + esbuild watch + Electron restart on main changes
- [x] Secure `BrowserWindow` (contextIsolation, sandbox, no nodeIntegration, CSP)
- [x] Typed IPC contract in `src/shared/ipc.ts` (`HostApi` methods, `HostEvents` topics)
- [x] Main-process router: registers handlers, validates method names, maps errors to `{code,message}`
- [x] Preload: `window.jig.call` / `window.jig.on`
- [x] Renderer hooks: `useHost`, `useHostEvent`
- [x] State directory module (`JIG_HOME`, atomic JSON read/write, defaults)
- [x] Config module (`config.json` with schema + defaults)
- [x] Host logging to `~/.jig/logs/`
- [x] Window state (size/position) remembered
- [x] Playwright Electron harness (`e2e/`), first smoke test
- [x] Docs: `docs/guides/developing.md`, `docs/guides/testing.md`, `docs/reference/ipc.md`, `docs/reference/state.md`

## Notes

- Error codes don't survive Electron's context bridge on rejected promises, so the preload exposes
  `invoke()` returning a `{ ok, value | error }` envelope and the renderer's `call()` unwraps it.
- The bundled UI is served from a privileged `jig-app://` scheme so the host can attach a CSP header.
- A second Jig launched with the same `JIG_HOME` focuses the first window (single-instance lock).
