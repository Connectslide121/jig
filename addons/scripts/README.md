# Scripts

A view with every script Jig discovers in your projects (npm/pnpm/yarn/bun scripts, `.ps1`/`.sh` in
the root and `scripts/`, .NET launch profiles, Azure Functions `func start`; D-141), laid out like the
scripts plugin (D-142):

- **Running** at the top: what runs now, wherever it's from; click to show its terminal, **open** its
  address (a backend's launch profile), **Stop**.
- **Groups**: your own sets of scripts from any project ("Certumhub" = its frontend and backend), with
  **Start** (the ones not running) and **Stop** (the running ones) for the whole group. **New group**
  in the header; right-click a script → **Add to group**; a group's ⋯ renames, moves or deletes it;
  right-click a script in a group to take it out. Kept in the add-on's storage (`groups`), the same
  in every project (`lib/groups.ts`).
- **Every script** as a tree, per project folder: top folder → git repository (when the top folder
  holds several, or isn't one) → package or project, tagged **API** (.NET / Functions), **npm** or
  **script**, with its scripts as chips: ▶ starts one, a green ■ stops it (`lib/tree.ts`). Folders
  open and close; that is kept (`expanded`). With one top folder in all, it starts open.
- **Hide** a script from its right-click menu; the eye in the header shows hidden ones again (dimmed),
  to bring them back. Hidden scripts are kept per folder (`arrangement`, as before groups).

Tools menu: **Run a script…** (`Ctrl+Shift+R`), **Start a script group…** (your groups, then the
project's dashboard groups), **Stop a running script…**. The status bar's "N running" item and the
dashboard's Scripts card are part of Jig itself (phase 5); this add-on uses the same discovery and
terminals through `ctx.scripts`.

The panel is global (D-102): one section per folder (workspace), the active project's folder first.
