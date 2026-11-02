# Phase 14 — AI features and previews

**Goal:** make Jig the best place to work with Claude Code: features built on what Claude Code can do
(suggestions, checkpoints, forks, parallel attempts), Claude where it saves time (commit messages,
checks, tours, standups, failed scripts), and previews for the files Claude writes (D-083…D-088).

## Checklist

- [x] Next-message suggestions, restore files to before a message, fork chat
- [x] `ctx.ai.ask` / `ctx.ai.tour` for add-ons (permission `ai`); Git: Write the commit message, Check
      before committing, Walk me through the changes, Explain / Review with Claude
- [x] Ask Claude about a failed script; desktop notifications
- [x] File previews: Markdown + Mermaid, HTML, PDF, CSV/Excel, JSON, notebooks, media, Office, code
- [x] Try several ways (parallel attempts in worktrees, judged by Claude)
- [x] Guided change tours; turn a chat into a tool; write my standup
- [x] Claude's terminals (`jig_terminal_*`) and images from tools in the chat
- [x] Browser: an offscreen page Claude drives (`jig_browser_*`), live view you can take
      over, console, screenshots in the chat (D-090)
- [x] Tests: unit for every parser and git operation, e2e per feature (`e2e/ai.spec.ts`,
      `e2e/preview.spec.ts`, `e2e/browser.spec.ts`)

- [x] Rename the visible browser feature to Browser across its view, menus, settings and About (D-216).

- [x] Native user Browser tab in the main panel, separate from Claude’s offscreen browser (D-225).

- [x] Top-right globe Browser icon; Claude’s browser uses MonitorCog and has page interaction for sign-ins, read-only navigation and a hint/link to the user Browser (D-226).

## Later

- Browser: several tabs, recording a session as a GIF, network requests in the console pane.
- Tours of a commit or a branch (not only uncommitted changes).
- Attempts that start from uncommitted work (a stash applied in each worktree).
