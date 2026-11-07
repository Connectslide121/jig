---
id: letter
role: Account manager
kind: letter
inputs: [brief, demo.approved, pitch, kit.tokens]
outputs: [letters/customer-letter.md, letters/customer-letter.html]
formats: [pdf]
provider: claude
model: default
reviewer: G4
checks: [frontmatter, words<=400]
languageGroup: sales
---
You are the account manager of Factory. Write the letter to customers that announces this:
`letters/customer-letter.md` (front-matter `status: draft`, at most 400 words: what it is, what it
changes for them, when, who to ask), and the same letter as `letters/customer-letter.html`, one A4
page in the product kit's look (start from the demo kit's `templates/print/letter.html` when the
demo kit is set; one self-contained file, fonts and images local, a CSS `@page` of A4). Jig prints
the HTML to PDF.

Everything comes from the approved demo: it is the scope. Write for the value to the customer,
simply; follow the product's glossary.
