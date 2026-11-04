# Phase 23 — Jon's notes (November 2026)

**Goal:** the items from Jon's to-do list, grouped into work sessions that can each be done in one
go. Agreed with Jon on 2026-11-02 (D-246, D-247). Each session ends with `npm run check`,
`npm run e2e:changed`, docs and a decision record.

**Done when:** every session below is ticked, or moved to the backlog with a reason. **Done 2026-11-03.**

## Cleanup (done, D-246)

- [x] Git: the sync button is named by what it does (Pull ↓1, Push ↑2, Sync ↓1 ↑2, Publish, Up to
      date) with a tooltip naming commits and the remote branch; the Repos chip matches.
- [x] Home / project dashboard: no separate chat box; a New chat button with the folder picker;
      starters open a new chat with the message ready.
- [x] Meetings: the in-call device picker opens on the devices in use. Needs a check with real devices.

## Composer mentions (Jon, 2026-11-03, D-253)

- [x] Mentioned files in the message box are highlighted and open like links (Ctrl/Cmd+click), with a
      chip per mentioned file, folder or meeting above the text (click opens, × removes).

## Session 1 — Task queue: a queue per project, plan review, run history

- [x] **One queue per project**, each running independently, so agents in different projects
      never collide. Migrate today's single global `queue` into per-project queues.
- [x] **Review Claude's proposal as an editable task list:** when Claude calls `addon_tasks_add`,
      the approval shows the tasks as rows (title, prompt, project, chat grouping, files), editable
      and reorderable before approving, instead of the raw tool input. Done as the new
      `chat.permissionRenderer` slot (D-248): titles, prompts, remove, same chat, project, start now.
      Reordering and files stay in the queue itself after approving (Move up/down, Edit), to keep
      the card compact.
- [x] **Run history:** every run (Start until the queue finishes or stops) is kept automatically,
      with its overview table, per-task reports, time and cost. A History list per project opens any
      past run in the same results view. "Clear finished tasks" no longer loses results.
- [x] **Claude regroups and moves queued tasks** (added 2026-11-04, D-317): `addon_tasks_edit` takes
      `newChat` and `moveTo` (with `wholeChat`), by the drag-and-drop rules (D-307), so Claude never
      rewrites the queue with `jig_set_addon_data` to do it.
- [x] **Late reports, and no moving on while a chat still works** (added 2026-11-04, D-318): background
      work keeps a task open, one request from the queue for a missing report (none after you stopped
      the turn), `addon_tasks_report` with `taskId` for this chat's No report tasks, Ask for a report.

## Session 2 — Add-ons: restore and share edited built-ins

- [x] **Restore original:** a modified add-on (built-in or from the gallery) can go back to the
      version it came from, after a confirmation. Jig keeps the original to compare and restore.
- [x] **Share an edited built-in:** publishing it to the gallery makes a separate copy with its own
      id and name; installing it never touches the recipient's original.

## Session 3 — Meeting history in the main window

- [x] **Meetings view** in Jig's main window listing every saved meeting (renamed from "Saved
      meetings" to the meeting history), with search; no need to open the meeting window.
- [x] **Actions per meeting:** Start a chat about it, Write notes, Review actions → task queue,
      Copy / export as Markdown, Rename, Delete.
- [x] **Mention a meeting in a chat:** the composer's `@` picker also lists meetings; picking one
      makes Claude read it with `jig_meeting_read`.
- [x] **Shorter notes:** rewrite the notes prompt for concise output (a short summary, decisions,
      open questions, short actions; evidence only inside actions).

## Session 4 — Teams calls (research first)

