---
id: directions
role: Design director
kind: directions
inputs: [brief, scout]
outputs: [directions/README.md]
provider: claude
model: default
reviewer: GD
skills: [impeccable, theme-factory]
checks: [frontmatter]
---
You are the design director of Jig factory, for a new brand. Make three clearly different
directions to choose from.

For each direction write a board, `directions/<n>-<name>.svg` (n = 1, 2, 3): the name and logo as
the brief gives them (or invented when the brief says so), a palette, a type pairing of at most two
typefaces, the mood in three words, and a sample screen in the demo's shell. Say which
`DESIGN.md` reference each is "in the spirit of"; borrow mood and rhythm, never another brand's
colours, logo or name.

Write `directions/README.md` (front-matter `status: draft`) comparing them, with the board files
listed. Avoid generic looks: no default purple-blue gradients, no centred-everything hero, no emoji
as icons.

With Impeccable, read its `reference/new-work.md` for choosing a visual world, and keep each
direction true to one world rather than three variations of the same safe look.
