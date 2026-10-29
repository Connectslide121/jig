# Phase 2 — Design system & themes

**Goal:** one design system that every pixel goes through, so any theme — built-in or VS Code —
recolours the whole app, including add-ons.

**Done when:** all UI uses tokens (enforced by a check), Jig Dark/Light ship, a VS Code theme can be
imported from the local VS Code install, Open VSX or a file, and code blocks use the theme's syntax colours.

## Checklist

### Tokens
- [x] Colour tokens as CSS variables, mapped into Tailwind v4 `@theme`
- [x] Spacing, radius, typography scales (density + radius are style settings)
- [x] Base component styles: button, input, card, list row, badge, tabs, menu, dialog, tooltip (`renderer/ui/`)
- [x] `scripts/check-tokens.ts` — rejects raw colours / arbitrary values in UI code and add-ons
- [x] `docs/reference/design-tokens.md`

### Themes
- [x] `packages/themes`: theme model + validation
- [x] Built-in themes: Jig Dark, Jig Light
- [x] Colour utilities (parse, mix, contrast ratio, ensure-contrast) with tests
- [x] VS Code theme mapper: token ← ordered VS Code keys + derived fallbacks + contrast pass
- [x] JSONC parsing and `include` chains
- [x] Terminal ANSI mapping
- [x] Syntax highlighting via Shiki using the theme's `tokenColors` (`renderer/lib/highlight.ts`)
- [x] Source: installed VS Code / Insiders / Cursor / VSCodium / Windsurf extensions folders + VS Code's built-in themes
- [x] Source: Open VSX search + install (extract theme JSON only, never run anything) — tested with a mocked API; open-vsx.org is blocked in the cloud container
- [x] Source: files in `~/.jig/themes` (Jig or VS Code format), live reload on save
- [x] Settings → Appearance: theme picker that applies only on selection, follow system light/dark
- [x] Style settings: density, radius, UI font, mono font, font size
- [x] `docs/guides/themes.md`

## Progress notes

`[~]` = code written but **not yet unit-tested or wired into the app** (first session). Next steps:

1. ~~Unit tests for `packages/themes`~~ — done (fixtures in `packages/themes/src/fixtures/`;
   `parseJsonc` is now string-aware for trailing commas; `ensureContrast` aims 1% above the target so
   hex rounding can't drop below it; Jig-format theme files in `user.ts`; Shiki theme in `shiki.ts`).
2. ~~Host theme service~~ — done:  (`apps/desktop/src/main/themes/`): list/get themes (built-in, `~/.jig/themes`,
   installed VS Code extensions, Open VSX installs), IPC methods `themes.list`, `themes.get`,
   `themes.searchOpenVsx`, `themes.installOpenVsx`, event `themes.changed`.
3. ~~Renderer: apply the active theme's CSS variables + style settings (density, radius, fonts, size);
   update the title-bar overlay colours; Shiki highlighter built from the theme's token colours.~~ — done.
4. ~~Settings → Appearance~~ — done with the settings tab (phase 3).
