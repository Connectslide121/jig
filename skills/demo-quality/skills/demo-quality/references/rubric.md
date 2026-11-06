# Jig factory demo rubric

From Jig's `docs/plan/28-factory/demo-quality.md`. Each axis scores 1–5:
5 = a shipped product you would pay for, 4 = polished with small slips, 3 = acceptable but plain,
2 = visibly unfinished, 1 = broken or placeholder.

| Axis | 5 looks like |
|---|---|
| **hierarchy** | each screen has one primary action and a scannable heading; secondary information is quieter; the eye lands where the scenario needs it |
| **spacing** | one spacing rhythm from the kit; related things close, groups separated; nothing cramped or floating |
| **typography** | at most two typefaces; a clear type scale; tabular numbers in tables and KPIs; sentence-case headings; no orphaned one-word lines |
| **colour** | tokens only; the primary colour marks actions and the current place; status colours only for status; light and dark both right; AA contrast |
| **density** | fits the persona's work (a dispatcher sees many jobs at once, a buyer sees fewer, larger things); no half-empty screens, no walls of text |
| **consistency** | the same thing looks and is named the same everywhere (glossary); one icon set; aligned columns, status at the right edge of every row |
| **polish** | every key screen has empty, loading (space reserved), error, long-text states; motion 150–250 ms with a purpose; reduced motion respected; no layout shift; every visible control does something |
| **story** | opens on the scenario's moment; believable seeded data that adds up (no "Item 1", no lorem ipsum, dates relative to the scenario); the "What to try" steps walk the main flow and each points at a real element |

## Anti-generic list (each hit is a fix)

- Default purple/blue gradients.
- A centred-everything hero.
- Emoji used as icons.
- Filler KPI cards with made-up "+12 %" that mean nothing to the persona.
- Uniform large rounding on everything.
- An unthemed component-library look (the kit's tokens not applied).
- Three identical feature cards.
- Stock "Dashboard / Analytics / Settings" navigation the idea doesn't need.
- Inter on white with no typographic decision (unless it is the product's own kit).

## Automated checks (from check.json; any failure fails the demo)

build, size (under 2 MB), template (banner, version, story), offline, console, viewports (no
horizontal scroll at 1440/1280/834/390), accessibility (axe: 0 serious or critical), layout shift
(CLS ≈ 0 per route and story step), alignment, story (every target exists), real data (no real
e-mail domains, phone numbers or names from the product's real-names list).

The pinned Web Interface Guidelines (skill `web-design-guidelines`,
`references/web-interface-guidelines.md`) are the checklist for a closer pass on details.
