# Scripts

A view with every script Jig discovers in your projects (npm/pnpm/yarn/bun scripts, `.ps1`/`.sh` in
the root and `scripts/`, `dotnet run`/`watch`, Azure Functions `func start`), grouped per project and
folder, with Run / Stop / Restart. Groups (saved per project, e.g. "Start local" = front end + back end)
start several scripts at once.

Tools menu: **Run a script…** (`Ctrl+Shift+R`), **Start a script group…**, **Stop a running script…**.
The status bar's "N running" item and the dashboard's Scripts card are part of Jig itself (phase 5);
this add-on uses the same discovery and terminals through `ctx.scripts`.
