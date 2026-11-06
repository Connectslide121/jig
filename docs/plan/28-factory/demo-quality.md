# Jig factory — demo quality, demo kit, design system

Part of [phase 28](../28-factory.md). "The demos must look super polished, never like generic MVPs"
(Jon), made checkable: every item below is an automated check, a template feature, or a scored
line of the critic's rubric.

## The quality bar

### Looks like a product (rubric)

- Built from a **product kit** (existing product) or a **chosen direction** (new brand): DTCG tokens
  for colour, type scale, spacing rhythm, radii, elevation and motion; never ad-hoc values.
- At most two typefaces; one icon set (Lucide); a clear hierarchy on every screen (one primary
  action, a scannable heading, secondary information quieter).
- The critic scores 8 axes from 1 to 5: **hierarchy, spacing rhythm, typography, colour, density,
  consistency, polish (states, motion, details), story**. Pass: average ≥ 4.0, no axis below 3.

### Feels real (rubric)

- Believable invented data: names and companies that fit the market, coherent numbers that add up,
  dates relative to today, enough rows to feel used (no "Item 1", no lorem ipsum).
- Every key screen in all its states: empty, loading (space reserved, skeletons), error,
  populated, long text and long names.
- Motion with a purpose, 150–250 ms, easing from the kit; reduced motion respected.

### Tells a story (template, the kit owns it)

- **Story mode**: the demo opens on a scenario ("A booking manager, Monday 08:00") with a "What to
  try" panel listing the main flow's steps; each step highlights where to click.
- **Presenter mode** for sales: arrow keys step through the flow with hotspots and a short caption.
- **PROTOTYPE · sample data** banner, version label (v2) and a change log; the recipe can't remove
  them.

### Holds up (automated, `npm run check` in the demo kit)

| Check | Pass |
|---|---|
| build | static folder, relative paths, opens from disk without a server or network |
| console | no errors or warnings on every route |
| viewports | screenshots at 1440, 1280, 834, 390 px for every route; no horizontal scroll |
| accessibility | axe-core: 0 serious or critical; text contrast AA; the main flow works by keyboard |
| layout shift | CLS ≈ 0 on every route and after every story-mode step (Jig's hard rule) |
| alignment | rows/tables: columns aligned, status at the right edge (critic + DOM heuristics) |
| template | banner, version and story mode present |
| real data | no e-mail addresses or phone numbers outside an allow-list of invented domains; no name from the product's real-customer list (`kit/real-names.txt`, never committed to a demo) |
| size | under 2 MB, fonts and images local |

Output: `check.json` (`{ pass, checks: [{ id, pass, detail }], screenshots: [...] }`) and the
screenshots, which the critic reads.

### Anti-generic list (the critic rejects)

Default purple/blue gradients; a centred-everything hero; emoji used as icons; filler KPI cards with
made-up "+12 %" that mean nothing; uniform large rounding on everything; an unthemed component
library look; three identical feature cards; stock "Dashboard / Analytics / Settings" navigation
that the idea doesn't need; Inter-on-white with no typographic decision (unless it is the product's
own kit).

## The critic loop (S6)

1. The demo builder finishes v<N> and runs `npm run check`.
2. The critic (on ChatGPT when signed in, D-436) gets the screenshots, `check.json`, the brief and
   the kit, and returns the scorecard and a **fix list** (concrete: screen, element, what to change).
3. Failing checks or a failing score → the builder fixes the list → back to 1. At most 3 rounds,
   then the run shows the best version with its scorecard and "needs you".
4. Only a passing version reaches G1. The scorecard shows on the Demo review tab.

## The demo kit (its own repository, D-431)

- **Stack (D-428):** Vite, React, TypeScript, Tailwind v4, shadcn/ui (Radix or Base UI primitives),
  Lucide, Motion for animation, TanStack Table, charts with shadcn's chart components (Recharts) and
  Tremor blocks (MIT) for dashboards. Hash routes, relative base, one static folder.
- **Shells:** sidebar app, top-nav app, phone frame, tablet frame, landing page.
- **Built in:** banner, version and change log, story mode, presenter mode, theme switch, a mock data
  module (typed, seeded, relative dates), reduced motion.
