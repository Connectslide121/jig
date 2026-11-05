# Terminals and scripts reference

Code: `apps/desktop/src/main/terminals/` (ptys), `apps/desktop/src/main/scripts/` (discovery, groups),
`apps/desktop/src/renderer/features/terminals/` and `features/scripts/` (UI).

## Terminals

- One pty per terminal (`@lydell/node-pty`, prebuilt binaries — nothing to compile on Windows),
  rendered with xterm.js in the **Terminals** view (bottom panel by default) in the theme's ANSI
  colours and the mono font. Terminals stay alive while you switch tabs and views; they end when Jig
  quits (they are not restored after a restart).
- **Shell**: Settings → Terminal → Shell is a picker of the installed shells (`terminals.shells`, `main/terminals/shells.ts`) plus "Custom path…"; the Terminals header's chevron next to `+`, right-click on `+` and Code → New terminal in… open one terminal in another shell without changing it (D-240, D-241). Empty = PowerShell 7 (`pwsh.exe`) if installed, else Windows
  PowerShell, on Windows; `$SHELL` elsewhere (`main/terminals/shell.ts`). Commands run as
  `pwsh -NoLogo -NoProfile -Command …`, `cmd /d /s /c …` or `sh -c …`. PowerShell gets a last line
  that exits with the program's own exit code (`POWERSHELL_EXIT`; on its own PowerShell says 1).
- The environment is Jig's own, with `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` removed unless API keys
  are allowed (the same rule as sessions), plus `TERM=xterm-256color`, `COLORTERM=truecolor`,
  `TERM_PROGRAM=Jig`, and the active Azure tenant's `AZURE_CONFIG_DIR`/`AZURE_EXTENSION_DIR` (none for
  your own az login). A terminal keeps the tenant it started with (`TerminalInfo.azureTenant`); its tab
  shows the tenant's initials before the shell column while that isn't the active one (D-285).
- Output is batched (16 ms) to the renderer; the last 400 000 characters are kept so a reloaded window
  can redraw (`terminals.buffer`).
- Commands typed into interactive terminals are reported to the activity log (`terminal.command`),
  except in **private** terminals (the Claude Code sign-in).
- **Sign in to Claude Code** (grouped menus, or the banner in a chat that isn't signed in) opens a private
  terminal running the official Claude Code binary (your `engine.claudePath`, else the one shipped with
  the Agent SDK), where you type `/login`. With `JIG_ENGINE=fake` it only prints a message.

## Scripts

Discovered per project (`main/scripts/discover.ts`), per folder up to 3 levels deep (skipping
`node_modules`, `.git`, `dist`, `build`, `bin`, `obj`, …):

| Kind | Found by | Command |
|---|---|---|
| `npm` | `package.json` scripts (not `pre*`/`post*`) | `npm run x` / `pnpm x` / `yarn x` / `bun run x` (from the lockfile) |
| `ps1` / `sh` / `cmd` | files in the project root and `scripts/` folders | `& ".\x.ps1"` (Windows) / `pwsh -File`, `bash "./x.sh"`, `.\x.cmd` |
| `dotnet-run` | a `*.csproj` (not `*.Tests.csproj`): each launch profile of kind `Project` in `Properties/launchSettings.json`, named after it; a web/worker/console project without profiles gets one `run`; a class library nothing (D-141) | `dotnet run --project "X.csproj" --launch-profile <name> [-- args]` / `dotnet run --project "X.csproj"`; `url` from the profile's `applicationUrl` |
| `func` | a folder with `host.json` plus `local.settings.json`, a `.csproj`, `package.json` or `requirements.txt`, or a project with `AzureFunctionsVersion`: one per launch profile (its arguments), else one | `func start [args]`; `url` `http://localhost:<--port or 7071>` |

A script id is `<kind>:<folder>:<name>`. **Run** opens a terminal running the command in the script's
folder (one terminal per script; running it again focuses it, a finished run is replaced); **Stop**
kills it; **Restart** does both. **Groups** ("Start local" = front end + back end) are saved per project
in `~/.jig/scripts.json` and start their scripts in order.

UI: the Scripts add-on's view (run/stop, groups, D-146) and menu actions, and the status bar
item "N running" (click → show output / stop). The project dashboard no longer has a Scripts card
(D-153).

On Windows, stopping a script closes its pseudo console, which ends the processes attached to it; check
that dev servers (node, dotnet) really stop (`docs/status.md`).

## Ask Claude about output

When a terminal that runs a command (a script, not an interactive shell or a private terminal) goes
from running to exited with a non-zero code, a toast offers **Ask Claude** and **Show output**; a failed
terminal also has a ✨ button in the list, and every non-private terminal has "Ask Claude about this
output" in its menu. It opens a new chat in the terminal's folder (when it is inside the project) with
the request typed in, not sent: the title, command, exit code and the last 120 lines of output (colour
and cursor codes removed, at most 12 000 characters). Code: `features/terminals/askClaude.ts`.

## Claude's terminals

Chats get tools on the `jig` MCP server (`main/terminals/claudeTools.ts`):
- `jig_terminal_run { command, title?, cwd? }` starts a long-running command (dev server, watcher) in a
  visible terminal. The terminal is titled "Claude: …", tagged with the chat (`TerminalInfo.sessionId`),
  revealed in the panel (`terminals.reveal`; while you work on another tab of the Terminals view's
  panel, that tab gets a badge instead of switching, D-349), and returns its first output. Its folder must be inside
  the project.
- `jig_terminal_read { id, lines? }` (read-only, no prompt) returns the last lines of a terminal of the
  project, plain text: Claude's own terminals, scripts, or your dev server.
- `jig_terminal_list` (read-only) lists the project's terminals.
- `jig_terminal_stop { id }` stops and closes (removes) a terminal; only terminals that chat started.
  The tool description and the appended prompt ask Claude to stop terminals it no longer needs.
- When a terminal Claude started exits by itself (not stopped or closed), Jig tells the chat that
  started it (D-281): `SessionManager.notify` sends a message with the exit code and the last 40
  lines (`exitNotice`), starting a turn in an idle chat or joining the running one. The transcript
  shows it as one line (`from` on the user item, "Jig told Claude", the full text in its tooltip),
  never as something you typed. The tool description and the appended prompt tell Claude to end its
  turn instead of polling with sleep timers.
- **Finished terminals close themselves (D-373).** Once the chat has its exit notice, the terminal is
  closed (`FinishedTerminals`, `main/terminals/autoClose.ts`): one that succeeded right away, unless it
  is the terminal on screen (the active one while the Terminals view is visible, which the renderer
  reports with `terminals.watching`), then when you switch away; one that failed only after you have
  looked at it and switched away. While `jig_terminal_run` is still answering it waits, so the answer
  has the output. Archiving or deleting a chat closes all its terminals (`onSessionClosed`). Your own
  terminals, scripts and sign-in terminals are never closed this way.

Private terminals (the Claude Code sign-in) are never visible to these tools. The appended prompt tells
Claude to use them for anything that keeps running, and its own shell for commands that finish. A
terminal Claude started has "Open the chat that started it" in its menu.

