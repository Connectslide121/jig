# Setup checks and updates reference

Code: `apps/desktop/src/main/setup/` (checks, IPC), `apps/desktop/src/main/updates/source.ts`,
`apps/desktop/src/shared/setup.ts` (types, `compareVersions`), UI `apps/desktop/src/renderer/features/setup/`.

## Checks (`setup.check` → `SetupCheck[]`)

| id | Needed | How it is checked |
|---|---|---|
| `claude` | yes | `<claude> --version`, where `<claude>` is Settings → Claude Code → binary, else the Agent SDK's binary for this platform |
| `codex` | optional | `codex --version`, then `codex login status` (OpenAI's Codex CLI on PATH, for ChatGPT as a provider, D-294) |
| `git` | yes | `git --version` |
| `gh` | optional | `gh --version` |
| `az` | optional | `az --version` (first line) |
| `az-devops` | optional | `az extension show --name azure-devops --output none` (exit code) |
| `code` | optional | `code --version` |

Programs run without a shell (`.cmd` through `cmd.exe` on Windows), with a 20 s timeout. **No check
reads or forwards a login.** Claude Code is asked whether it's signed in (`claude auth status --json`,
`setup/signIn.ts`), and only yes/no and the method are kept, never the email or organisation
(D-126); with the fake engine it isn't asked. A chat that finds Claude Code signed out still shows
the engine's `not_signed_in` banner with Sign in.

**Sign in to Claude Code…** runs `claude auth login` in a private terminal. When it ends, Jig asks
`claude auth status` again and emits `claude.signIn`: signed in → a toast says so and the terminal
closes; not → a toast with Try again. Get started checks again.

**ChatGPT (Codex)** is optional. Installed but signed out, the row has **Sign in…** (`SetupCheck.signIn`
= `jig.codexLogin`), which runs `codex login` in a private terminal without `OPENAI_API_KEY` /
`CODEX_API_KEY` (Codex opens the browser for the ChatGPT sign-in). When it ends Jig asks `codex login
status`, emits `codex.signIn`, closes the terminal if signed in and Get started checks again. Only
"signed in" and how are kept (`parseCodexLoginStatus`); never a key, token or account. Missing, the
row shows How to install (`npm install -g @openai/codex`). With the fake engine the sign-in isn't
asked and the terminal only echoes.

`config.setup.firstRunDone` (default `false`): an installed Jig (`AppInfo.packaged`) opens the Get
started tab until you press **Done**.

## Updates

| Method | Result | |
|---|---|---|
| `updates.check` | `UpdateInfo { mode, current, latest?, available, detail, url?, download?, percent? }` | Installed Windows: GitHub NSIS feed, check only (no download, D-236); source: git fetch/upstream status; other platforms: latest-release API |
| `updates.apply` | `{ restarting }` | Installed Windows: download the update when none is ready (progress via `updates.state`); otherwise install it with the visible installer and restart, refusing active meetings/working chats. Source: existing dirty-clone guard, snapshot, fast-forward/install/build/launcher. Other platforms: release page |

`updates.state` emits progress/ready/error states. Installed Windows checks 15 seconds after startup;
Get started also checks on mount, always shows the version, and reserves status/progress/action space.
Downloads verify the feed's SHA-512. Installation requires an explicit action, never ordinary quit.
The initiating workbench refuses unsaved files. The packaged app uses `main/updates/windows.ts`;
source updates retain the launcher below. Pre-updater installations need one manual upgrade.

Settings → **Updates** (`config.updates`): Jig's source repository (empty = the repo Jig runs from), the
build command and the install command.

Publishing is handled by the repository's shared `.agents/skills/jig-release/SKILL.md`, with a
Claude entry under `.claude/skills/jig-release`. An authorized release publishes a stable GitHub
release containing `Jig-Setup-<version>.exe`, its `.blockmap`, `latest.yml` and `SHA256SUMS.txt`; the public latest-release endpoint
must be readable without authentication. A 404 can mean there is no stable release yet as well as
an inaccessible repository. See `docs/guides/packaging.md` for agent invocation.

## The launcher (`apps/launcher/launcher.mjs`)

Plain Node, no dependencies, copied to `dist/main/launcher.mjs` by the build. After "Pull, build and
restart", Jig starts it as Electron in Node mode (`ELECTRON_RUN_AS_NODE=1`) and quits:

```
launcher.mjs --electron <exe> --app <apps/desktop> --previous <app-builds/previous/apps/desktop>
             --home <jig home> --wait-pid <old pid> [--timeout 60]
```

1. Waits for the old process to exit.
2. Starts the new build with `JIG_READY_FILE=<home>/launcher/ready-…`; Jig writes its pid there once the
   main window has loaded (the ready heartbeat).
3. No heartbeat within the timeout, or the process exits → starts the previous build with
   `JIG_STARTED_AFTER_FAILURE=1` (banner).
4. That fails too → the new build in safe mode (`JIG_SAFE_MODE=1`: your own add-ons stay off; banner).

It writes `<home>/launcher/status.json` (`{ result: "new" | "previous" | "safe-mode" | "failed" }`) and
`<home>/launcher/launcher.log`. `JIG_NO_RESTART=1` (tests) applies an update without restarting.
Tests: `apps/launcher/launcher.test.ts` and `e2e/launcher.spec.ts`.

