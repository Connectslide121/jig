# Skills library (D-205)

Open **Chats → Skills library** or search for Skills library. The single page lists fourteen bundled
skills with a clickable name (instructions/source/version/licence in a modal), category, Projects
picker and global switch. All are enabled by default except Factory's five (below), which a
catalog entry marks `"defaultEnabled": false` (D-443): they start off until you switch them on, and
Factory's stage chats ask for them by name. An override's `enabled` missing = the catalog's
default. The searchable project picker uses checkboxes
and Apply/Cancel; new projects are included automatically. Global off wins while preserving project
choices. Personal and repository Claude Code skills are independent.

## Contents and provenance

`skills/catalog.json` is Jig's curated catalog, not a replacement for Claude Code's runtime skill
or command discovery. Nine pinned snapshots retain their reference files and licences: Anthropic
frontend-design, Vercel React best practices, Angular developer and .NET Web API, and for Jig
factory (D-432, off by default) Anthropic web-artifacts-builder, theme-factory and webapp-testing
(their scripts and PDF are not bundled; the demo kit does their jobs) and Vercel
web-design-guidelines with a pinned copy of the Web Interface Guidelines as a reference file, and
pbakaus's Impeccable (D-459, off by default; its playbooks only, without its launcher). Six
Jig-authored skills cover UI/UX review, backend architecture, application security, browser
verification, AI feature UX and Factory's demo critic (`demo-quality`, its rubric in
`references/rubric.md`, off by default). Source links, author, revision and licence appear in the details modal. See
`skills/NOTICE.md` and `scripts/vendor-skills.py` for provenance and deliberate refreshes.

Only instruction/reference text is shipped. No upstream hooks, custom agents, MCP servers or
executable helpers are enabled. There is no startup download and no writes to the user's projects
or personal Claude Code configuration. Packaging copies `skills/` into resources/skills.

## Runtime

The host `SkillLibrary` selects skill-only plugins using the calling chat's project id and
`config.skills.overrides`; it never uses the active UI project. Each bundled skill is a native
Claude Code plugin with a separate namespace. `StartOptions.plugins` passes selected absolute paths
to the SDK's local `plugins` option; user/project/local settings remain enabled. Native descriptions
are discoverable, and full instructions load through Claude Code's Skill tool when relevant.

A changed selection or project restarts an existing process before its next message, preserving
Claude Code's resume id. In-flight work is not interrupted. Command caches are keyed by configuration.
The per-turn context identifies active library skills; previously loaded text can remain in chat
history, so controls govern availability/guidance rather than deleting historical context.
Builder chats use the global defaults through their existing synthetic builder project; their own
instructions and tools remain intact. No-tools helper questions do not receive these plugins.

The AI feature UX selection also controls a small appended default instruction: when creating or
substantially changing a user-facing AI feature, add a concise accessible AI disclosure/limitation
notice near the interaction/output, in the product's language, reusing existing notices and reserving
space. It does not append boilerplate to every chat answer. The deeper skill covers uncertainty,
privacy, human control and current official EU transparency references; no compliance claim or gate.

## Contracts and checks

`skills.list` returns the bundled catalog. `skills.details({ id })` returns the entrypoint text and
metadata, accepting only a catalogued id. Config changes use the existing typed config bridge and
atomic state writes. The UI reserves loading/modal space and keeps controls in fixed columns.

Unit coverage checks defaults/global precedence/project isolation, AI notice selection, packaged
entrypoints/licences and native SDK options. Session tests cover resume on selection/project changes.
The real-app regression checks topbar access, modal geometry, switches, project choices, reloads
and selection reaching continuing chats. A prompt-free isolated native Claude Code discovery check
confirmed all nine names without credentials or a model request. Live model output quality still
needs everyday use; skill availability is not proof of better output on every task.

## Repository maintenance skill (D-230)

Jig's own release workflow is versioned at `.agents/skills/jig-release/SKILL.md`, with a thin
Claude discovery entry at `.claude/skills/jig-release/SKILL.md` and routing from `AGENTS.md`.
It is for agents working on this repository, including Claude Code launched inside Jig. It is
not part of the curated `skills/` catalog loaded into every product chat, and does not release
other repositories managed by Jig. Its version helper lives beside the skill and is tested by
`scripts/release-version.test.ts`. The canonical instructions define preparation versus publication.
