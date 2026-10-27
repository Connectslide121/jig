# Phase 6 — Add-on system

**Goal:** the slots and the runtime that the builder (phase 8) writes against, proven by porting the
user's three plugins (phase 7).

**Done when:** an add-on folder with `addon.json` + `ui.tsx` (+ `host.ts`) loads live into the slots it
declares, reloads on save, can be switched off, and a crash in it never breaks the app.

## Checklist

### SDK (`packages/sdk`)
- [x] Slot ids and contribution types (`SLOTS`)
- [x] Manifest schema (zod) + JSON schema for editors
- [x] UI context types (`AddonUiContext`) and host API types (`AddonHostApi`)
- [x] Permission names (`exec`, `exec:<cmd>`, `fs:read`, `fs:write`, `net`, `terminal`, `chat`)

### Host
- [x] Add-on discovery (built-in `addons/` + `~/.jig/addons/`), validation, enable/disable state
- [x] `~/.jig/addons` initialised as a git repo; every accepted change is a commit
- [x] UI bundling with esbuild (shared React / SDK via import map), cache by content hash
- [x] `jig-addon://` protocol to serve bundles
- [x] Host part in a `utilityProcess` per add-on, RPC over MessagePort, permission-checked host API
- [x] File watcher → rebuild → `addons:changed` event
- [x] Add-on storage (per add-on JSON)

### Renderer
- [x] Contribution registry fed by loaded add-ons
- [x] Slot renderers for every slot in the table in architecture §8.1
- [x] Error boundary per contribution with "Turn off" / "Fix with AI" (the AI button appears once the builder exists, phase 8)
- [x] Shared UI kit exported to add-ons (`@jig/sdk/ui`: Button, Card, List, Badge, Spinner, Empty, …)
- [x] Settings → Add-ons: list, enable/disable, open folder, history (git log), roll back

### Docs
- [x] `docs/reference/slots.md`, `docs/reference/addon-api.md`, `docs/guides/writing-addons.md`

## Notes

- Add-on Tailwind CSS is generated at runtime from the add-on's source with Jig's token theme (D-042).
- Permissions are shown and enforced by the host API; host code is trusted code you accepted (D-044).
- `context.repo` / `context.file` entries appear where add-ons show repos and files (phase 7) via
  `ctx.menu(items, event, target)`.
