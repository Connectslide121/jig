# Builder reference

Code: `apps/desktop/src/main/builder/` (service, tools, prompt, workspace, validation),
`apps/desktop/src/shared/builds.ts` (types), `apps/desktop/src/renderer/features/builder/` (UI). Jig never
edits its own source (D-074): when no slot fits, the builder proposes an extension point.

## Entry points (all menus, no commands)

| Where | What happens |
|---|---|
| Tools → **Build something…** (`Ctrl+Shift+B`), Builds view `+` | dialog: what should it do? optionally which add-on |
| `⋯` of an add-on view, right-click an add-on tab, Settings → Add-ons ✦ → **Change this with AI…** | the dialog with that add-on pre-selected |
| A crashing add-on → **Fix with AI** | starts at once with the error as the goal |
| Any chat: "make me a button that…" → Claude calls `jig_request_build` | starts at once; a build card appears in that chat |
| A suggestion → **Build it** (phase 9) | starts at once with the suggestion |

## A build job

`BuildJob` (`shared/builds.ts`), stored in `~/.jig/builds.json`:
`working` → (`needs_you`) → `preview` → `accepted` | `discarded` (or `failed`).

1. **Start.** A git worktree of `~/.jig/addons` is created at `~/.jig/work/<job>` on branch
   `build/<job>`, and a **builder session** starts there: a normal Claude Code session (`kind:
   "builder"`, permission mode *Accept edits*) with the builder instructions appended to Claude Code's
   own system prompt (`main/builder/prompt.ts`) and the `jig-builder` MCP tools. It isn't listed under
   Sessions; open it from the build ("Builder chat") to follow along or answer its questions.
2. **Decide, lightest level first** (the instructions say so, D-004/D-005): layout/settings, else an
   add-on — reading the catalog first and **preferring to change an existing add-on** — else it proposes the missing extension point (no code change to Jig).
3. **Validate.** `finish` runs the checks; problems go back to the builder (at most 3 rounds, then the
   job fails): manifest schema, UI and host bundles build, every export the manifest names exists, design
   tokens only (`checkTokens`), a README.
4. **Preview.** Level 1: the staged layout operations / settings patch are shown in the build tab.
   Level 2: the worktree's add-on is loaded live **as a preview** in place of the current one (views say
   "(preview)"), with the changed files and their diffs and the permissions it asks for.
5. **Accept** — level 1: the layout operations are applied to the *current* layout / the settings
   patch is saved. Level 2: the build branch is merged into `~/.jig/addons` (a commit in its history,
   so Settings → Add-ons → History can roll it back), the worktree is removed and the add-on reloads.
   **Discard** — the preview stops, the worktree and the branch are deleted.

## `jig-builder` tools (`main/builder/tools.ts`)

| Tool | What |
|---|---|
| `catalog` | add-ons (manifest contributions, permissions, README), every view and where it is, settings, slots |
| `read_addon { id }` | every file of an add-on (built-in ones are examples) |
| `start_addon { id, mode: "change" \| "new" }` | prepares the folder in the worktree (a built-in add-on is copied there — your copy replaces it, D-043) and returns its path |
| `validate { id }` | the checks above |
| `stage_layout { ops }` | `move`/`hide`/`show` a view, `resize`/`collapse`/`expand` a region |
| `stage_settings { patch }` | a partial `config.json`, validated |
| `propose_extension_point { reason, proposal }` | no slot can do it: the job ends (`needs_you`, kind `app`) with `job.proposal` — the Build tab shows it with **Copy proposal**; you add the slot to Jig yourself |
| `finish { summary, kind, addonId? }` | validate and go to preview |

The same tools are plain functions for the fake engine: with `JIG_ENGINE=fake` a scripted builder
(`main/engine/fakeBuilder.ts`) runs the real pipeline — "move …" → layout, "compact" → settings, a
target add-on → changes it, anything else → a new add-on (with a deliberate token problem first when
the goal says "broken").

## IPC

`builds.list`, `builds.start { goal, origin, targetAddonId?, originSessionId? }`, `builds.accept`,
`builds.discard`, `builds.diff { id, path }`; event `builds.changed` (`docs/reference/ipc.md`).
