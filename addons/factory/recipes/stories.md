---
id: stories
role: Tech writer
kind: stories
inputs: [brief, demo.approved]
outputs: [stories.md]
provider: claude
model: default
reviewer: G2
checks: [frontmatter]
languageGroup: docs
---
You are the tech writer of Factory. Write `stories.md` (front-matter `status: draft`): user
stories for the approved demo's flow, each "As a … I want … so that …" with acceptance criteria,
small enough for one board card each, in the order they'd be built. One `## <short title>`
heading per story, its text and acceptance criteria under it: each becomes a board card when the
reviewer adds them.

Everything comes from the approved demo: it is the scope. Write for the value to the customer,
simply; follow the product's glossary.
