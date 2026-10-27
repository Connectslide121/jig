# Phase 11 — Packaging & Windows

**Goal:** install Jig on Windows like a normal app.

**Done when:** an installer is built (electron-builder, NSIS), Jig starts from the Start menu, finds
Claude Code, git and az, and can update.

## Checklist

- [ ] electron-builder config (Windows NSIS; macOS/Linux optional)
- [ ] Native modules: node-pty prebuilds, esbuild platform binary, Claude Agent SDK platform binary
- [ ] First-run checklist: Claude Code signed in? git? az + devops extension? VS Code `code` CLI?
- [ ] App icon and name
- [ ] Update strategy (GitHub releases or "pull + build" in dev mode)
- [ ] Windows paths and shells tested (PowerShell, cmd, Git Bash)
