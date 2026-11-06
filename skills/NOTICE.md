# Jig skill library

Eight upstream snapshots are pinned in `scripts/vendor-skills.py` and `catalog.json`, retaining
source metadata and licences. Other skills are original Jig guidance with links to authoritative
references. Only instruction/reference text is shipped: no upstream hooks, custom agents, MCP
servers or executable helpers are loaded. Personal/project Claude Code configuration is untouched.

The React skill explicitly declares MIT in its upstream SKILL.md front matter; upstream does not
ship a separate licence file. Its bundled LICENSE.txt includes the standard MIT terms and Vercel
attribution. Anthropic's frontend-design snapshot retains Apache-2.0; Angular and .NET retain MIT.

Use `python scripts/vendor-skills.py` only for a deliberate reviewed refresh. The script preserves
Jig-authored catalog entries. Updating a pin requires reviewing instructions, references, licences
and runtime compatibility; there is no network install/update at app startup.

Jig factory's snapshots (D-430, D-441): Anthropic's web-artifacts-builder, theme-factory and
webapp-testing keep Apache-2.0; only their Markdown is bundled (their scripts, `.tar.gz` and PDF are
not, so their instructions mention files that aren't here; the demo kit does those jobs). Vercel's
web-design-guidelines is MIT by the agent-skills repository's README (no licence file upstream; the
bundled LICENSE.txt carries the MIT terms), and its `references/web-interface-guidelines.md` is a
pinned copy of vercel-labs/web-interface-guidelines `command.md` (MIT, its licence beside it). These
four and the Jig-authored demo-quality start off (`defaultEnabled: false`).
