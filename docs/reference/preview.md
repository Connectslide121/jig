# File previews

The **Preview** tab (`jig.preview`, `renderer/features/preview/`) shows a file the way it's meant to be
read. Open it from:
- the Git panel (right-click a change → Preview);
- a chat tool card (the eye on Read/Write/Edit of a file);
- an attachment chip;
- a link inside a previewed Markdown file;
- Tools → Preview a file…;
- add-ons: `ctx.openPreview(path)`.

| Kind | Files | Shown as |
| --- | --- | --- |
| Markdown | `.md .markdown .mdx` | rendered (GitHub style), relative images, links to other files open their preview, ```` ```mermaid ```` diagrams |
| HTML | `.html .htm` | a page (`<!doctype>`, `<html>`, `<head>` or `<body>`, no template syntax) in a sandboxed frame (never same-origin); **Run scripts** turns scripts on. Component templates (`*.component.html`, Angular `@if`/`*ngIf`/bindings/`{{ }}`, Vue, Jinja, Razor) and fragments open as **Source**, Preview a click away (`isHtmlPage`, D-154); an Angular template is edited with Angular's grammar (`@codemirror/lang-angular`: interpolation, bindings, events, directives) and its `@if`/`@for`/`@switch`/`@defer`/`@let` blocks in the keyword colour (`isAngularTemplate`, `editorSyntax`, D-155). In every markup file each element's tag is in a colour of its own (D-156) |
| PDF | `.pdf` | Chromium's PDF viewer (`plugins: true` in the window) |
| Table | `.csv .tsv` | table with row filter (delimiter guessed: `,` `;` tab) |
| Excel | `.xlsx` | sheets as tables (`xlsxToSheets` in `@jig/documents`) |
| JSON | `.json .jsonc .geojson .webmanifest` | collapsible tree (comments and trailing commas allowed) |
| Notebook | `.ipynb` | Markdown cells, code cells, text/image/error outputs |
| Diagram | `.mmd .mermaid` | Mermaid, in the theme's colours |
| Image, SVG | `.png .jpg .gif .webp .bmp .ico .avif .svg` | fit / actual size |
| Audio, video | `.mp3 .wav .ogg .m4a .flac .mp4 .webm .mov .m4v` | players (seeking works: Range requests) |
| Word, PowerPoint | `.docx .pptx` | the extracted text |
| Diff | `.diff .patch` | coloured lines |
| Anything else | text | highlighted code (plain above 300 KB); binary files say there is no preview |

Kinds with a rendered and a raw form (Markdown, HTML, JSON, notebooks, SVG, diagrams, tables, diffs)
have a **Preview / Source** switch. Every preview has **Ask Claude**: a new chat with a request suited to
the file (review a document, summarise data, explain code), typed in and not sent.

## Editing

Code and text files are **always editable** in the Preview tab (D-101). Kinds with a rendered form
(Markdown, HTML, JSON, SVG, diagrams, tables, diffs, notebooks) are editable in **Source**.
- **The editor** is CodeMirror 6 (`CodeEditor.tsx`, D-118). The code takes the **theme's own syntax
  colours** (its `tokenColors`, matched to CodeMirror's tags in `editorSyntax.ts` through
  `syntaxStyles` in `@jig/themes`), so an imported VS Code theme looks as it does in VS Code and in
  the chat's code blocks; the frame uses Jig's tokens. The file's language loads on demand
  (`@codemirror/language-data`), by name or by a `#!` line.
- **Editing:** line numbers, folding (gutter, `Ctrl+Shift+[` / `]`, Fold all), indentation guides,
  bracket matching, closing brackets and quotes, several cursors (Alt+click, Alt+drag for a column,
  `Ctrl+D` for the next match), move/copy lines (`Alt+↑↓`, `Shift+Alt+↑↓`), toggle comment
  (`Ctrl+/`), find and replace (`Ctrl+F`), go to line (`Ctrl+G`).
- **Indentation** follows the file (`detectIndent` in `shared/indent.ts`: tabs, or the common number
  of spaces); a file without any uses `editor.tabSize`. The status line changes it for the file.
- **The status line:** line and column (click: go to line), cursors or selected characters,
  indentation, line endings (`CRLF`/`LF`, kept on save), language, and toggles for word wrap and
  whitespace (`editor.wordWrap`, `editor.showWhitespace`), plus ⋯ (find, go to line, comment, fold,
  close brackets). Settings → Editor has the same settings.
- **Saving:** `Ctrl+S`, or **Save** in the header while there are unsaved edits. It goes through
  `files.write`, inside a workspace or a file you opened in Preview. Windows line endings are kept.
  It writes a temporary file next to it and renames it over the file (retrying briefly while a
  scanner holds it); when Windows still refuses because another program has the file open, it
  writes into the file instead.
- **A change on disk while you have unsaved edits** (Claude edits the file) doesn't replace them. A
  bar asks: **Keep mine** (save over it), **Load theirs** (drop your edits), **Show diff** (− on
  disk, + yours, `shared/lineDiff.ts`). Saving also refuses when the file changed since you opened it.
- **Unsaved edits:** the tab shows a dot; closing it asks first, and the tab limit never closes it.
- Files cut at 2 MB stay read-only. No language servers (no completion, errors or go to definition):
  Claude does that work in Jig, and VS Code is one click away (Open in VS Code).

## How it works

- `files.preview { path }` (host, `main/files/preview.ts`) returns the kind, size and change time, the
  text (up to 2 MB), extracted Office content, and two `jig-file:` addresses: the file and its folder.
- `jig-file://<grant>/<path>` serves files for previews. A grant is created for the file's project
  folder (or its own folder when it's in no project). Only files inside a grant are served, with a CSP
  that limits a page to its own folder and no network.
- The tab polls `files.stat` every 1.5 s while visible and reloads when the file changes, so it follows
  Claude's edits.
- Mermaid (`ui/Mermaid.tsx`) loads on first use, renders with `securityLevel: "strict"` and takes the
  theme's colours. Chats render ```` ```mermaid ```` blocks as diagrams too.

Markdown file previews parse embedded HTML with rehype-raw followed by the GitHub-style rehype-sanitize allowlist. Safe headings, alignment, details, tables, links and images render; scripts, handlers, styles and frames are removed. Relative images/links still resolve through the existing jig-file grants; image dimensions are retained. Chat Markdown keeps escaping HTML.

Markdown table components preserve sanitized cell spans (`colspan`/`rowspan`), widths and horizontal/vertical alignment from HTML, plus GFM alignment. Tables fill their available width with horizontal overflow contained by a wrapper. This keeps README galleries with full-width rows and two-column image rows intact.
