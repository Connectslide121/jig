# Decisions

Every decision that shapes Jig, newest last. **Decided by** says who made it:

- **Jon** — decided by Jon.
- **Claude, agreed** — proposed by Claude and agreed by Jon in conversation.
- **Claude, on my own** — made by Claude while working autonomously. **These are the ones to review**;
  each says what to change if you disagree.

To change a decision, don't delete its entry: add a new one that supersedes it and mark the old one
`Superseded by D-xxx`.

---

### D-001 — Name: Jig
**Decided by:** Jon · **Date:** 2026-10-27
A jig is a custom tool you build to make a repetitive job faster and more precise, which is exactly
what the app does when it spots a pattern and builds a tool for it. Short English word, as requested.

### D-002 — Engine: Claude Code through the Claude Agent SDK, on the user's subscription
**Decided by:** Jon (requirement) / Claude, agreed (approach) · **Date:** 2026-10-27
Jon wants his Claude subscription quota, no API key or pay-as-you-go. Anthropic's docs (checked
2026-10-27): third-party apps may not offer Claude.ai login or intermediate credentials; signing in to
the **unmodified** Claude Code with your own subscription is allowed, and the Agent SDK / `claude -p`
draw from subscription limits when signed in with the plan. Therefore Jig launches the official Claude
Code (the SDK ships it), never handles credentials, has no login screen, and strips API-key variables
from the session environment by default.
Sources: code.claude.com/docs/en/legal-and-compliance; support.claude.com article 15036540.

### D-003 — Desktop shell: Electron
**Decided by:** Claude, agreed · **Date:** 2026-10-27
Jon is on Windows. Electron gives a Node host (needed by the Agent SDK, ptys, git), the most mature
Windows support and Playwright testing. Tauri means a Rust host; Electrobun is young on Windows.

### D-004 — Build in layers: layout/settings → add-on → app source
**Decided by:** Jon · **Date:** 2026-10-27
The builder always tries the lightest level first. Extension slots are the first attempt; changing
Jig's own code is the last resort. Where a level-3 change makes sense, it adds a new slot.

### D-005 — Consider existing add-ons before creating new ones
**Decided by:** Jon · **Date:** 2026-10-27
The builder (and the suggestion engine) must look at the existing add-ons and prefer modifying one
when that makes more sense than creating a new one.

