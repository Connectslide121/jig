# Phase 1 — App skeleton

**Goal:** the Electron app starts, shows the React UI, and the UI talks to the host through one typed
bridge. A test harness drives the real app.

**Done when:** `npm run dev` opens a window with hot-reloading UI; `npm run build && npm start` runs the
production build; `npm run e2e` launches the app with a temp `JIG_HOME` and passes.

## Checklist

- [ ] `apps/desktop/scripts/build.mjs` — esbuild for main (ESM) and preload (CJS), Vite for renderer
- [ ] `apps/desktop/scripts/dev.mjs` — Vite dev server + esbuild watch + Electron restart on main changes
- [ ] Secure `BrowserWindow` (contextIsolation, sandbox, no nodeIntegration, CSP)
- [ ] Typed IPC contract in `src/shared/ipc.ts` (`HostApi` methods, `HostEvents` topics)
- [ ] Main-process router: registers handlers, validates method names, maps errors to `{code,message}`
- [ ] Preload: `window.jig.call` / `window.jig.on`
- [ ] Renderer hooks: `useHost`, `useHostEvent`
- [ ] State directory module (`JIG_HOME`, atomic JSON read/write, defaults)
- [ ] Config module (`config.json` with schema + defaults)
- [ ] Host logging to `~/.jig/logs/`
- [ ] Window state (size/position) remembered
- [ ] Playwright Electron harness (`e2e/`), first smoke test
- [ ] Docs: `docs/guides/developing.md`, `docs/guides/testing.md`, `docs/reference/ipc.md`, `docs/reference/state.md`
