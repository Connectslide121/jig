# Backlog

Ideas and deferred work. Each entry says why it is here.

- **Sandboxed iframe runtime** for add-ons written by other people.
- **Mobile / remote access** to a running Jig.
- **Dropped: builder level 3 (Jig editing its own source).** Built and then removed (D-074): it needed a
  rebuild per change and a personal clone that drifts from upstream; Jon changes Jig's code himself when
  the slots aren't enough. The builder proposes the missing extension point instead. The removed code is
  in git history (commit "Builder level 3: …").
- **Git live refresh on Linux by watching folders** (D-098): needs a folder walker that follows
  `.gitignore` (Node's recursive watch can't leave `node_modules` out); until then Linux polls.
- **Language-server features in the editor** (Jon asked about Monaco, 2026-11-03): stay on CodeMirror
  (D-255 notes) and add errors, hover, go to definition and completion lists from language servers
  (typescript-language-server, C#, Python) run by the main process, like Copilot's. Monaco would bring
  TypeScript help without a server and VS Code's diff editor, but costs several MB, its own workers, a
  rewrite of every editor feature and weaker theme-token fit.
- **PDFs as project knowledge** (D-256): Jig has no PDF text extractor; PDFs are refused with a hint to
  save them as Word or text. Add one (pdf.js in the main process) when it's needed.
