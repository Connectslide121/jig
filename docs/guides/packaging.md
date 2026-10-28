# Packaging, installing and updating Jig

## Build the Windows installer

Build on **Windows** (npm installs the native parts — `@lydell/node-pty`, esbuild's binary and the Claude
Code binary of the Agent SDK — for the machine it runs on, so an installer built elsewhere would carry
the wrong ones):

```powershell
git clone https://github.com/Connectslide121/jig.git
cd jig
npm install
npm run dist          # = npm run build + electron-builder --win
```

The result is `apps/desktop/release/Jig-Setup-<version>.exe` (NSIS, per user, no admin rights; you may
change the folder; Start menu and desktop shortcuts) plus `release/win-unpacked/` (the same app without
installer — handy for a quick try). On Linux/macOS `npm run dist` makes `release/linux-unpacked/` or
`release/mac/` (unsigned, for testing).

Config: `apps/desktop/electron-builder.yml`. The icon is generated: `npm run icon --workspace
@jig/desktop` writes `apps/desktop/build/icon.png` (electron-builder makes the `.ico`).

What is inside (`resources/`):

| Path | |
|---|---|
| `app/dist/` | the built main process, preload, renderer, `tokens.css`, `launcher.mjs` |
| `app/node_modules/` | runtime dependencies: Agent SDK + this platform's Claude Code binary, node-pty, esbuild, Tailwind, zod, `@jig/*` |
| `addons/` | the built-in add-ons (Git, Repos, Pipelines, Scripts) |

There is **no asar archive** (D-065): esbuild and Tailwind read files from `node_modules` at runtime
(add-ons are bundled when they load) and the Claude Code binary must be executable.

The installer isn't code-signed: Windows SmartScreen asks once ("More info → Run anyway").

## First start

An installed Jig opens **Get started** on its first start (also Tools → Check your setup…, Settings →
About → Get started…). It shows whether Claude Code, git, the GitHub CLI, the Azure CLI with the Azure
DevOps extension and VS Code's `code` command are there, with install links. Jig only asks each tool for
its version. Sign in to Claude Code with **Sign in to Claude Code…** (Claude Code's own `/login` in a
terminal); whether you are signed in shows when your first session starts.

## Updates

Tools → **Check for updates…** (and the Updates card in Get started):

- **Running from a git clone** (`npm run dev` / `npm start`): Jig fetches, shows how many commits your
  branch is behind its upstream, and **Pull, build and restart** does `git pull --ff-only`, `npm
  install` when `package.json`/`package-lock.json` changed, `npm run build`, and restarts through the
  launcher (the running build is kept as the fallback). It refuses when the clone has uncommitted changes.
- **Installed**: Jig looks at the latest GitHub release of `Connectslide121/jig` and, if it is newer,
  opens its page to download the installer. (A private repository answers 404: "Couldn't check".)

There is no silent auto-update (D-067).

## Windows notes

- **Shells.** Terminals use PowerShell by default (`powershell.exe`; set `pwsh.exe`, `cmd.exe` or Git
  Bash's `C:\Program Files\Git\bin\bash.exe` in Settings → Terminal). Script commands from add-ons run
  without a shell; `.cmd`/`.bat` tools (`az`, `code`, `npm`) go through `cmd.exe /d /s /c` with safe
  quoting (`main/addons/winCommand.ts`).
- **Paths.** Your Jig home is `%USERPROFILE%\.jig`. Paths with spaces work everywhere Jig runs programs
  (no shell string concatenation). Level-3 worktrees link `node_modules` with junctions (no admin
  rights or developer mode needed).
- **No console windows.** Every process Jig starts sets `windowsHide`.
- **Long paths.** If `npm install` complains about long paths, enable them in Git (`git config --global
  core.longpaths true`).
