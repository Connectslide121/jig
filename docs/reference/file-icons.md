# File icon themes reference

Jig shows files and folders with **VS Code file icon themes** (`contributes.iconThemes`), such as
Material Icon Theme or VS Code's own Seti, so Jig's icons look like your editor's.

Code: `packages/themes/src/fileIcons.ts` (format, `resolveFileIcon`, pure + tests),
`apps/desktop/src/main/themes/fileIcons.ts` (finding, loading, serving), `renderer/stores/fileIcons.ts`
and `renderer/ui/FileIcon.tsx` (the component), Settings UI `renderer/features/settings/FileIconSettings.tsx`.

## Choosing (Settings → Appearance → File icons)

`config.appearance.fileIconTheme`:

| Value | Icons |
|---|---|
| `vscode` (default) | the theme in VS Code's `workbench.iconTheme` (Seti if VS Code has settings but none is set), when it is installed; else Jig's |
| `jig` | Jig's own (lucide icons by kind: folder, code, JSON, image, script, archive, text, file) |
| a theme id (`vscode:pkief.material-icon-theme/material-icon-theme`, `openvsx:…`) | that theme |

VS Code's settings are read from `settings.json` of Code, Code - Insiders, Cursor, VSCodium and Windsurf
(`%APPDATA%\Code\User\settings.json` on Windows, `~/Library/Application Support/Code/User` on macOS,
`~/.config/Code/User` on Linux) — only the `workbench.iconTheme` value is used.

## Where themes come from

- Extensions installed in VS Code-family editors (the same folders as colour themes, including VS Code's
  built-in extensions for Seti).
- Open VSX: Settings → Appearance → Get themes. For an extension with icon themes, Jig extracts its
  JSON files plus icons and fonts (svg, png, jpg, gif, webp, woff, woff2, ttf, otf; ≤ 10 MB each) into
  `~/.jig/themes/openvsx/<namespace>.<name>/`. Nothing from an extension is executed.

## How a file picks its icon (`resolveFileIcon`)

Like VS Code, with the theme's `highContrast` and then `light` overrides (for light colour themes)
checked before the base associations at every step:

1. **Files:** `fileNames` (exact, then lower-case) → `fileExtensions` from the longest compound
   extension to the shortest (`cart.spec.ts` → `spec.ts`, then `ts`) → `languageIds` (the language VS Code
   would give the file: `languageIdForFile`, a table of common languages) → `file`.
2. **Folders:** `rootFolderNames(Expanded)` for a root → `folderNames(Expanded)` → `rootFolder(Expanded)`
   → `folderExpanded` / `folder`.

A mapping to an icon definition that doesn't exist is skipped. Font icons (`fontCharacter`, `fontColor`,
`fonts[]`) are drawn with the theme's font (an injected `@font-face`).

## Serving icons

`iconThemes.get` / `iconThemes.active` return the theme JSON with every `iconPath` and font `src` turned
into `jig-icons://<key>/<path>` (key = a hash of the extension folder). The `jig-icons:` protocol serves
only icon and font files of a loaded theme, inside its extension folder; paths that leave the folder or
other file types are dropped. The UI's CSP allows `jig-icons:` for images and fonts.

## Using it

- Core: Git changes and commit files, tabs that show a file (the image tab; add-on tabs whose params
  have `fileIcon: <path>`), chat tool cards for Read/Write/Edit, a build's changed files.
- Add-ons: `import { FileIcon } from "@jig/sdk/ui"` → `<FileIcon path="src/App.tsx" />`,
  `<FileIcon path="src" folder expanded />`; size it like a lucide icon (`className="size-3.5"`). Pass
  `fileIcon: path` in `ctx.openTab` params to give the tab the file's icon.
