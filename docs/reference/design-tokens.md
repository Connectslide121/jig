# Design tokens

Every colour, space, radius and type size in Jig's UI (and in add-ons) is a token. Themes change the
colour tokens; style settings change density, radius, fonts and size. Nothing else is allowed:
`npm run check:tokens` (`scripts/check-tokens.ts`, rules in `packages/sdk/src/tokenCheck.ts`) rejects
hex colours, colour functions (`rgb()`, `hsl()`, `oklch()`…), Tailwind palette colours (`text-red-500`)
and arbitrary values (`w-[13px]`) in `apps/desktop/src/renderer` and `addons/`. The only exception is
`var(--jig-…)` inside brackets (`max-h-[var(--jig-menu-max-h)]`). A line can opt out with
`jig-tokens-ignore-line` (only for things like the first-paint window colour).

Source: `apps/desktop/src/renderer/styles/tokens.css` (the only file with raw colours: fallbacks before
a theme is applied). The default Tailwind palette and type scale are removed, so only these exist.

## Colour tokens

CSS variable `--jig-<token>`; Tailwind colour name in brackets (use as `bg-…`, `text-…`, `border-…`).

| Token | Utility | Use for |
|---|---|---|
| `canvas` | `canvas` | app background, main area |
| `surface` | `surface` | sidebars, panels |
| `raised` | `raised` | inputs, cards, list items on a surface |
| `elevated` | `elevated` | menus, dialogs, popovers, tooltips |
| `titlebar` / `statusbar` | `titlebar` / `statusbar` | top bar / status bar background |
| `onStatusbar` | `on-statusbar` | text on the status bar |
| `line` / `lineStrong` | `line` / `line-strong` | dividers / input borders |
| `fg` / `muted` / `hint` | `fg` / `muted` / `hint` | primary / secondary / tertiary-placeholder text |
| `accent` / `accentHover` / `onAccent` | `accent` / `accent-hover` / `on-accent` | primary actions, links, active marks / text on accent |
| `hover` / `active` | `hover` / `active` | row and button hover / selected row or tab |
| `selection` | `selection` | text selection (may be translucent) |
| `focus` | `focus` | focus ring |
| `code` | `code` | code block background (also the Shiki background) |
| `success` `warning` `danger` `info` | same | status colours; `on-danger` for text on danger |
| `shadow` | — | used by `shadow-popover`, `shadow-card` and the dialog backdrop (`bg-shadow`) |

Soft variants for tinted backgrounds: `accent-soft`, `success-soft`, `warning-soft`, `danger-soft`,
`info-soft` (16 % of the colour over transparent).

Every theme guarantees readable text: the VS Code mapper runs a contrast pass (`fg` ≥ 4.5:1 on every
background it sits on, `muted` ≥ 4:1, `onAccent` ≥ 4.5:1 on `accent`, `hint` ≥ 2.6:1).

## Spacing, radius, type

| Scale | Tokens | Set by |
|---|---|---|
| Spacing | Tailwind's spacing scale × `--jig-spacing` (`p-2` = 2 × spacing) | density: comfortable `0.25rem`, compact `0.2rem` |
| Control height | `--jig-control-h` (7 × spacing) | density |
| Radius | `rounded-sm/md/lg/xl` = `--jig-radius-*` | radius: sharp 2/3/4/6 px, soft 4/6/10/14, round 6/9/14/20 |
| Type | `text-2xs` 10px, `text-xs` 11, `text-sm` 12, `text-base` 13, `text-lg` 15, `text-xl` 18, `text-2xl` 22 (at the default 13 px; all `rem`, so they follow the font-size setting) | font size (11–18 px) |
| Fonts | `font-sans` = `--jig-font-ui`, `font-mono` = `--jig-font-mono` | UI font / mono font settings |
| Shadows | `shadow-card`, `shadow-popover` | theme `shadow` colour |

Style settings → variables: `apps/desktop/src/renderer/lib/style.ts`.

## Base components (`apps/desktop/src/renderer/ui/`)

Reuse these before writing new ones; add-ons get the same components as `@jig/sdk/ui` (phase 6).

| Component | Notes |
|---|---|
| `Button` | `variant` primary / secondary / ghost / danger, `size` sm / md, `icon`, `busy` |
| `IconButton` | square icon button; `label` is the tooltip and accessible name; `active` |
| `Input`, `Textarea`, `Select`, `Switch` | form fields |
| `Card`, `Badge` (tones), `CountBadge`, `Kbd`, `Empty`, `SectionTitle` | containers and labels |
| `ListRow` | clickable row with `leading`, `trailing`, `description`, `selected` |
| `Tabs` | segmented tabs inside a view |
| `Menu`: `openMenu`, `openMenuAt`, `contextMenu`, `MenuButton`, `MenuHost` | every menu and right-click menu; items with icon, shortcut, checked, danger, submenu |
| `Dialog`, `confirmDialog`, `promptDialog`, `DialogHost` | modal dialogs; promise-based confirm and prompt |
| `Tooltip`, `Spinner` | |

Menu items use `text-sm`; small and regular text buttons use `text-sm`. Icon buttons increase from `size-6/7` to `size-7/8`, with icons from `size-3.5/4` to `size-4/4.5`. Appearance font size still scales every control.

Panel view tabs (Files, Pipelines, etc.) use `h-7`, `text-sm` and `size-4` icons. The top-bar action groups use `text-sm` to keep their labels quieter than panel content.

Regular text buttons use `text-sm` with `leading-none` and a non-shrinking `size-4` icon. Composer model/permission controls use the same text size and `size-3.5` icons. Panel view tabs use `text-sm`; toolbar icon-only buttons keep their larger sizes.

Menu hover/keyboard selection uses bg-accent-soft with an inset ring-accent/60 outline, rather than bg-hover against the elevated menu surface. The ring does not affect layout; disabled items do not receive this highlight. The all-tools picker uses the same treatment.
