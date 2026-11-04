# Files

The project's files as a tree (phase 18, D-101/D-102: it follows the active project).

- **Which folders:** the project's default workspace by default.
  - **The picker** at the top chooses another folder: any workspace, or a repository inside one.
  - **The eye button** shows more folders next to it.
  - Kept per project in the add-on's storage (`roots:<projectId>`), like the Git panel's choice.
- **The tree:**
  - folders first; `.git` is never listed;
  - ignored files (`.gitignore`, via `git check-ignore`) are dimmed;
  - changed files take their git colour and letter (M, A, U, D, R, !);
  - folders with changes inside get a dot;
  - large trees are virtualised.
- **Click** a file: Preview. **Right-click:** Preview, Open in VS Code (your `code`), Show in the file
  manager, Ask Claude about this file / New chat in this folder, Copy path, Copy name, plus other
  add-ons' `context.file` entries.
- **Filter:** every word appears in the path; name matches come first. It uses `git ls-files -co
  --exclude-standard`, so ignored files are left out. Enter opens the first match.
- **Kept, not reloaded (D-344):** the tree lives in `store.ts`, one per project (folders shown, listings,
  opened folders, git states, the filter, the scroll position), not in the view. Switching to another
  view and back, or collapsing the sidebar, shows it at once where it was. The UI's `activate` reads
  the active project's folders at startup, view shown or not, and rereads in the background when the
  view is shown, on focus and on changes; a listing is only replaced when it differs, and a loading
  row only shows for a folder opened for the first time.
- **Live:** the active project's shown folders stay watched while it is active (shown or not): one
  recursive watch per folder on Windows and macOS (a change refreshes that folder at most once a
  second), dropped when another project becomes active or the add-on unloads. On Linux it checks
  every 5 s while Jig is visible, and on focus. A watch that fails, or whose folder is deleted, is
  closed (`watchLost`) and it checks every 5 s too.
- Search → Show files (`Ctrl+Shift+E`).

Logic in `lib/tree.ts` (tested); the kept tree, reads and watches in `store.ts`. Uses your own `git` and `code`.
