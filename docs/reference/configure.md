# Configuring Jig from a chat

In any chat you can ask Claude to change Jig: "use the Dracula theme", "make it compact with 14 px
text", "move the terminals to the right", "turn off the Pipelines add-on", "rename this project to
Webshop and make it green", "find and install a Catppuccin theme", "look three folders deep for
repositories". Claude uses tools on Jig's `jig` MCP server (`main/configure/tools.ts`).

| Tool | Does | Asks you first |
|---|---|---|
| `jig_get_settings` | current settings (JSON) and what each means (`SETTINGS_GUIDE`) | no (read-only) |
| `jig_list_themes` | installed colour and file icon themes, the ones in use | no |
| `jig_find_themes { query }` | searches Open VSX | no |
| `jig_get_layout` | views per region, sizes, hidden views, every view id | no |
| `jig_list_addons` | add-ons and what they do | no |
| `jig_update_settings { patch }` | changes settings (validated against `ConfigSchema`; theme and icon-theme ids checked) | yes |
| `jig_change_layout { ops }` | move / hide / show / resize / collapse / expand | yes |
| `jig_set_addon_enabled { id, enabled }` | switches an add-on on or off | yes |
| `jig_update_project { projectId?, name?, color? }` | renames / recolours a project (default: the chat's project) | yes |
| `jig_install_theme { namespace, name }` | installs a theme extension from Open VSX (theme files only) | yes |

"Asks you first" is Claude Code's normal permission prompt (Allow once / Always allow / Deny); Jig
lets its read-only tools through without asking (`isReadOnlyJigTool` in `engine/claude.ts`).

Every change leaves a **change card** in the chat (`ChatItem` kind `change`): what changed
(`appearance.themeId: "jig-dark" → "vscode:dracula/dracula"`) and **Undo**, which applies the stored
inverse (`ConfigUndo`: a settings patch, the previous layout, the add-on's previous state, the
project's previous name/colour) through `sessions.undoChange`. Undo still works after a restart: the
inverse is stored with the card in the session file. Installing a theme has no Undo (remove it in
Settings → Appearance).

## Not changeable from a chat

`engine.claudePath`, `engine.allowApiKey` and `updates.*` (`PROTECTED_SETTINGS` in `shared/config.ts`):
they decide your billing, which program runs as Claude Code, and shell commands Jig runs. The tool
refuses them; change them in Settings.

## Adding a setting

Add it to `ConfigSchema`, to `SETTINGS_GUIDE` (so Claude knows what it does) and to
`docs/reference/state.md`. If it decides billing or runs programs, add it to `PROTECTED_SETTINGS`.
