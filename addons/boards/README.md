# Boards

Azure DevOps team boards per Jig project, laid out like Azure DevOps (D-251), through your own `az`
CLI (`az login` + the `azure-devops` extension). Jig stores no tokens (D-018).

- **Tenants (D-282, D-284):** a board remembers the tenant it was followed in (boards from before
  tenants: your own az login). While another tenant is active its tab shows one card, "In tenant X",
  and clicking it switches; the board reloads on every switch. Claude's board tools say so too.

- **Code → Boards** opens the view for the active project; each followed board is a tab named by its team and board ("Shop Team · Stories"; D-265) (⋯: Open in
  Azure DevOps, Rename…, Move left/right, Remove…).
- **Add boards (+):** your organisations (from the az login) and their projects; the project named
  like the Jig project is picked first. Every team's boards are listed (Stories, Features…); tick
  several and add them. Boards already followed show as added.
- **A board:** its real columns side by side with WIP limits, a card per work item (type colour, id,
  title, who has it, its state when it differs from the column). Done cards older than 30 days are
  left off.
- **Who has it (D-291):** each card shows its assignee as a round avatar at the far right of its
  last line, in a fixed slot (empty when unassigned), so nothing moves while pictures load: their
  Microsoft profile picture when the meeting sign-in can get it, otherwise initials; hover for name
  and e-mail. Matched by the work item's `System.AssignedTo` `uniqueName`. The card's detail shows
  the same avatar next to "Assigned to".
- **Manage it here (D-262):** click a card to open it in Jig: title, description, column, state,
  assignee, tags, priority, story points, the discussion (add a comment), area, iteration, parent and
  children; Save sends only what changed. Drag a card to another column (its column and the column's
  state go to Azure DevOps). + in a column's header adds a card there (in the team's area). ⋯ or
  right-click: Open, Start a chat about it, Move to, Open in Azure DevOps, Copy link, Copy #id,
  Delete… (to the recycle bin). The board reloads when anything changes, also from a chat.
- **Claude keeps it up to date:** tools `addon_boards_boards`, `_cards` (by column or text), `_card`
  (everything on one), `_update` (fields, state, column, comment), `_create` and `_delete`, for the
  chat's project. Changes ask your permission like other edits. A slider in the header sets one width for every column (kept for all projects, across restarts).
- **How:** `GET {team}/_apis/work/boards/{id}` (columns, state mappings, column field) and
  `teamsettings/teamfieldvalues` (the team's areas) through `az rest`, then one `az boards query`.
  Cards: `az boards work-item show/update/create` and `relation add`; comments, a type's states and
  deleting (`az boards work-item delete` answers in plain text) through `az rest`. Titles,
  descriptions and comments reach az as written, quotes and non-ASCII included (D-290).

Storage (project scope): `boards`, the followed boards; `selected`, the open tab. Global: `columnWidth`, the columns' width in px. Tested by `e2e/boards.spec.ts` with a fake `az`.
