# Writing Jig factory recipes

A recipe is what one stage of a Jig factory run does: a Markdown file with front-matter, whose body is
the stage chat's instructions. The built-in ones are in `addons/factory/recipes/`. Reference:
[docs/reference/factory.md](../reference/factory.md).

## Override a recipe for one product

Put a file with the same `id` in the product repository's `.jig/factory/recipes/<id>.md`. Jig factory
reads it the next time a stage with that recipe starts (no restart). A file that doesn't validate is
left out, the built-in one is used, and the error shows in the run's Inspector.

## The format

```markdown
---
id: scout              # unique; the file name without .md
role: Scout            # how the chat is introduced
kind: scout            # the output kind (decides the gate that reviews it)
inputs: [brief]        # earlier outputs it reads
outputs: [scout.md]    # files it writes in docs/factory/<run>/
provider: claude       # claude or chatgpt (addons/shared/providers.ts)
model: default
reviewer: G0           # the gate that reviews its outputs
checks: [frontmatter]  # checks run on its outputs
skills: [impeccable]   # bundled skills the stage uses (Settings → Skills; must exist in skills/catalog.json)
---
You are the scout of Jig factory. …
```

The chat's prompt is the body plus the run: the brief, the plan, its inputs and outputs, any
feedback a gate asked for, and a "## Skills" section naming the skills. The chat ends its work with
`addon_factory_report` (summary, outputs, notes); a critique also reports `quality: {pass, score}`.
It may ask you one question with `addon_factory_ask`, and the interview asks question cards with
`addon_factory_questions`.

## Rules

- Write every output with front-matter `status: draft`; only people approve.
- Keep outputs in `docs/factory/<run>/` and commit nothing yourself: the Conductor commits each
  stage's files on the run's branch.
- Neutral names in examples (Contoso, Fabrikam); "Jig", not a provider's name, in text people read.
- Tests: `addons/factory/lib/recipes.test.ts` checks every built-in recipe (fields, skills, prompt).
