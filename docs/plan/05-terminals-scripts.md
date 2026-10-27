# Phase 5 — Terminals & scripts

**Goal:** terminals inside Jig, and starting a project's front and back end with one click.

**Done when:** terminals open per project in the bottom panel, survive switching tabs, and scripts
discovered in a project can be started/stopped from buttons with their output in a terminal.

## Checklist

- [ ] Terminal host: `@lydell/node-pty`, one pty per terminal, resize, kill, exit status
- [ ] xterm.js view with theme ANSI colours and the mono font
- [ ] Terminals panel: tabs per terminal, new terminal in active project, rename, close
- [ ] Default shell per OS (PowerShell on Windows), configurable
- [ ] Script discovery: `package.json` scripts, `*.ps1`/`*.sh` in the root and `scripts/`, `*.csproj`
      (dotnet run / watch), Azure Functions (`func start`) — per project and per sub-folder
- [ ] Run / stop / restart a script; running scripts show in the status bar
- [ ] Script "groups" (e.g. "Start local" = front + back) saved per project
- [ ] Activity events for terminal commands and script runs (feeds phase 9)
