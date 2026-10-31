# Project notes

Important knowledge **about the project**, shared across all its chats: lasting decisions,
constraints, facts, dependencies/blockers and useful project links. This is not a to-do list,
task reminder, progress log or handoff. Example: "Pipeline improvements are deferred until the
Jenkins-to-Azure-DevOps migration is complete."

- **Project notes** follows the active project, even without an open chat. New placements start
  in the left sidebar; existing saved layouts keep their placement. Search → Show this project's notes.
- **Kinds:** Waiting on, Note, Link. Confirmed cleared dependencies can be checked off; they sink
  to the bottom. Removed the task-oriented Where and To-do kinds.
- **Add / Edit** opens a modal; the list and its header stay in place. Remove deletes a note.
- **Claude** gets the calling chat's project notes with every message (`contributes.context`),
  including in already running chats. Always-loaded `addon_notes_list/add/update/remove` tools
  operate only on that chat's project. Chats without a project receive no notes; tools require a project.
- Guidance tells Claude to save only important context useful beyond the current task/chat,
  read before adding, update duplicates, remove obsolete facts and clear dependencies only when
  confirmed. No end-of-turn note quota. A blocker constrains its described work, not the whole project.
- **Storage:** `storage.scope: project`, key `notes`, explicit `{ scope: "project", id: projectId }`
  on host calls. Underlying key: `@project(<id>) notes` in `addon-data/notes.json`.
  Old global `chat:<id>` records are ignored, never promoted into project knowledge.
- UI and AI mutations are serialized per project in the add-on host; each emits `changed` with
  `projectId`. UI loads ignore stale responses when projects change; open editors close on a switch.
