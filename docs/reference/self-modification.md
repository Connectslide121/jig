# Self-modification reference (builder level 3)

When no layout change, setting or add-on can do what you ask, the builder may change **Jig's own
source code**. It is the last resort and always goes through a worktree, the repository's checks, a
separate preview instance and your explicit Accept.

Code: `apps/desktop/src/main/builder/appChange.ts` (the flow), `apps/desktop/src/main/selfmod/`
(worktree, commands, protected paths, snapshot/restart), `apps/launcher/launcher.mjs` (the launcher),
UI in `apps/desktop/src/renderer/features/builder/BuildTab.tsx` and `workbench/StartupBanner.tsx`.

## The flow

1. **Proposal.** A normal build decides it needs level 3 and calls `propose_app_change { reason, plan }`.
   The job becomes `kind: "app"`, `status: "needs_you"`, `app.stage: "proposed"`; the Build tab shows
   why no slot can do it and the plan. Nothing happens until you press **Let the builder change Jig's
   code** (`builds.startAppChange`).
2. **Worktree.** Jig creates `~/.jig/work/<job>-app`, a git worktree of the source repository on
   branch `jig-build/<job>`, records the base commit, and links the repository's `node_modules`
   (junctions on Windows). A new builder session (kind `builder`, *Accept edits*) runs there with the
   level-3 instructions appended to Claude Code's system prompt; Claude Code loads the repository's
   `CLAUDE.md` → `AGENTS.md` itself (project settings source).
3. **Checks.** The session has two tools on the `jig-builder` MCP server:
   - `run_checks` — runs Settings → Builder → *Check command* (`npm run check`) in the worktree. If the
     change touches `package.json`/`package-lock.json`, the links are replaced by a real
     *Install command* (`npm install`) first.
   - `finish_app_change { summary }` — commits everything (except `node_modules`), records the changed
     files and the protected ones, runs the checks again, then the *Build command* (`npm run build`).
     Failing checks go back to the builder, at most 3 rounds (then the job fails).
4. **Preview.** The job is `preview`. **Open preview instance** (`builds.openPreview`) starts Electron
   on the worktree's `apps/desktop` with `JIG_HOME` = a copy of your Jig home (`~/.jig/work/<job>-home`,
   without `work`, `cache`, `logs`, `activity`, `launcher`, `app-builds`) and `JIG_PREVIEW=<job>`; it
   shows a "Preview instance" banner. Your real data is never touched. The changed files and their
   diffs (against the base commit) are listed in the Build tab.
5. **Accept** (`builds.accept`):
   - changes in **protected paths** need `confirmProtected: true` — the UI asks in a separate,
     explicit dialog listing the files;
   - the running build is snapshotted to `~/.jig/app-builds/previous` (dist, package.json, built-in
     add-ons, links to `node_modules`);
   - the branch is merged into the repository's current branch (`--no-ff`); Jig refuses when the
     repository has uncommitted changes to tracked files;
   - install (if dependencies changed) and build in the repository;
   - `~/.jig/app-builds/last.json` records the merge commit (for Undo); the worktree, branch and home copy
     are removed;
   - Jig restarts **through the launcher** (with `JIG_NO_RESTART=1` it doesn't; the Build tab says
     "Restart Jig to use the change").
6. **Discard** kills the preview instance and removes the worktree, branch and home copy.
7. **Undo the last change to Jig** (Tools menu, and the banner after a failed start) reverts the merge
   commit as a new commit, rebuilds and restarts (`app.undoLastChange`).

## Protected paths

`apps/desktop/src/main/selfmod/protected.ts`:

- `apps/launcher/` — the launcher
- `apps/desktop/src/main/builder/` and `apps/desktop/src/main/selfmod/` — the builder core
- `apps/desktop/src/main/engine/claude.ts` — how Claude Code is started (credentials rule)
- `AGENTS.md` — the rules

The builder is told not to change them unless the request really needs it; Accept needs your explicit
confirmation when it did.

## The launcher

`apps/launcher/launcher.mjs`, plain Node, no dependencies, copied to `dist/main/launcher.mjs` by the
build. Jig starts it as Electron in Node mode (`ELECTRON_RUN_AS_NODE=1`) right before quitting:

```
launcher.mjs --electron <exe> --app <apps/desktop of the new build> --previous <previous build>
             --home <jig home> --wait-pid <old pid> [--timeout 60]
```

1. Waits for the old process to exit (≤ 30 s).
2. Starts the new build with `JIG_READY_FILE=<home>/launcher/ready-…`. Jig writes its pid into that file
   once the main window has loaded (the **ready heartbeat**).
3. No heartbeat within the timeout, or the process exits → starts the **previous** build with
   `JIG_STARTED_AFTER_FAILURE=1` (banner: "the last change didn't start", with Undo).
4. That fails too → the new build in **safe mode** (`JIG_SAFE_MODE=1`: your own add-ons stay off,
   built-ins load; banner with Undo).

It writes `<home>/launcher/status.json` (`{ result: "new" | "previous" | "safe-mode" | "failed", at }`)
and appends to `<home>/launcher/launcher.log`.

## Settings (`config.builder`)

| Key | Default | |
|---|---|---|
| `sourcePath` | `""` | Jig's source repository; empty = the repository Jig runs from (`app.getAppPath()/../..`, when it contains `AGENTS.md` and `apps/desktop`) |
| `checkCommand` | `npm run check` | must pass before you see the change |
| `buildCommand` | `npm run build` | run in the worktree and, after Accept, in the repository |
| `installCommand` | `npm install` | run when a change touches `package.json` / `package-lock.json` |

## Environment variables

| Variable | Set by | Meaning |
|---|---|---|
| `JIG_READY_FILE` | launcher | write the pid here once the window loaded |
| `JIG_STARTED_AFTER_FAILURE` | launcher | show the fallback banner |
| `JIG_SAFE_MODE` | launcher | your add-ons off |
| `JIG_PREVIEW` | preview instance | the build id; shows the preview banner |
| `JIG_NO_RESTART` | tests | Accept doesn't restart |

## Testing

`main/builder/appChange.test.ts` runs the whole flow against a throwaway git repository with trivial
check and build scripts and the scripted fake level-3 builder (`runFakeAppBuilder` in
`engine/fakeBuilder.ts`: it writes `docs/builder-notes.md`, and touches the launcher when the goal says
"launcher"). `apps/launcher/launcher.test.ts` tests the launcher with Node as a fake Electron;
`e2e/selfmod.spec.ts` drives the UI, the banners and the launcher with the real Electron.
