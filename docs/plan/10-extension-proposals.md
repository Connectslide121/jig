# Phase 10 — When no slot can do it: extension proposals (self-editing dropped)

**Goal:** a request that no layout change, setting or add-on can satisfy ends with a clear proposal for
the missing extension point, which you add to Jig's source yourself (D-074).

**Done when:** the builder recognises such requests, proposes the smallest new slot or API, and the
build shows the proposal with a way to copy it.

## Checklist

- [x] Builder tool `propose_extension_point { reason, proposal }` and instructions ("you can't change
      Jig's code")
- [x] Build tab: the proposal (why, the slot, how the request would then be built) and **Copy proposal**
- [x] Launcher with ready heartbeat, fallback to the previous build and safe mode — kept for updates
      from source (phase 11)
- [x] Docs: builder reference, architecture §9, decisions D-074

## Notes

- First built as "builder level 3": the builder changed Jig's source in a worktree, ran the checks,
  opened a preview instance and merged on Accept. Jon dropped it (D-074): every change meant a rebuild
  and a personal fork drifting from upstream. See `99-backlog.md`.
