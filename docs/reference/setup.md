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
reads, asks about or forwards a login**; Claude Code's sign-in state shows when a session starts (the
engine's `not_signed_in` error → banner with Sign in).

`config.setup.firstRunDone` (default `false`): an installed Jig (`AppInfo.packaged`) opens the Get
started tab until you press **Done**.

## Updates

| Method | Result | |
|---|---|---|
| `updates.check` | `UpdateInfo { mode, current, latest?, available, detail, url? }` | `source` when Jig runs from a git clone (not packaged, `sourceRepo()` found): `git fetch` + commits behind `@{u}`; else `release`: GitHub API `repos/Connectslide121/jig/releases/latest` |
| `updates.apply` | `{ restarting }` | `source`: refuse a dirty clone, snapshot the running build to `app-builds/previous`, `git pull --ff-only`, install if dependencies changed, build, restart through the launcher (not with `JIG_NO_RESTART`); `release`: opens the release page. Error `update_failed` |
