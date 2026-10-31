# Scripts

A view with every script Jig discovers in your projects (npm/pnpm/yarn/bun scripts, `.ps1`/`.sh` in
the root and `scripts/`, .NET launch profiles, Azure Functions `func start`; D-141), laid out like the
scripts plugin (D-142):

- **Filter scripts** (top): type to find any script at once, by name, package, folder or command;
  the matches list flat with where they live.
- **Running**: what runs now, wherever it's from, in a green box; ⋯ opens its address (a backend's
  launch profile), shows its terminal or stops it.
- **Groups**: cards with a **Start** button (**Start the rest** when some already run) and **Stop**,
  their scripts as rows. A group starts folded to its header (chevron to unfold, remembered in `expanded`);
  **All scripts** folds away too. Your own groups take scripts from any project ("Certumhub" = its frontend
  and backend): **New group** in the header, then a script's ⋯ (or right-click) → **Add to group**;
  a group's ⋯ renames, moves or deletes it. Groups made on a project's dashboard before it lost its
  Scripts card (D-153) still show here, marked as the project's, with the same Start and Stop. Your groups are kept in the
  add-on's storage (`groups`), the same in every project (`lib/groups.ts`).
- **All scripts**: per project folder, top folder → git repository (when the top folder holds
  several, or isn't one) → package or project with its kind (API / npm / script), then its scripts
  as rows: ▶ to run (a green ■ while it runs), its name, what it runs, and ⋯ on hover
  (`lib/tree.ts`). Folders open and close; that is kept (`expanded`).
- **Hide** a script from its ⋯; the eye in the header shows hidden ones again (dimmed), to bring
  them back. Hidden scripts are kept per folder (`arrangement`).

grouped menus: **Run a script…** (`Ctrl+Shift+R`), **Start a script group…** (your groups, then the
project's dashboard groups), **Stop a running script…**. The status bar's "N running" item is part of
Jig itself (phase 5); this add-on uses the same discovery and terminals through `ctx.scripts`. This
view is the one place scripts are listed: the project dashboard's Scripts card is gone (D-153).

The panel is global (D-102): one section per folder (workspace), the active project's folder first.
