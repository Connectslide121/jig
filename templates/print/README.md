# Print templates

Self-contained HTML pages Jig factory's pack stages start from (D-445, D-467). Jig prints them to PDF
(`capture.pdf`): the deck at 16:9 (one `<section class="slide">` per slide), the one-pager and the
letter on A4. They take no scripts, fonts or images from the web: copy what a page needs next to it.

- `deck.html` — slides: title, statement, screenshot with a caption, bullets, next step.
- `one-pager.html` — problem, value, three features with screenshots, the next step.
- `letter.html` — a customer letter: sender, recipient, date, subject, body, signature.

Fill the `:root` variables from the product kit's `tokens.json` (`color.*`, `font.*`), keep the
`PROTOTYPE · sample data` mark on pages that show the demo, and replace every `{{…}}` placeholder.