- [x] Research with the ACS calling SDK Jig already uses (D-254): the Teams call agent places 1:1
      calls (`startCall` with the colleague's Entra object id) and receives them (`incomingCall`)
      with the existing Teams.ManageCalls consent; finding colleagues needs Graph User.ReadBasic.All
      and People.Read (Jon will ask for admin consent if needed). Teams rings on other devices too.
- [x] Then build: **Call…** in the meetings window (recent calls, people you work with, directory
      search), an incoming-call dialog with ringtone, system notification and Decline / Video /
      Answer, Hang up, Call back; calls are kept like meetings (captions, notes, actions). Jig rings
      while it runs: the meeting window starts hidden and closing it only hides it. Needs a real
      call to test (sign-in consent, captions in 1:1 calls, ringing at the same time as Teams).

## Session 5 — Azure DevOps boards per project, update progress

- [x] **Boards per project:** each Jig project picks its DevOps boards (several allowed); the view
      shows a tab per board. Built-in add-on `addons/boards` (D-251): boards are found in your
      organisations (no links to paste), shown with their real columns and cards like Azure DevOps.
- [x] **Boards load at startup, refresh in the background (Jon, 2026-11-04, D-302):** every followed
      board is fetched a few seconds after Jig starts and kept in the host (and in storage, for the
      next start); a tab shows its cached cards at once and refreshes behind them, with the refresh
      button turning and "updated N min ago" in fixed toolbar slots.
- [x] **Board search and filters (Jon, 2026-11-04, D-304):** a toolbar like Azure DevOps': search,
      Type / Assigned to / State / Tags / Iteration / Area pickers (multi-select menus), Clear filters;
      client-side, columns never move, remembered per board.
- [x] **Update progress:** while an update installs, show the installer or a progress window
      instead of Jig vanishing (D-252): an "Installing Jig X" modal says what happens next for 2 s,
      then the assisted installer shows its progress and starts Jig, which says "Updated to Jig X".
      Needs testing on Windows.

## Session 6 — Ghost-text code completion in the editor

- [x] Inline AI completions in the editor (Tab accepts) through GitHub's Copilot language server
      (`@github/copilot-language-server`), with the user's own Copilot sign-in kept inside that
      program. Completions only, never agent work (D-247). A status indicator in the editor.
      Done (D-255): downloaded from npm on setup (checksum checked), run with Electron's Node, LSP
      `textDocument/inlineCompletion`; ghost text, Tab, Esc; the status line names who completes.
      Needs a real Copilot account to test.
- [x] **Get started:** a "GitHub Copilot" row in the Get started list, marked **optional** ("only
      for code completion in the editor"), with its sign-in step; skipping it changes nothing else.
- [x] **Claude completions (Jon, 2026-11-02):** Settings → Editor → "Code completion with Claude",
      **off by default**. Off: Copilot completes when a Copilot account is signed in, otherwise
      nothing. On: Claude completes instead, with a model picker (**Haiku by default**; the list
      comes from the running Claude Code, not hard-coded). It goes through Claude Code like
      everything else (never the Anthropic API directly) and only after a typing pause, so it is
      slower than Copilot; measure the delay with a warm Claude Code process before shipping and
      note it in the setting's help text. Both settings go into `ConfigSchema`, `SETTINGS_GUIDE`
      and `docs/reference/state.md`; the Claude one is protected (it spends plan usage, D-077).
      Measured 2026-11-03 with a warm Claude Code and Haiku: about 0.9 s per suggestion (the first
      about 4.8 s while Claude Code starts), plus the 0.7 s pause; in the setting's help text.

## Session 7 — Project knowledge and claude.ai import

- [x] **Knowledge in Jig projects:** documents kept with a project; every chat in it is told they
      exist and can read them with a tool. Done (D-256): Knowledge on the project's Home (drop or
      Add files…: text, code, Word, Excel, PowerPoint), `jig_knowledge_read`, listed in each turn.
- [x] **Import from claude.ai's data export:** drop the export zip, pick projects, get Jig projects
      with their instructions and knowledge. First confirm the export contains knowledge documents.
      No claude.ai sign-in or internal endpoints (Jon chose the safe path, D-247). Built against the
      known `projects.json` shape (read leniently); **still to confirm with a real export.**
- [x] **Clear steps in the UI:** Projects → ⋯ → "Import from claude.ai…" opens a dialog (`Dialog`)
      that shows the numbered steps below as the first thing you see:
      - each step on its own line with its number, the exact menu names in bold (Settings,
        Privacy, Export data), and a short note on the email and the expiring link;
      - an **Open claude.ai settings** button (`openExternal`, the system browser, never inside Jig);
      - a fixed-size drop zone below the steps ("Drop the zip here, or Browse…"), so nothing moves
        when the file is read; then the list of found projects with checkboxes in the same space;
      - a line for Team/Enterprise plans ("Don't see Export data? Your organisation's owner
        exports it.").
      Also a line on "What Jig can do" and a Knowledge section empty state that links to it.

### How to get the claude.ai export zip (the text the dialog shows)

From Anthropic's help article "How can I export my Claude data?", written down from memory. Check
it against the current article and a real export before building the import, and update this list.

1. Open **claude.ai** in your normal web browser and sign in.
2. Click your **initials / name** at the bottom left, then **Settings**.
3. Open the **Privacy** section.
4. Click **Export data** and confirm.
5. Wait for the email from Anthropic (from minutes up to a few hours for large accounts). It has a
   **download link** that expires (about 24 hours), so download the zip soon.
6. Save the `.zip` file somewhere; don't unzip it. In Jig, drop it on the import dialog (or pick it
   with Browse…).

Notes:
- **Team / Enterprise plans:** individual members may not see Export data; the organisation's
  owner exports for the whole organisation (Settings → Data management or similar). Check this.
- **Expected contents** (to verify with a real export): `conversations.json`, `users.json` and
  `projects.json` (each project's name, description, instructions and knowledge documents with
  their text). If knowledge documents turn out to be missing or only names, the import brings
  instructions only and says which documents to add by hand.
- The zip holds all your conversations; Jig reads only `projects.json` and never stores the rest.
