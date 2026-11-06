# Building a demo with the kit

These rules are for whoever writes a demo (Jig, another agent, a person). The quality gate checks
most of them; the rest a reviewer will.

## Start

- `npm run new -- <folder> --name "<Product>"`, then edit `<folder>/demo.tsx`, `data.ts` and
  `screens/`. Look at `demos/sample` for a complete one.
- `demo.tsx` exports `defineDemo({...})`: name, tagline, version, shell (`sidebar`, `topnav`,
  `phone`, `tablet`, `landing`), routes, scenario, story, changes. Bump `version` and add a
  `changes` entry every time the demo changes for its audience.

## Use the kit

- Import from `@/kit` (Page, sample data, `fmt`, `scenarioTime`) and `@/blocks` (data table, KPI
  strip, chart card, schedule, kanban, detail drawer, form dialog, empty state, status). Use
  `@/components/ui/*` for anything smaller. Don't add UI libraries.
- Colours come from the brand kit's tokens only (`bg-card`, `text-muted-foreground`,
  `border-border`, `bg-primary`…). Never hard-code a colour.
- Size layouts by the container (`@container`, `@xl:`, `@max-xl:`), not the window: a demo is
  checked at 1440, 1280, 834 and 390 px.

## Make it believable

- One scenario: a person, a moment ("a dispatcher, 07:40"), and data that tells that moment's
  story. Time-based data uses a fixed `NOW = scenarioTime(h, m)`, never the real clock.
- Data is seeded (`seeded(n)`), so it is the same on every load. Names are invented; e-mail
  domains end in `.example` (or are listed in `allowDomains`). Never real people, companies,
  products, phone numbers or addresses.
- The story's steps point at elements with `data-demo="<target>"`; every target must exist on its
  route.

## Make it polished

- No layout shift: nothing on screen moves when something opens or loads. Forms and pickers are
  modals (`FormDialog`) or drawers (`DetailDrawer`), never inline expanding panels.
- Lists line up in columns: a fixed slot per element, numbers right-aligned, status badges at the
  far right edge.
- Whole rows and cards are the click target. Every button does something visible.
- Light and dark both look right; reduced motion is respected (the kit does this for its parts).

## Done means

`npm run check -- <folder>` passes, and you have looked at the screenshots in
`<folder>/check/screenshots/`.
