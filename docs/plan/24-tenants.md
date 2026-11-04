# Phase 24 — Tenants: switch the Azure / Azure DevOps sign-in from the top bar

**Goal:** a tenant switch in the top-right corner of Jig. Everything Jig shows from Azure and Azure
DevOps (Pipelines, Boards, Releases, Workflows' pipeline steps, project links to Azure resources) and
every `az` that Claude or a terminal runs follows the signed-in user and tenant picked there (Jon,
2026-11-03).

**Done when:** you can add a second tenant (another Microsoft account, or another Entra tenant of the
same account), switch between them from the top bar, and every Azure/DevOps view reloads with that
tenant's organisations, projects, pipelines and boards, without restarting Jig.

## Today

- Every Azure and DevOps call is an `az` subprocess (`api.exec("az", …)` in add-ons,
  `main/links/index.ts` in core). The identity is whatever `az login` last left behind; Jig never shows
  or switches it (D-018). There is no account, user or tenant concept outside Meetings.
- Each add-on has its own copy of the `az()` helper and error mapping (Pipelines, Boards, Links).
- Org and project lists are cached in memory for an hour, per add-on, not keyed by identity.
- Add-ons are not told about anything identity-related (`JIG_EVENTS` has no such event).

## Design (Claude, on my own; recorded as D-282 in session 1)

- **A tenant is one `az` sign-in in its own folder.** Jig keeps one Azure CLI config folder per tenant
  under `~/.jig/azure/<tenantKey>/` and runs `az` with `AZURE_CONFIG_DIR` pointing at it. The Azure CLI
  stores and refreshes its own tokens there; Jig never reads, copies or logs them (keeps D-018 and the
  "user's own tools and credentials" rule). Adding a tenant runs
  `az login --tenant <id-or-domain> --allow-no-subscriptions` in that folder (system browser).
- **"Your az login" is always the first entry** and means no override: today's behaviour, no
  migration. Nothing changes for someone who never adds a tenant.
- **What we keep per tenant:** key, label (editable), signed-in user (`az account show` → `user.name`),
  Entra tenant id, display name and default domain (ARM `/tenants`), and when it was last checked. The
  list lives in a state file (`~/.jig/azure/tenants.json`, written through the state module); the
  active one is a setting (`azure.activeTenant`) so chats can switch it too. It is protected (D-077)
  because it decides which credentials programs run with.
- **One place runs `az`.** The host injects `AZURE_CONFIG_DIR` for the active tenant wherever `az`
  runs: add-on `exec`/`spawn` of `az`, core `links`, setup checks, Claude Code sessions, Jig terminals
  and scripts. A running chat or terminal keeps the tenant it started with; the chat header and the
  terminal tab say which one when it differs from the active tenant.
- **Switching tells everyone.** A new add-on event `azure.tenant` (in `JIG_EVENTS`) and a renderer
  event let views drop their caches and reload. Add-on caches are keyed by tenant.
- **Per-project default (later session):** a Jig project can pin a tenant; switching to that project
  switches the tenant. The top bar always shows the one in use.
- **Out of scope:** Meetings keeps its own Microsoft sign-in (D-232); a later item may offer the
  active tenant's id as its default. No PATs, no MSAL for DevOps, no stored tokens.

## Session 1 — Host: tenants, isolated `az` sign-ins, one way to run `az`

- [x] Pure logic in `packages/*`: tenant keys, the tenants file shape, merging `az account show` and
      ARM tenant output, and an `azEnv(tenant)` helper; unit tests. (`packages/azure`)
- [x] State file + `azure.activeTenant` setting (`ConfigSchema`, `SETTINGS_GUIDE`, `PROTECTED_SETTINGS`,
      `docs/reference/state.md`).
- [x] IPC `azure.tenants`, `azure.addTenant`, `azure.signInAgain`, `azure.renameTenant`,
      `azure.removeTenant`, `azure.setActiveTenant`, event `azure.tenantChanged` (`shared/ipc.ts`,
      validation, `docs/reference/ipc.md`). Adding streams the `az login` progress and can be cancelled
      (`azure.signInProgress`, `azure.cancelSignIn`).
- [x] Inject `AZURE_CONFIG_DIR` for the active tenant into every `az` the host runs (add-on host
      runtime `exec`/`spawn`, links, setup checks). Add `azure.tenant` to `JIG_EVENTS`. `AZURE_EXTENSION_DIR`
      stays on your own extensions, or `azure-devops` would be missing in a new folder.
- [x] A "signed out / expired" state per tenant (from the `az login` error mapping) without prompting
      (`azure.tenants { check: true }`: `az account show` + ARM `/tenants`).
- [ ] Needs a real machine: add a second tenant (`az login` in the browser), sign in again, cancel,
      remove; Pipelines and links with a tenant active (they get the environment, their caches don't
      follow yet: session 3).

## Session 2 — Top bar tenant switch and the manage dialog

- [x] A tenant switch in the top bar. First a chip (avatar + label) before the layout button; Jon then
      asked for just an avatar at the far right: the tenant's initials in a fixed-size round button
      after Settings, a warning dot when its sign-in expired, tooltip with name, user and domain.
      Always shown, so the right cell never jumps (D-283).
- [x] Its menu: one row per tenant (avatar, label, user email, domain in aligned columns), the active
      one checked at the far right, an expired mark in the same column; whole row clickable; "Add
      tenant…" and "Manage tenants…". (`ui/Menu.tsx` items got `avatar`, `columns` and `mark`.)
- [x] "Add tenant" modal: tenant id or domain (optional), Sign in (opens the browser via `az login`),
      progress and errors in a fixed-height box inside the modal, Cancel. "Manage" modal: switch by
      clicking a row, rename, sign in again (cancellable), remove (with confirmation). Also reachable
      from Settings → Azure.
- [x] Jig tools for Claude: `jig_azure_tenants` (readOnly) and `jig_azure_switch_tenant` (approval),
      with `jigContext` guidance; the fake engine calls them ("azure tenants", "switch … to X");
      `e2e/tenants.spec.ts`.
- [x] Looked at in narrow and wide windows, Jig Dark and Light (screenshots not committed).
- [ ] Needs a real machine: add a real second tenant from the modal, cancel one, sign in again.

## Session 3 — Azure and DevOps views follow the tenant

- [x] One shared `az` helper for add-ons (error mapping included) instead of the three copies:
      `runAz` (`main/azure/run.ts`) with `azFailure` in `@jig/azure`, used by links and by add-ons as
      `api.azure.az`; `api.azure.tenant()` and `ctx.azure` say which tenant (D-284).
- [x] Pipelines: caches keyed by tenant, reload on `azure.tenant` (`tenantChanged`), org settings
      (`allOrgs`/`orgs`), found pipelines and newest runs kept per tenant; the toolbar stays and the
      list's space shows `<Spinner center />` until the new tenant's pipelines come, never an empty list.
- [x] Boards: reload on switch; a followed board of another tenant shows one card in its own space
      ("In tenant X", the whole card switches) instead of an error. A board remembers its tenant.
- [x] Releases and Workflows' pipeline steps run with the active tenant; failures name the tenant.
- [x] Project links → Azure resources list the active tenant's subscriptions.
- [x] az starts without cmd.exe (Windows' installed az as its Python with `-X utf8`, others with
      free text as `@file` arguments): non-ASCII reads and quoted descriptions work; Boards deletes
      through the REST API (D-290).
- [x] Looked at Pipelines (loading, other tenant), Boards (placeholder, hover) and the Azure links
      dialog in Jig Dark and Light: the toolbars and tabs don't move, the list keeps one slot.
- [ ] Needs a real machine: switch with real tenants and see Pipelines, Boards and links follow; a
      board of another tenant; a release pipeline and a workflow pipeline step in an added tenant.

## Session 4 — Chats, terminals and scripts

- [x] New Claude Code sessions, Jig terminals and scripts get the active tenant's `AZURE_CONFIG_DIR`
      (`withAzureEnv` after the API-key stripping; `!` commands too). A running one keeps its tenant;
      the chat's next process starts with the active one (D-285).
- [x] `jigContext` tells Claude which tenant and user are active (`tenantContext`, no tokens), and a
      message's context says when the user switched since the chat started.
- [x] A chat or terminal started under another tenant shows it (a small label, fixed slot): initials
      and name at the end of the chat header's spacer, initials before the terminal tab's shell column
      (`SessionMeta.azureTenant`, `TerminalInfo.azureTenant`); `e2e/tenant-tags.spec.ts`.
- [ ] Needs a real machine: `az account show` in a new chat, a terminal and a script with an added
      tenant active; switch and check the old chat and terminal keep theirs and show the label.

## Session 5 — Tenant per project

- [x] A project setting "Azure tenant" (Default / a tenant), in the project dialog and `jig_update_project`
      (`Project.azureTenant`, a tenant key; Claude may name it by key, name, domain or id), listed by
      `jig_list_projects` (D-286).
- [x] Switching to a project with a pinned tenant switches the active tenant through the same host path
      as the top bar (`setActiveTenant`); pinning the active project's tenant switches too. The avatar
      shows it, and its tooltip says "Pinned by the project X".
- [x] A project whose pinned tenant was removed falls back to Default (no switch); its dialog shows
      Default with a note in the hint's slot (same height, nothing moves). `e2e/project-tenant.spec.ts`.
- [x] Looked at the dialog (pinned, removed) and the avatar tooltip in Jig Dark and Light.
- [ ] Needs a real machine: pin a real second tenant to a project, switch projects, and see Pipelines
      and Boards follow.

## Session 6 — Finish

- [x] Review all touched views for layout shifts and alignment: the avatar and its menu, the add
      (idle, invalid, signing in) and manage modals, Settings → Azure, the project dialog, the chat
      header and terminal tags, Pipelines (loading, other tenant, expired sign-in) and Boards (other
      tenant), in Jig Dark and Light, 960×720 and 1680×1000, driven with a fake `az` (screenshots in
      `.tmp/`, not committed). The avatar keeps its box on every switch; the add modal keeps its size
      while signing in; menu and manage rows keep their columns with long names.
- [x] Fixes from the review: the Boards "In tenant X" card shows the tenant's initials avatar instead
      of a building icon (one meaning for a tenant everywhere; `initials` on `azure.tenant` /
      `ctx.azure`); Pipelines with nothing listed because `az` failed (an expired sign-in) says
      "Couldn't list pipelines" with the reason in the empty state's place, not an error line above
      "No pipelines found"; a stale find error clears when the host's refreshed list arrives.
- [x] `docs/status.md` (how to try it, what needs a real second tenant), architecture, decisions,
      this checklist and `README.md` agree. The About page screenshots were not regenerated: the
      only change on them is the small avatar at the top right.
- [x] Your az login can be renamed too (D-301): Rename in every row's same slot, its name stored in
      `tenants.json`'s `default.label`, "Reset name" in the slot where added tenants have Remove; the
      name shows everywhere a tenant's name does (avatar initials, menu, tooltip, Settings, tags,
      project picker, Boards, `jig_azure_tenants`, `jigContext`).
- [x] Sign in in the browser or with a code, never Windows' account window (D-316): `LOGIN_ENV`
      turns off WAM for Jig's `az login`; a "Sign in" switch in Add tenant and a menu on Sign in again;
      the code with Copy and Open page in a fixed box or a small modal; unit and e2e tests.
- [ ] Needs a real machine: everything under `docs/status.md` → Needs testing → Azure tenants.
