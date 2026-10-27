# Phase 5 — Terminals & scripts

**Goal:** terminals inside Jig, and starting a project's front and back end with one click.

**Done when:** terminals open per project in the bottom panel, survive switching tabs, and scripts
discovered in a project can be started/stopped from buttons with their output in a terminal.

## Checklist

- [x] Terminal host: `@lydell/node-pty`, one pty per terminal, resize, kill, exit status
- [x] xterm.js view with theme ANSI colours and the mono font
- [x] Terminals panel: tabs per terminal, new terminal in active project, rename, close
- [x] Default shell per OS (PowerShell on Windows), configurable
- [x] Script discovery: `package.json` scripts, `*.ps1`/`*.sh` in the root and `scripts/`, `*.csproj`
      (dotnet run / watch), Azure Functions (`func start`) — per project and per sub-folder
- [x] Run / stop / restart a script; running scripts show in the status bar
- [x] Script "groups" (e.g. "Start local" = front + back) saved per project
- [x] Activity events for terminal commands and script runs (feeds phase 9)

## Notes

- Terminals end when Jig quits; they are not restored (D-041).
- The scripts UI lives on the project dashboard and the status bar; the Scripts add-on (phase 7) adds a
  view and Tools-menu actions on top of the same host API.
- Activity events go to `main/activity/bus.ts`; the log that records them comes in phase 9.
