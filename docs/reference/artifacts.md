# Artifacts reference

Code: `apps/desktop/src/main/artifacts/`, `apps/desktop/src/shared/artifacts.ts`,
`apps/desktop/src/renderer/features/artifacts/`. Decision: D-092.

An **artifact** is a page Claude publishes to claude.ai with Claude Code's `Artifact` tool: Claude
writes an HTML file, publishes it, and gets a `https://claude.ai/artifact/…` link.

Jig never loads claude.ai inside the app: that would mean signing in to claude.ai in Jig, which Jig
doesn't do. Instead it opens artifacts in its **Preview** tab, in one of two ways:
- **From a chat:** the Artifact card has **Open in Jig**, which previews the local page Claude
  published (`file_path`). Relative images and links work, because they sit next to the page. It also
  has **Open on claude.ai** (your browser) and shows the link. `artifactFromTool` finds the link in the
  tool's result.
- **From your claude.ai account** (Tools → Artifacts → Load from claude.ai):
  - Listing them is one guarded call: `{ action: "list", scope: "all", limit: 100 }`, cached 5 minutes.
  - **Open in Jig** asks Claude Code to read the page: `{ action: "read", url }` (the link is checked
    against `ARTIFACT_URL` first).
  - Jig saves the page to `~/.jig/cache/artifacts/<id>.html`, wrapped in a document skeleton like
    claude.ai does, and previews it.
  - Pages that rely on files published next to them, or on claude.ai's runtime (`window.claude`), may
    look incomplete. **Open on claude.ai** always shows the real thing.

The **Artifacts** tab lists both:
- the ones from your chats, read from the transcripts with no model call: newest first, one per link,
  with Open the chat;
- the ones on claude.ai, loaded only when you ask.

Guarded calls work like routines' (`docs/reference/routines.md`): a hidden session limited to the
`Artifact` tool, the exact input checked twice, and the structured result read back. Each one is
**a small model call on your plan**.

The HTML preview runs with scripts off until you turn them on (`docs/reference/preview.md`).

## Fake engine

"publish an artifact" in a chat writes `release-notes.html` and "publishes" it. The account has two
artifacts, "Release notes" and "Sprint dashboard" (`e2e/routines-artifacts.spec.ts`).
