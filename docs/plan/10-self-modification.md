# Phase 10 — Builder level 3 (Jig changes its own source)

**Goal:** the last resort — when no slot can do it, the builder changes Jig's source, safely.

**Done when:** a level-3 build runs in a worktree of Jig's repo, passes the checks, opens as a separate
preview instance, and Accept merges, rebuilds and restarts with automatic fallback to the previous
build if the new one fails to start.

## Checklist

- [ ] Setting: path to Jig's source repo (default: the repo Jig runs from in dev)
- [ ] Launcher (`apps/launcher` or script): keeps `current` and `previous` builds, detects failed start
      (no "ready" heartbeat within N s), offers/starts the previous build, safe mode (add-ons off)
- [ ] Builder level 3: worktree of the app repo, `AGENTS.md` loaded, runs `npm run check`
- [ ] Preview instance: launch the worktree build with a copy of `JIG_HOME`
- [ ] Accept → merge to the user's branch, build, restart via launcher; Discard → remove worktree
- [ ] Protected paths (launcher, builder core) require explicit confirmation
- [ ] When reasonable, the change adds a new slot (builder instruction)
- [ ] Docs: `docs/reference/self-modification.md`
