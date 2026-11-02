# Phase 11 — Packaging & Windows

**Goal:** install Jig on Windows like a normal app.

**Done when:** an installer is built (electron-builder, NSIS), Jig starts from the Start menu, finds
Claude Code, git and az, and can update.

## Checklist

- [x] electron-builder config (Windows NSIS; macOS/Linux optional)
- [x] Native modules: node-pty prebuilds, esbuild platform binary, Claude Agent SDK platform binary
- [x] First-run checklist: Claude Code signed in? git? az + devops extension? VS Code `code` CLI?
- [x] App icon and name
- [x] Update strategy (GitHub releases or "pull + build" in dev mode)
- [x] Windows paths and shells documented and handled (PowerShell default, cmd, Git Bash; `.cmd` tools, junctions, `windowsHide`) — **testing on a real Windows machine is listed in docs/status.md**

- [x] Repository-owned agent release skill shared by Codex, Claude Code and Jig, with version synchronization and verified GitHub publication workflow (D-230).
- [x] Windows in-app download, explicit Install and restart, automatic version checks and release feed assets (D-233).
- [ ] Verify installed updater downloads and restarts between two published versions on Windows.

## Notes

- The installer is built on Windows with `npm run dist` (`docs/guides/packaging.md`); the cloud
  environment packaged and ran the Linux build (`e2e/packaged.spec.ts`).
- No asar (D-065); first-run checks only ask for versions (D-066); updates: pull + build from a clone,
  in-app GitHub/NSIS update on Windows (D-233, superseding D-067 there); unsigned installer for now (D-068).
