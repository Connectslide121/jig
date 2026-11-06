# Boards

Azure DevOps team boards per Jig project, laid out like Azure DevOps (D-251), through your own `az`
CLI (`az login` + the `azure-devops` extension). Jig stores no tokens (D-018).

- **Tenants (D-282, D-284):** a board remembers the tenant it was followed in (boards from before
  tenants: your own az login). While another tenant is active its tab shows one card, "In tenant X",
  and clicking it switches; the board shows that tenant's cached cards (never another tenant's) and
  refreshes. Jig's board tools say so too.
- **Loaded at startup, refreshed in the background (D-302):** a few seconds after Jig starts, every
  followed board of every project in the active tenant is fetched, two at a time (and again every
  30 minutes, and for the new tenant after a switch); the host keeps the cards per tenant + board and
  in storage, so a restart shows them at once. Opening or switching to a tab shows the cached cards
  and refreshes behind them: the refresh button turns and "updated N min ago" sits beside it, in fixed
  slots. Changed cards update in place; a card being dragged or an open card isn't interrupted. The
  centred spinner is only for a board with nothing cached yet. One refresh per board at a time; while
  az says signed out or expired the board says so as before and background refreshes pause 5 minutes.

- **Code → Boards** opens the view for the active project; each followed board is a tab named by its team and board ("Shop Team · Stories"; D-265) (⋯: Open in
  Azure DevOps, Rename…, Move left/right, Remove…).
- **Add boards (+):** your organisations (from the az login) and their projects; the project named
  like the Jig project is picked first. Every team's boards are listed (Stories, Features…); tick
  several and add them. Boards already followed show as added.
- **A board:** its real columns side by side with WIP limits, a card per work item (type colour, id,
  title, who has it, its state when it differs from the column). Done cards older than 30 days are
  left off.
- **Search and filters (D-304):** a toolbar under the tabs, like Azure DevOps' filter bar: a search
  field (id, title, tags, who has it; every word must match; Esc clears; Ctrl+F or / on the board
  jumps to it), then pickers for Type, Assigned to (@Me, Unassigned and the board's people with their
  avatars), State, Tags, and Iteration and Area when the cards have them. Each picker is a menu with
  checkboxes (several at once, it stays open) and shows how many are picked; any value of one picker
  matches, all pickers must. Clear filters sits in a reserved slot. Filtering only hides cards: every
  column stays at its width, empty ones say "No cards match the filters", and counts read
  "shown/total". The funnel turns accent while filters are on. Remembered per board. In a narrow
  sidebar the pickers fold into one Filter button. The toolbar's right side: "updated N min ago",
  Refresh, New card (in the first column) and ⋯; the column width slider and Add boards (+) sit on
  the tab row.
- **Who has it (D-291):** each card shows its assignee as a round avatar at the far right of its
  last line, in a fixed slot (empty when unassigned), so nothing moves while pictures load: their
  Microsoft profile picture when the meeting sign-in can get it, otherwise initials; hover for name
  and e-mail. Matched by the work item's `System.AssignedTo` `uniqueName`. The card's detail shows
  the same avatar next to "Assigned to".
- **Manage it here (D-262):** click a card to open it in Jig: title, description, column, state,
  assignee, tags, priority, story points, the discussion (add a comment), area, iteration, parent and
  children; Save sends only what changed. Drag a card to another column (its column and the column's
  state go to Azure DevOps). + in a column's header adds a card there: see New card below. ⋯ or
  right-click: Open, Start a chat about it, Move to, Open in Azure DevOps, Copy link, Copy #id,
  Delete… (to the recycle bin). The board refreshes when anything changes, also from a chat.
- **A card like Azure DevOps' form (D-342):** the dialog keeps its size and has tabs Details · Links
  (n) · Attachments (n). **Details:** the description, acceptance criteria, repro steps, system info and
  custom HTML fields as rich text with their images, each editable in place (bold, italic, underline,
  lists and links in its header while you edit it); only fields you changed are sent, as HTML, with
  every image back on its attachment URL, so nothing is lost. Pasting images or files is refused (Jig
  can't upload attachments yet). The discussion as rich text. The side column: the fields you edit,
  then every other field with a value (Reason, Severity, Value area, Risk, Business value, Effort,
  estimates, dates, Found in, Custom.*), labelled by the type's field names. **Links:** development
  (pull requests with title and status, commits with their message, branches, builds), work items by
  link type with type colour, id, title and state (click: that card opens here), hyperlinks.
  **Attachments:** name, size, date; images open large in Jig, other files download in the browser.
  Rich text is sanitized (`sanitizeHtml`) and drawn in the theme's colours (`.jig-rich`); its links open
  in the browser. A rich pane waits for its images (one centred spinner), so nothing moves.
- **New card, the card's whole form (D-372):** + in a column (or New card in the toolbar) opens a
  dialog of the card dialog's size: title on top, the picked type's rich text on the left (Description,
  acceptance criteria, repro steps… as `typeForm` says), Type and the shared `EditFields` on the right
  (Column, State, Assigned to, Tags, Priority, Story points, Area, Iteration; the team's area and
  default iteration from `paths`). Switching type swaps the sections and states and disables number
  fields the type lacks. Create: one `az boards work-item create` with every field (`createArgs`),
  then its column and state, then a parent. Area and Iteration are pickers in an opened card too.
- **Images through your az login:** `attachment({ board, url })` downloads an attachment of the board's
  organisation with `az rest --output-file` into the add-on's data folder (`attachment-<id>`, reused)
  and answers a data URL; images only (by their bytes), up to 20 MB. Needs `fs:read`.
- **Jig keeps it up to date:** tools `addon_boards_boards`, `_cards` (by column or text), `_card`
  (everything on one, as plain text: images as `[image: name]`, the HTML only when it holds images), `_update` (fields, state, column, area, iteration, comment; `descriptionHtml` / `acceptanceHtml` keep images), `_create` (every field at once) and `_delete`, for the
  chat's project. `_cards` reads the cache when it's under a minute old. Changes ask your permission like other edits. A slider in the header sets one width for every column (kept for all projects, across restarts).
- **How:** `GET {team}/_apis/work/boards/{id}` (columns, state mappings, column field) and
  `teamsettings/teamfieldvalues` (the team's areas) through `az rest`, then one `az boards query`.
  Cards: `az boards work-item show/update/create` and `relation add`; comments, a type's states and fields, linked items (one `workitems?ids=` batch), pull requests, commits, builds, attachments and
  deleting (`az boards work-item delete` answers in plain text) through `az rest`. Titles,
  descriptions and comments reach az as written, quotes and non-ASCII included (D-290).

Storage (project scope): `boards`, the followed boards; `selected`, the open tab. Global: `columnWidth`, the columns' width in px; `filters` (project scope), each board's search and filters by board id; `cache`, each board's last cards keyed `tenant|org|project|team|boardId` (written by the host). The cache and merge logic is in `lib/cache.ts`, the filter logic in `lib/filter.ts`, a card's details (relations, development links, fields, attachments) in `lib/boards.ts` (all unit-tested; details in `lib/details.test.ts`, the new card's form in `lib/newcard.test.ts`). Cards also carry their tags, iteration and area (from the board query) for the filters. Tested by `e2e/boards.spec.ts` with a fake `az`.
