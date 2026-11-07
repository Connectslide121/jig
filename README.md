# Jig demo kit

The kit Jig factory builds clickable demos with: React, TypeScript, Vite, Tailwind v4, shadcn/ui,
and a set of shells, blocks and built-ins (version banner, change log, "What to try" story,
presenter mode, light/dark theme, reduced motion). A demo is a folder with a `demo.tsx`; it builds
to **one HTML file** that opens offline from disk.

## Commands

```bash
npm install && npm run setup        # once (setup installs Playwright's Chromium for the check)
npm run new -- <folder> --name "Contoso Rooms"   # a new demo from templates/demo
npm run dev -- <folder>             # the demo with hot reload (http://localhost:5173)
npm run build -- <folder>           # <folder>/dist/index.html, one self-contained file
npm run check -- <folder>           # the quality gate (below); writes <folder>/check/check.json
npm run typecheck && npm test       # the kit itself
npm run storybook                   # every shell and block, light and dark
npm run registry:build              # the block registry (shadcn format) into registry-dist/
```

`<folder>` may be anywhere (a factory run keeps its demo in the run's folder); relative paths are
taken from where you ran the command. The sample demo is `demos/sample`.

## The quality gate

`npm run check -- <folder>` builds the demo and opens it in Chromium with every network request
blocked. It walks every route at 1440, 1280, 834 and 390 px wide and in dark mode, and fails on:
missing built-ins, a file over the size limit, network requests, console errors or warnings,
horizontal overflow, serious accessibility problems (axe), layout shift, misaligned list columns, a
story step whose target is missing, and real-looking data (real e-mail domains, phone numbers,
names from `--names` or `real-names.txt`). Screenshots go to `<folder>/check/screenshots/`.
`check.json`'s format is in Jig's `docs/plan/28-factory/demo-quality.md`.

## Layout

- `src/kit/` — `defineDemo`, the app frame, shells, router, story, presenter, theme, sample data.
- `src/blocks/` — data table, KPI strip, chart card, schedule, kanban, detail drawer, form dialog,
  empty state, status badge. Also published through `registry.json`.
- `src/components/ui/` — shadcn/ui components (see NOTICE.md).
- `kits/<name>/` — a brand kit: `tokens.json` (DTCG), `brand.md`, `glossary.md`.
- `templates/print/` — the deck, one-pager and letter pages Jig factory prints to PDF.
- `templates/demo/` — what `npm run new` copies. `demos/sample/` — a complete example.

Writing a demo: read `AGENTS.md`.
