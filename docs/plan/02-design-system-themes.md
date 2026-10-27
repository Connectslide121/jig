# Phase 2 — Design system & themes

**Goal:** one design system that every pixel goes through, so any theme — built-in or VS Code —
recolours the whole app, including add-ons.

**Done when:** all UI uses tokens (enforced by a check), Jig Dark/Light ship, a VS Code theme can be
imported from the local VS Code install, Open VSX or a file, and code blocks use the theme's syntax colours.

## Checklist

### Tokens
- [ ] Colour tokens as CSS variables, mapped into Tailwind v4 `@theme`
- [ ] Spacing, radius, typography scales (density + radius are style settings)
- [ ] Base component styles: button, input, card, list row, badge, tabs, menu, dialog, tooltip
- [ ] `scripts/check-tokens.mjs` — rejects raw colours / arbitrary values in UI code and add-ons
- [ ] `docs/reference/design-tokens.md`

### Themes
- [ ] `packages/themes`: theme model + validation
- [ ] Built-in themes: Jig Dark, Jig Light
- [ ] Colour utilities (parse, mix, contrast ratio, ensure-contrast) with tests
- [ ] VS Code theme mapper: token ← ordered VS Code keys + derived fallbacks + contrast pass
- [ ] JSONC parsing and `include` chains
- [ ] Terminal ANSI mapping
- [ ] Syntax highlighting via Shiki using the theme's `tokenColors`
- [ ] Source: installed VS Code / Insiders / Cursor / VSCodium extensions folders
- [ ] Source: Open VSX search + install (extract theme JSON only, never run anything)
- [ ] Source: files in `~/.jig/themes` (Jig or VS Code format), live reload on save
- [ ] Settings → Appearance: theme picker with live preview, follow system light/dark
- [ ] Style settings: density, radius, UI font, mono font, font size
- [ ] `docs/guides/themes.md`
