# Setup checks and updates reference

Code: `apps/desktop/src/main/setup/` (checks, IPC), `apps/desktop/src/main/updates/source.ts`,
`apps/desktop/src/shared/setup.ts` (types, `compareVersions`), UI `apps/desktop/src/renderer/features/setup/`.

## Checks (`setup.check` → `SetupCheck[]`)

| id | Needed | How it is checked |
|---|---|---|
| `claude` | yes | `<claude> --version`, where `<claude>` is Settings → Claude Code → binary, else the Agent SDK's binary for this platform |
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

`config.setup.firstRunDone` (default `false`): an installed Jig (`AppInfo.packaged`) opens the Get
started tab until you press **Done**.

## Updates

| Method | Result | |
|---|---|---|
| `updates.check` | `UpdateInfo { mode, current, latest?, available, detail, url? }` | `source` when Jig runs from a git clone (not packaged, `sourceRepo()` found): `git fetch` + commits behind `@{u}`; else `release`: GitHub API `repos/Connectslide121/jig/releases/latest` |
| `updates.apply` | `{ restarting }` | `source`: refuse a dirty clone, snapshot the running build to `app-builds/previous`, `git pull --ff-only`, install if dependencies changed, build, restart through the launcher (not with `JIG_NO_RESTART`); `release`: opens the release page. Error `update_failed` |

Settings → **Updates** (`config.updates`): Jig's source repository (empty = the repo Jig runs from), the
build command and the install command.

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

