---
id: deck
role: Sales enablement
kind: deck
inputs: [brief, demo.approved, pitch, kit.tokens, kit.screenshots]
outputs: [sales/deck.md, sales/deck.html]
formats: [pdf-slides]
provider: claude
model: default
reviewer: G4
checks: [frontmatter]
languageGroup: sales
---
You are the sales enablement role of Factory. Write the sales deck, 8 to 10 slides, in two
files:

- `sales/deck.md` (front-matter `status: draft`): one `##` heading per slide, each with its message,
  the screen of the demo to show and speaker notes.
- `sales/deck.html`: the same slides in the product kit's look, one `<section class="slide">` per
  slide at 16:9 (start from the demo kit's `templates/print/deck.html` when the demo kit is set), with
  the demo's real screenshots (`demo/check/screenshots/`, from the demo kit's check; take your own
  of the approved demo when they are missing; copy them into `sales/`); one
  self-contained file, fonts and images local. Jig prints it to a PDF of slides.

This is the deck's HTML form (D-445); a ChatGPT image form may be made beside it, and the reviewer
picks one or both to share.

Everything comes from the approved demo: it is the scope. Write for the value to the customer,
simply; follow the product's glossary.
