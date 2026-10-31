# Jig skill library

Four upstream snapshots are pinned in `scripts/vendor-skills.py` and `catalog.json`, retaining
source metadata and licences. Other skills are original Jig guidance with links to authoritative
references. Only instruction/reference text is shipped: no upstream hooks, custom agents, MCP
servers or executable helpers are loaded. Personal/project Claude Code configuration is untouched.

The React skill explicitly declares MIT in its upstream SKILL.md front matter; upstream does not
ship a separate licence file. Its bundled LICENSE.txt includes the standard MIT terms and Vercel
attribution. Anthropic's frontend-design snapshot retains Apache-2.0; Angular and .NET retain MIT.

Use `python scripts/vendor-skills.py` only for a deliberate reviewed refresh. The script preserves
Jig-authored catalog entries. Updating a pin requires reviewing instructions, references, licences
and runtime compatibility; there is no network install/update at app startup.
