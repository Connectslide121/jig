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
| HTML | `.html .htm` | the page in a sandboxed frame (never same-origin); **Run scripts** turns scripts on |
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
