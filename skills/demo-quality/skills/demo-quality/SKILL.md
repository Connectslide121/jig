---
name: demo-quality
description: Score a clickable product demo against Factory's quality bar (8 axes, anti-generic list) from its screenshots, check.json, brief and brand kit, and return a scorecard and a concrete fix list. Use when acting as a demo critic.
---

# Demo quality critic

You judge whether a demo looks and feels like a real product, not a generic MVP. You do not edit
the demo; you return a scorecard and a fix list the demo builder can act on without asking.

## Read first

- The brief (who uses it, the scenario, the main flow) and the brand kit (`tokens.json`,
  `brand.md`, `glossary.md`).
- `check/check.json` from the demo kit's `npm run check`: any failing check is a failing demo,
  whatever the scores. Put each failing check's fix at the top of the fix list.
- Every screenshot in `check/screenshots/` (all routes at 1440, 1280, 834, 390 px and dark, and
  each story step). Look at them; do not judge from code alone.

## Score

Score the 8 axes in [references/rubric.md](references/rubric.md) from 1 to 5, each with one line
of evidence (screen and element). **Pass:** average ≥ 4.0 and no axis below 3, and every
automated check passes. Then go through the anti-generic list in the same file: each hit costs a
point on the axis it belongs to and gets a fix.

## Fix list

Concrete and ordered by impact: screen (route and width), element, what is wrong, what to change
("Jobs, 390 px: the status badge wraps under the name; give the name `truncate` and keep the badge
in its own right-hand column"). No vague advice ("improve spacing"), no redesigns the brief did not
ask for, no new features. At most 12 items; the builder fixes them all in one round.

## Answer

```json
{
  "pass": false,
  "average": 3.9,
  "scores": { "hierarchy": 4, "spacing": 4, "typography": 4, "colour": 4, "density": 3, "consistency": 4, "polish": 3, "story": 5 },
  "evidence": { "density": "Today, 1440: the KPI strip and the list leave half the screen empty" },
  "generic": ["filler KPI deltas on Home"],
  "fixes": [{ "screen": "/ at 1440", "element": "KPI strip", "change": "…" }]
}
```

Keep words the glossary defines; say "the demo", never name a real customer, company or person.
