# Terminals and scripts reference

Code: `apps/desktop/src/main/terminals/` (ptys), `apps/desktop/src/main/scripts/` (discovery, groups),
`apps/desktop/src/renderer/features/terminals/` and `features/scripts/` (UI).

## Terminals

- One pty per terminal (`@lydell/node-pty`, prebuilt binaries — nothing to compile on Windows),
  rendered with xterm.js in the **Terminals** view (bottom panel by default) in the theme's ANSI
  colours and the mono font. Terminals stay alive while you switch tabs and views; they end when Jig
  quits (they are not restored after a restart).
- **Shell**: Settings → Terminal → Shell; empty = PowerShell 7 (`pwsh.exe`) if installed, else Windows
  PowerShell, on Windows; `$SHELL` elsewhere (`main/terminals/shell.ts`). Commands run as
  `pwsh -NoLogo -NoProfile -Command …`, `cmd /d /s /c …` or `sh -c …`.
- The environment is Jig's own, with `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` removed unless API keys
  are allowed (the same rule as sessions), plus `TERM=xterm-256color`, `COLORTERM=truecolor`,
  `TERM_PROGRAM=Jig`.
- Output is batched (16 ms) to the renderer; the last 400 000 characters are kept so a reloaded window
  can redraw (`terminals.buffer`).
- Commands typed into interactive terminals are reported to the activity log (`terminal.command`),
  except in **private** terminals (the Claude Code sign-in).
- **Sign in to Claude Code** (Tools menu, or the banner in a chat that isn't signed in) opens a private
  terminal running the official Claude Code binary (your `engine.claudePath`, else the one shipped with
  the Agent SDK), where you type `/login`. With `JIG_ENGINE=fake` it only prints a message.

## Scripts

Discovered per project (`main/scripts/discover.ts`), per folder up to 3 levels deep (skipping
`node_modules`, `.git`, `dist`, `build`, `bin`, `obj`, …):

| Kind | Found by | Command |
|---|---|---|
| `npm` | `package.json` scripts (not `pre*`/`post*`) | `npm run x` / `pnpm x` / `yarn x` / `bun run x` (from the lockfile) |
| `ps1` / `sh` / `cmd` | files in the project root and `scripts/` folders | `& ".\x.ps1"` (Windows) / `pwsh -File`, `bash "./x.sh"`, `.\x.cmd` |
| `dotnet-run` / `dotnet-watch` | `*.csproj` (not `*.Tests.csproj`) | `dotnet run --project "X.csproj"` / `dotnet watch --project "X.csproj" run` |
| `func` | a folder with `host.json` plus `local.settings.json`, a `.csproj`, `package.json` or `requirements.txt` | `func start` |

A script id is `<kind>:<folder>:<name>`. **Run** opens a terminal running the command in the script's
folder (one terminal per script; running it again focuses it, a finished run is replaced); **Stop**
kills it; **Restart** does both. **Groups** ("Start local" = front end + back end) are saved per project
in `~/.jig/scripts.json` and start their scripts in order.

UI: the project dashboard's Scripts card (run/stop/restart, groups), and the status bar item "N running"
(click → show output / stop). The Scripts add-on (phase 7) adds a view and Tools-menu actions.

On Windows, stopping a script closes its pseudo console, which ends the processes attached to it; check
that dev servers (node, dotnet) really stop (`docs/status.md`).
