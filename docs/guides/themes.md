# Themes

A theme sets Jig's colour tokens (`docs/reference/design-tokens.md`), the terminal palette and the
syntax colours. Layout, spacing and typography are Jig's own and are changed with the style settings
(Settings → Appearance: density, corners, fonts, size).

## Where themes come from

| Source | Id | How |
|---|---|---|
| Built in | `jig-dark`, `jig-light` | always there |
| Your files | `user:<file name>` | `.json`/`.jsonc` files in `~/.jig/themes` (Jig or VS Code format); saved changes apply immediately |
| Installed editors | `vscode:<publisher.name>/<theme>` | colour themes of the extensions in `~/.vscode`, `~/.vscode-insiders`, `~/.cursor`, `~/.vscode-oss`, `~/.windsurf` (`…/extensions`), plus VS Code's own built-in themes (Dark Modern, Light+, Monokai…) from its install folder |
| Open VSX | `openvsx:<namespace.name>/<theme>` | Settings → Appearance → Get themes: search open-vsx.org and install |

Nothing from an extension is executed. Jig reads only `package.json` (`contributes.themes`),
`package.nls.json` (localised labels) and the theme JSON files; from an Open VSX `.vsix` only those
files are extracted (into `~/.jig/themes/openvsx/`). The Microsoft Marketplace is not used (D-010).

## Jig-format theme file

Set only what you want; everything else comes from Jig Dark or Jig Light (`appearance`).

```jsonc
// ~/.jig/themes/workshop.json
{
  "label": "Workshop",
  "appearance": "dark",
  "colors": { "accent": "#7fb685", "canvas": "#1b1d1a" },
  "terminal": { "green": "#7fb685" },
  "tokenColors": [{ "scope": "comment", "settings": { "foreground": "#6b7266", "fontStyle": "italic" } }]
}
```

Token names are in `packages/themes/src/model.ts` (`COLOR_TOKENS`). A file is read as Jig format when
it has `appearance` and its `colors` keys contain no dots; otherwise it is read as a VS Code theme.

## How a VS Code theme is mapped (`packages/themes/src/vscode.ts`)

1. **JSONC + includes.** Comments and trailing commas are allowed; `include` chains are followed (inside
   the extension folder only) and merged: the including theme wins, token colours are concatenated.
2. **Dark or light** from `uiTheme`/`type`, else from the editor background.
3. **Tokens.** Each Jig token has an ordered list of VS Code keys (e.g. `surface` ←
   `sideBar.background`, `panel.background`, `editorGroupHeader.tabsBackground`) with a derived
   fallback (mixes of canvas and foreground). Translucent colours are painted over their base.
4. **Contrast pass.** Text tokens are nudged until they are readable on their backgrounds.
5. **Terminal** colours come from `terminal.ansi*` (VS Code's defaults for the rest).
6. **Syntax** colours are the theme's own `tokenColors`, used as-is by Shiki (`packages/themes/src/shiki.ts`,
   `apps/desktop/src/renderer/lib/highlight.ts`), so code looks exactly like in VS Code.

If a VS Code theme looks wrong in one place, the fix usually belongs in the key list for that token.
Tests with theme fixtures are in `packages/themes/src/vscode.test.ts`.

## How it is applied

`useThemeController` (`renderer/lib/theme.ts`) picks the theme id (`appearance.themeId`, or the
light/dark pair when "follow system" is on), asks the host for it (`themes.get`), writes the `--jig-*`
variables and the style variables on `<html>`, recolours the window controls and reloads the
highlighter. It re-runs on `config.changed`, `themes.changed` and OS light/dark changes. A theme that
fails to load falls back to Jig Dark/Light and the error is shown in Settings → Appearance.

## File icons

Settings → Appearance → **File icons** picks the icons for files and folders. By default Jig uses the
icon theme your VS Code uses (for example Material Icon Theme), read from your VS Code's extensions and
settings — nothing to set up. You can also choose Jig's own icons, any other installed icon theme, or
install one from Open VSX (search "material icon theme" under Get themes). Details:
`docs/reference/file-icons.md`.