### D-006 — Menus, not slash commands
**Decided by:** Jon · **Date:** 2026-10-27
Every capability is visible in a menu or as a button. Prompts are buttons. Plain language in chat also
works. Jig adds no slash commands of its own (Claude Code's own still work in the chat).

### D-007 — Add-ons are full React in the app, not sandboxed iframes
**Decided by:** Claude, agreed · **Date:** 2026-10-27
Full React gives native look and placement anywhere a slot allows; iframes can't change layout and feel
embedded. Safety comes from preview + accept, git history, per-add-on disable, an error boundary per
contribution, and running add-on host code in a separate process. An iframe runtime stays possible
later for add-ons written by other people.

### D-008 — Pattern detection: on demand + weekly schedule (default Monday 10:00)
**Decided by:** Jon · **Date:** 2026-10-27
No nightly AI run. A "Look for patterns now" button plus a configurable weekly run, default Monday
10:00. Recording (no AI) is continuous. A missed scheduled run happens at the next launch (Claude, on
my own: so a week is never silently skipped — change in Settings → Learning if unwanted).

### D-009 — Design system with tokens; any VS Code theme can be applied
**Decided by:** Jon (wish) / Claude, agreed (approach) · **Date:** 2026-10-27
VS Code themes are mapped onto Jig's tokens; syntax colours are used as-is via Shiki. Themes recolour;
layout, spacing and typography stay Jig's.

### D-010 — Theme sources: local VS Code installs, Open VSX, files — not the Microsoft Marketplace
**Decided by:** Claude, agreed · **Date:** 2026-10-27
The Microsoft Marketplace terms limit its use to Microsoft's products (to be re-confirmed); most themes
are also on Open VSX. Only theme JSON is extracted from a `.vsix`; nothing from an extension runs.

### D-011 — Build fresh; borrow ideas from ThinkRail, not a fork
**Decided by:** Claude, agreed · **Date:** 2026-10-27
ThinkRail (JetBrains, Apache-2.0) is built around the `pi` engine; replacing it means rewriting its core
while it changes daily. Jig is written from scratch around Claude Code, borrowing ideas (theme token
model, worktrees, token-usage checks). No ThinkRail code is copied; if code is ever copied, its
Apache-2.0 licence and NOTICE must be included.

### D-012 — npm workspaces with `legacy-peer-deps`
**Decided by:** Claude, on my own · **Date:** 2026-10-27
npm comes with Node, so nothing extra to install on Windows. npm 10's arborist crashes
(`Cannot read properties of null (reading 'edgesOut')`) resolving Vitest's `@types/node` peer range, so
`.npmrc` sets `legacy-peer-deps=true`; peer dependencies are therefore listed explicitly (e.g. the Agent
SDK's `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk`). **If you prefer pnpm or bun**, switching is
cheap now and harder later.

### D-013 — Own build scripts (esbuild + Vite), not electron-vite
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Fewer moving parts and full control over the dev loop that level-3 self-modification will drive.
Main is bundled as ESM, preload as CJS (sandboxed preloads must be CJS), renderer with Vite.

### D-014 — Dependency versions: exact, at least two weeks old; security patches excepted
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Supply-chain hygiene: fresh releases are where compromised versions show up. Exceptions are made for
security fixes: Electron 44.10.0 (certificate mitigation advisory) and zod 4.6.7 (memory exhaustion
advisory) are newer than two weeks.

### D-015 — A fake engine for development and tests
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Tests and this autonomous build never use real Claude credentials. `FakeEngine` replays scripted
events through the same `Engine` interface. Real-engine behaviour must be verified on Jon's machine
(listed in `docs/status.md` → "Needs testing on your machine").

### D-016 — Activity log as JSONL, not SQLite
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Avoids a native module (fewer Windows build problems); data volume is small (thousands of events per
week) and mining reads a few weeks at a time. Can move to `node:sqlite` later if needed.

### D-017 — Add-on host code runs in an Electron `utilityProcess`
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Agent-written host code can hang or crash; a separate process per add-on keeps the app responsive and
lets Jig kill/restart it. The host API it gets is limited by the manifest's permissions.

### D-018 — Azure DevOps and git through the user's own CLIs
**Decided by:** Claude, on my own (follows principle 3) · **Date:** 2026-10-27
Pipelines use `az pipelines` / `az devops` with the user's `az login`; git uses the `git` CLI. Jig stores
no tokens. If `az` turns out too slow for listing, the add-on can get a token from
`az account get-access-token` per call and use the REST API — still no stored secrets.

### D-019 — Git: lean multi-repo overview in Jig; GitLens via a VS Code tab
**Superseded by D-022.** · **Decided by:** Claude, agreed · **Date:** 2026-10-27
Running VS Code extensions inside Jig would mean re-implementing the VS Code API. Instead a built-in
add-on shows the user's own VS Code (`code serve-web`) in a tab, where GitLens works as usual. Jig's own
Repos view stays a cross-repo overview (status, push/pull, latest commits), which GitLens does not do.

### D-020 — Commit identity and attribution
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Commits use Jon's name and email (it is his repository) and carry no AI attribution trailers, matching
Jon's instructions in his other repositories. Change with `git config` if you prefer otherwise.

### D-021 — State in `~/.jig`, overridable with `JIG_HOME`
**Decided by:** Claude, on my own · **Date:** 2026-10-27
One folder that is easy to back up, inspect and delete. On Windows that is `C:\Users\<you>\.jig`.

### D-022 — Jig's own Git tab; no VS Code tab, no VS Code extensions
**Decided by:** Jon · **Date:** 2026-10-27
VS Code extensions (e.g. GitLens) can't run inside Jig without re-implementing the VS Code API, and
embedding VS Code (`code serve-web`) was rejected. Jig builds its own Git tab focused on what Jon uses:
commit history per branch, diffs, and clicking a commit or file to see the detail in the main window.
Rebase, graph and blame are out of scope.

### D-023 — No native menu bar; Jig's own top bar and menus
**Decided by:** Jon (raised) / Claude, on my own (details) · **Date:** 2026-10-27
Electron apps get a native File/Edit/View menu bar by default. Jig hides the OS title bar (window
controls are drawn over Jig's top bar on Windows) and removes the menu bar on Windows/Linux, so every
menu is Jig's own and themed (principle 4). On macOS a minimal application menu stays, because
Cmd+C/V/X/A/Z/Q only work through menu roles there. Copy/paste in inputs keeps working on Windows
without a menu.

### D-024 — Push to `origin/main` at the end of each phase
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Cloud sessions run in throwaway containers, so finished work is pushed so it isn't lost. Commits stay
small and coherent. Change to a branch + pull-request flow if you prefer reviewing before it lands.

### D-025 — Planning first; implementation continues in a new session
**Decided by:** Jon · **Date:** 2026-10-27
The first session finished the plan (and phase 1, which was already built when this was decided). The
next session starts from `docs/status.md` → "Continue here", with ThinkRail cloned beside Jig as
reference (`docs/reference/reference-repos.md`).

### D-026 — Theme ids and duplicates
**Decided by:** Claude, on my own · **Date:** 2026-10-27
Ids are `jig-dark`/`jig-light`, `user:<file-slug>`, `vscode:<publisher.name>/<theme-slug>` and
`openvsx:<namespace.name>/<theme-slug>`, so a saved setting survives editor updates (the version is not in
the id). When the same extension is installed in several editors, or an editor left an old version
behind, the newest folder found first wins. Change in `apps/desktop/src/main/themes/sources.ts`.

### D-027 — Shiki with its JavaScript regex engine
**Decided by:** Claude, on my own · **Date:** 2026-10-27
No WASM to load and nothing to relax in the CSP; grammars load on demand. Shiki's Oniguruma (WASM)
engine is more exact for a few rare grammars — switch in `renderer/lib/highlight.ts` if a language
highlights wrongly.

### D-028 — Base components live in the app (`renderer/ui/`) and are re-exported to add-ons
**Decided by:** Claude, on my own · **Date:** 2026-10-27
One implementation of Button, Menu, Dialog, … used by Jig and (as `@jig/sdk/ui`, phase 6) by add-ons, so
agent-written add-ons look native and follow the tokens. Menus are global (one open at a time, opened
with `openMenu`/`contextMenu`), which makes right-click menus from add-ons trivial.
