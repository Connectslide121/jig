# Boards

Azure DevOps team boards per Jig project, laid out like Azure DevOps (D-251), through your own `az`
CLI (`az login` + the `azure-devops` extension). Jig stores no tokens (D-018).

- **Code → Boards** opens the view for the active project; each followed board is a tab (⋯: Open in
  Azure DevOps, Rename…, Move left/right, Remove…).
- **Add boards (+):** your organisations (from the az login) and their projects; the project named
  like the Jig project is picked first. Every team's boards are listed (Stories, Features…); tick
  several and add them. Boards already followed show as added.
- **A board:** its real columns side by side with WIP limits, a card per work item (type colour, id,
  title, who has it, its state when it differs from the column). Click a card to open it in Azure
  DevOps; ⋯ or right-click: Start a chat about it, Copy link, Copy #id. Done cards older than 30 days
  are left off. A slider in the header sets one width for every column (kept per project).
- **How:** `GET {team}/_apis/work/boards/{id}` (columns, state mappings, column field) and
  `teamsettings/teamfieldvalues` (the team's areas) through `az rest`, then one `az boards query`.

Storage (project scope): `boards`, the followed boards; `columnWidth`, the columns' width in px. Tested by `e2e/boards.spec.ts` with a fake `az`.
