# Notes

Short notes for the chat you're in, like the notes plugin (D-147): what it waits on, where its work
is, steps left for later, decisions and facts, links. You write them in the **Notes** view (right
sidebar; Tools → Show this chat's notes) and Claude writes them with its tools; Claude reads them
before it works in the chat.

- **Kinds:** ⏳ Waiting on (shown in amber until cleared), 📍 Where (a repository from your
  workspaces and a branch), ☐ To-do, 📝 Note, 🔗 Link (`label https://…`, with Open).
- **Pick a kind, type, Enter.** Waits and to-dos tick off and sink to the bottom; ✎ edits, ×
  removes. Order: open waits, where, open to-dos, notes, links, then what's done (`lib/notes.ts`).
- **Per chat:** the view follows the chat in front (`useActiveChat`), and the last one while another
  tab is in front. A new chat starts with none.
- **Claude's tools** (`contributes.tools`, every chat): `addon_notes_list` (read before working),
  `add`, `update` (ticks off too) and `remove`; each answers with the notes as they now stand. They
  only touch the chat's notes, so they run without asking. Their descriptions say what a note is
  for, and that notes are not a log of progress.
- Kept in the add-on's storage as `chat:<chat id>`; every change is announced (`changed`) so the
  view follows Claude's edits.

Unlike the plugin, Claude doesn't get the notes in every turn's system prompt (a Claude Code chat's
system prompt is fixed when it starts): it reads them with `addon_notes_list`, as its description
asks.