- **Blocks:** a private registry in shadcn's registry format, so demos pull polished parts by name:
  app shell, data table with filters, KPI strip, chart card, calendar/schedule, kanban, detail
  drawer, form in a modal, wizard, empty states, notifications, settings page, sign-in.
- **Storybook** catalogue of the kit and its blocks (DevX and the critic's reference).
- **Commands:** `npm run new -- <run-folder>` scaffolds a demo from a brief, `npm run dev`,
  `npm run build`, `npm run check`.

## Product kits

`<product repo>/.jig/factory/kit/`:

- `tokens.json` — DTCG 2025.10 design tokens, turned into CSS variables and a Tailwind theme by
  Style Dictionary v5 in the demo kit's build.
- `screenshots/` — a few real screens to match (the kit-extract recipe takes them with Jig's
  browser or Playwright on a local run).
- `brand.md` — logo files, name, voice and tone, do and don't.
- `glossary.md` — terms and names every recipe must use.

`kit-extract` builds it from the product's own styles (CSS variables, Tailwind config, theme files)
and screenshots. A **drift check** (a recipe on a schedule, or before each run) compares the kit
with the product's current tokens.

**New brands** (no product kit): the `directions` recipe makes 3 direction boards (name and logo as
you gave them, or invented when you said so (D-437), palette, type pairing, a sample screen in the
kit's shell); your pick at GD becomes the run's kit.

**Design inspiration (D-444):** the setting `factory.designSources` lists libraries of `DESIGN.md`
files (Google Stitch's format), for example github.com/VoltAgent/awesome-design-md. Only the
addresses are kept; `directions` reads them when it runs. Each direction names its reference ("in
the spirit of …") and borrows mood, rhythm and rules, never another brand's colours, logo or name.
The interview may ask "Feels like?" with a picker from the sources, and the critic scores the demo
against the reference's do's and don'ts. A product kit always wins over a reference.

## Skills and resources

Vendored into `skills/` like the existing catalogue (pinned, licences kept, reviewed text only, no
upstream scripts; D-432). Their scripts' jobs are done by the demo kit.

| Resource | Use in Jig factory | How |
|---|---|---|
| Anthropic `frontend-design` | art direction, avoiding generic looks | already bundled |
| Anthropic `web-artifacts-builder` | the React + Tailwind + shadcn build pattern and its anti-generic rules | vendor (text) |
| Anthropic `theme-factory` | generating direction boards for new brands | vendor (text) |
| Anthropic `webapp-testing` | Playwright checks of demos | vendor (text); the kit's `check` does it |
| Vercel `web-design-guidelines` (Web Interface Guidelines) | the critic's checklist | vendor (text, pinned copy of the guidelines) |
| Vercel `react-best-practices`, Jig `ui-ux-review`, `browser-verification`, `ai-feature-ux` | code quality, reviews, AI disclosure in demos | already bundled |
| A dataviz skill (palette, chart forms) | dashboards and charts in demos | if present in the workspace |
| shadcn/ui + registry, Tremor blocks, Motion, TanStack | the demo kit's building blocks | npm in the kit |
| DTCG 2025.10, Style Dictionary v5 | tokens as the contract between products and demos | npm in the kit |
| Storybook, Playwright `toHaveScreenshot`, `@axe-core/playwright` | the kit's catalogue and its checks | npm in the kit |
| Community design skills (e.g. "UI/UX Pro Max") | evaluate only: mine for rules, don't install blindly | review first |
| `DESIGN.md` libraries (e.g. VoltAgent `awesome-design-md`, MIT) | references for new brands' directions and the critic (D-444) | addresses in `factory.designSources`, read at run time |
| HyperFrames (Apache-2.0) | renders teasers from HTML to MP4, frame by frame (D-448) | npm in the kit (`npm run teaser`) |

Sources checked 2026-11-06: [DTCG first stable version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/),
[Tremor joins Vercel, blocks MIT](https://vercel.com/blog/vercel-acquires-tremor),
[Anthropic's official skills](https://codenote.net/en/posts/anthropic-official-skills-catalog-overview/),
[web-design-guidelines skill](https://skills.browseract.com/skills/vercel-labs_agent-skills_web-design-guidelines).
Verify licences in the upstream repositories before vendoring.
