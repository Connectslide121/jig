# Artifacts reference

Code: `apps/desktop/src/shared/artifacts.ts` (`artifactFromTool`),
`apps/desktop/src/renderer/features/artifacts/actions.ts`, the card in
`renderer/features/sessions/ToolCard.tsx`, `apps/desktop/src/main/engine/offeredTools.ts`.
Decisions: D-092 (superseded for artifacts), D-404.

An **artifact** is a page published to claude.ai with Claude Code's `Artifact` tool (it writes an HTML
file, publishes it and gets a `https://claude.ai/artifact/…` link).

**Jig chats don't have that tool.** Claude Code offers `Artifact`, `ArtifactComments` and `ArtifactData`
only when `CLAUDE_CODE_ENTRYPOINT=claude-desktop`, i.e. inside Anthropic's Claude desktop app. Jig runs as
`sdk-ts`, so neither its chats nor its guarded `callClaudeTool` calls ever get them. Checked 2026-11-04 with
the bundled Claude Code 2.1.296 and the desktop app's 2.1.317: `ENABLE_CLAUDEAI_MCP_SERVERS` and the Claude
Code version make no difference, and the account does have artifact access.

**Jig never pretends to be another client** (D-404): it never sets `CLAUDE_CODE_ENTRYPOINT`, or any other
identity, to the desktop app's value to unlock them.

What Jig does about it:
- **No Artifacts tab, no claude.ai listing, no guarded `Artifact` calls.** (They were removed; the
  Releases add-on's button now says "Publish the notes as a page".)
- **Claude is told about the tool only when it has it.** `recordOfferedTools` keeps the `tools` list of the
  latest Claude Code init message (`EngineEvent` init, `tools`), and `jigContext` adds the sentence about
  the Artifact tool only when `claudeOffers("Artifact")`. In Jig it never does; before any Claude chat has
  started, nothing is promised either.
- **Old calls keep their card.** A chat resumed from the desktop app can hold `Artifact` calls. Their card
  has **Open in Jig** (the local page Claude published, `file_path`, in the Preview tab; shown only when
  the call has one), **Open on claude.ai** (your browser) and the link. `artifactFromTool` finds the link in
  the tool's result.
- **The replacement is Jig's own pages** (D-405, `docs/reference/pages.md`): Claude publishes HTML into Jig with `addon_pages_publish`; the Pages add-on keeps, lists and previews it.

The HTML preview runs with scripts off until you turn them on (`docs/reference/preview.md`).

## Fake engine

"publish an artifact" in a chat writes `release-notes.html` and shows an Artifact call for it, as in a chat
resumed from the desktop app (`e2e/routines-artifacts.spec.ts`).
