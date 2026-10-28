# Phase 10 — Builder level 3 (Jig changes its own source)

**Goal:** the last resort — when no slot can do it, the builder changes Jig's source, safely.

**Done when:** a level-3 build runs in a worktree of Jig's repo, passes the checks, opens as a separate
preview instance, and Accept merges, rebuilds and restarts with automatic fallback to the previous
build if the new one fails to start.

## Checklist

- [x] Setting: path to Jig's source repo (default: the repo Jig runs from in dev)
- [x] Launcher (`apps/launcher` or script): keeps `current` and `previous` builds, detects failed start
      (no "ready" heartbeat within N s), offers/starts the previous build, safe mode (add-ons off)
- [x] Builder level 3: worktree of the app repo, `AGENTS.md` loaded, runs `npm run check`
- [x] Preview instance: launch the worktree build with a copy of `JIG_HOME`
- [x] Accept → merge to the user's branch, build, restart via launcher; Discard → remove worktree
- [x] Protected paths (launcher, builder core) require explicit confirmation
- [x] When reasonable, the change adds a new slot (builder instruction)
- [x] Docs: `docs/reference/self-modification.md`

## Notes

- Level 3 is a stage of a normal build job (`job.app`), started from the proposal with an explicit button
  (D-060). The worktree links the repository's `node_modules` unless dependencies change (D-061).
- Safe mode switches off only your own add-ons; built-ins are part of Jig (D-062).
- Added: "Undo the last change to Jig" (Tools menu and fallback banner), protected-path confirmation
  dialog, Settings → Builder (source repo and commands).
