# Phase 6 — Add-on system

**Goal:** the slots and the runtime that the builder (phase 8) writes against, proven by porting the
user's three plugins (phase 7).

**Done when:** an add-on folder with `addon.json` + `ui.tsx` (+ `host.ts`) loads live into the slots it
declares, reloads on save, can be switched off, and a crash in it never breaks the app.

## Checklist

### SDK (`packages/sdk`)
- [ ] Slot ids and contribution types (`SLOTS`)
- [ ] Manifest schema (zod) + JSON schema for editors
- [ ] UI context types (`AddonUiContext`) and host API types (`AddonHostApi`)
- [ ] Permission names (`exec`, `exec:<cmd>`, `fs:read`, `fs:write`, `net`, `terminal`, `chat`)

### Host
- [ ] Add-on discovery (built-in `addons/` + `~/.jig/addons/`), validation, enable/disable state
- [ ] `~/.jig/addons` initialised as a git repo; every accepted change is a commit
- [ ] UI bundling with esbuild (shared React / SDK via import map), cache by content hash
- [ ] `jig-addon://` protocol to serve bundles
- [ ] Host part in a `utilityProcess` per add-on, RPC over MessagePort, permission-checked host API
- [ ] File watcher → rebuild → `addons:changed` event
- [ ] Add-on storage (per add-on JSON)

### Renderer
- [ ] Contribution registry fed by loaded add-ons
- [ ] Slot renderers for every slot in the table in architecture §8.1
- [ ] Error boundary per contribution with "Disable" / "Fix with AI"
- [ ] Shared UI kit exported to add-ons (`@jig/sdk/ui`: Button, Card, List, Badge, Spinner, Empty, …)
- [ ] Settings → Add-ons: list, enable/disable, open folder, history (git log), roll back

### Docs
- [ ] `docs/reference/slots.md`, `docs/reference/addon-api.md`, `docs/guides/writing-addons.md`
