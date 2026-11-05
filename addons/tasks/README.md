# Tasks

A queue of prompts Claude works through one after another (D-182). Each task reports back how it
went, so you read the results as a table instead of scrolling one long chat.

- **Open it:** Chats → Task queue (it opens as a tab in the main area).
- **Add tasks** (D-186): the tasks grouped in chats, one field per task. A chat's first task starts a
  new chat. The wider dialog leaves more room for prompts, keeps its hint on one line, and places
  the batch Permissions control beside Cancel/Add in the footer (D-194). The next tasks
  ("Then, in this chat…") continue it, in order; **New chat with tasks**
  adds another chat. Each chat has its project; the permissions (Accept file edits by default, so the
  queue doesn't stop at every edit; Ask before edits; Plan only) are for all of them. A task's ⋯:
  Start a new chat from here, Move up/down, Remove; a chat's ⋯: Continue the chat before, Move
  up/down, Remove. Pasting a list (`-`, `1.`, `[ ]` …) into an empty task makes one task per item.
  ⋯ → Edit on a queued task changes its prompt, files, whether it continues the chat before, and
  permissions.
- **Files** (D-187): paste or drop images and documents into a task, or attach them with its
  paperclip, as in the chat (images ≤ 5 MB, PDFs, Word/Excel/PowerPoint, text files). In Add tasks,
  each prompt is 3 rows tall with a fixed file box beside it: one file per line (click to preview,
  × to remove), a "+N more" line (a menu to open or remove the rest) past 3, never a scrollbar; empty,
  it's a drop zone that attaches on click (D-212). Files never change the row's size.
  They go with the prompt and stay with the task: the results' **Files** column opens them
  (one directly, several from a menu), so do ⋯ → Files and the details. Run again sends them again.
  They're kept in `~/.jig/attachments/addon-tasks/` (copied into the chat when sent) and deleted when
  no task uses them any more (`unusedFiles`) or the dialog is cancelled (the host's `discard`).
- **Ticks, put back, start over** (D-279): every queued task has a tick, all ticked by default (a
  chat's tick and the header's tick several); Start takes only ticked tasks, the others stay queued
  as "Left out". ⋯ → **Put back in the queue** returns a finished, skipped or running task to queued
  in its place, as if it never ran (a running one asks first, pauses the queue and only stops
  following its chat). The view's ⋯ → **Start over…** puts every task back and takes the open run out
  of History.
- **Claude or ChatGPT (D-330):** the Queue tab's header has **Runs on** beside the project picker:
  **Project default** (the project's provider, else Jig's), **Claude** or **ChatGPT**, stored in the
  queue (`Queue.provider`). In **Add tasks** each chat has its own **Runs on** (Queue's choice,
  Claude or ChatGPT, each with a model: Default model or a family, "Opus (latest)", "Sol (latest)");
  it goes on the chat's first task (`Task.provider`, `Task.model`). **Edit** has the same; a task that
  continues the chat before shows that chat's provider, greyed out ("Same as the chat it continues"):
  a chat keeps its provider (D-309; only a limit handoff changes it, D-338), so its own choice is dropped. ChatGPT is greyed out with
  "Sign in on Get Started" (and an entry that opens it) while Codex isn't signed in. Every row and
  chat card shows the provider's mark in one column (the usage footer's), its tooltip says from where
  ("the queue's", "the project's default", "the chat it continues"); the details show provider and
  model; the All queues card shows the queue's provider beside its state.
  When a task starts, `runsOn` (`lib/tasks.ts`) decides: the chat it continues, else the task's choice,
  the queue's, the project's default; the chat's real provider and model are kept on the task
  (`ranOn`, `ranModel`). A task for ChatGPT while it isn't signed in ends **Blocked** ("ChatGPT isn't
  signed in") and pauses the queue with "Stop when a task fails" (`startFailed`). Claude's tools:
  `addon_tasks_add` tasks take `provider` and `model` (a model alone names its provider; refused on a
  task that continues a chat), `addon_tasks_edit` takes them per task (`"default"`/`null` back to the
  queue's choice) and `runsOn` for the queue; `addon_tasks_list` says who runs each task. The queue's
  context and `addon_tasks_report` reach ChatGPT chats too, through Jig's MCP server (D-313).
- **Start / Pause:** the queue runs in the add-on's host, so it goes on with the view closed. A task
  that needs you (a permission or a question) shows "Needs you" and notifies; answer in its chat and
  the queue goes on. The Tasks view's icon counts the tasks waiting for you, and "needs you", "paused"
  and "finished" are also system notifications when Jig isn't in front, with **Open Tasks** (D-215). With **Stop when a task fails** on (the default) a failed, blocked or broken task
  pauses the queue.
- **The report:** while a task runs, its chat is told (each turn, `contributes.context`) that it is
  task N of the queue (with its taskId) and to call `addon_tasks_report` when done: outcome (done,
  partial, failed, blocked), a summary, things to know, and follow-up tasks.
- **When a task is finished (D-318):** not while its chat works, waits for you (a question or a
  permission) or still runs something in the background (a command, a subagent, a monitor:
  `chats.get`'s `background`); that work wakes the chat when it ends. An idle chat with background
  work counts as finished only after 20 minutes without an answer (`BACKGROUND_WAIT_MS`). A turn that
  ends without a report gets one request from the queue (`nudgeText`, shown in the chat as "Task
  queue: asked for the report of task N" with the add-on's icon, not as your message): report it, or
  report partial/blocked with where it stands, and don't go on with the work. Only when that turn
  also ends without a report is the task "No report" (with Claude's last answer). No request when you
  stopped the turn or rejected a tool call in it (`chats.get`'s `userStoppedAt`): it stays No report,
  so nothing restarts work you stopped. The rules are `chatFinished`/`afterTurn` in `lib/tasks.ts`.
- **Late reports (D-318):** `addon_tasks_report` takes an optional `taskId`: a chat may report its
  own tasks that ended as No report or Interrupted (Jig closed), never another chat's. Without it, the
  report goes to the running task; once that has a report, to the chat's earliest task still missing
  one; with no running task, to the most recent one missing it (`reportTarget`). A late report sets
  the status from the outcome, keeps the times and cost, marks the row "reported late" (beside the
  title), and updates the run in History too. A late failed or blocked report pauses the queue (with
  "stop when a task fails") unless the chat already went on with a later task (`applyReport`).
  A same-chat task sent while earlier tasks of that chat miss their report starts by naming them by
  id and title (`pendingReportsNote`), as the running task's context does. **Ask for a report** (a No
  report row's ⋯, and its details) sends the chat the same request; it answers with a late report.
  The chat never needs `jig_set_addon_data` for the queue, and the tool says so.
- **Revised reports (D-353):** a chat may report its own ended task again, e.g. after you followed
  up in it and the work is finished: `addon_tasks_report` with that `taskId` (without one, once the
  chat has no running task and nothing unreported, its last reported task). The new report replaces
  the old one; the status follows the new outcome and the times and cost stay. The task keeps the
  report it replaced in `revised: { at, from }` (only the last one). The row shows a quiet pencil
  mark left of its status badge ("Reported again: was Partly done"), the details say "Revised …, was
  …", and Claude's list says "revised from …". A revision to failed or blocked pauses like a late
  report; no report ever starts or un-pauses the queue. A chat whose task ended keeps one line of
  context telling it it may report again (`taskContext`).
- **The results** (D-186): a bar and counts per status with the total time and cost, then a card per
  chat: its link (opens the chat), number of tasks, project, time, cost and "n of m finished". In it,
  a row per task: #, title (with "same chat", "queued by Claude", "a follow-up", non-default
  permissions), Claude's summary on two lines (or the error, or its last answer), started, notes,
  follow-ups, files, time, cost, and the status at the far right. Click a row for the details: project,
  chat, permissions, started, finished, time, cost and who queued it; summary, things to know,
  follow-ups each with **Add to queue** (or all), the prompt, Open chat and Run again. Right-click or
  ⋯: Edit, Move up/down (Alt+↑/↓ on a focused row), Move to top/bottom, Skip, Run again, Remove.
- **Reordering by drag and drop** (D-307): drag a queued task's row (a grip replaces its number on
  hover) or a chat card's header (the whole chat, when all its tasks are queued). A line shows where it
  lands, drawn over the edge or gap so nothing moves until the drop: inside a chat (the task continues
  that chat) or between chats (it starts its own; a whole chat only goes between chats). Nothing lands
  above or between tasks that ran. A chat whose first task moves away is started by its next task.
  The rules are `dropSlots`/`moveTasks`/`stepTasks` in `lib/tasks.ts`; the host's `move` takes
  `{ ids, slot }` (a drop) or `{ ids, to: -1 | 1 | "top" | "bottom" }` (a step).
- **Claude can queue tasks** (`addon_tasks_add`): "make a task for each spec in docs/specs" in any
  chat. Each prompt must stand alone. Claude starts the queue only when you say so, and you review
  the tasks first (it isn't read-only). `addon_tasks_list` shows the queue: this chat's project's,
  another's with `project` (name or id), or with `all` every project's, one line per task (id, status,
  title) under the project's name and id (D-326), so a chat anywhere finds a task and changes it with
  `addon_tasks_edit` and its `project`.
- **Claude can change queued tasks** (`addon_tasks_edit`, D-287): title, prompt, a paragraph appended
  to the prompt, or left out. Also (D-317) whether a task continues the previous task's chat
  (`newChat`; the first task in the queue can't, the one right after a task that ran can) and where it
  is (`moveTo`: `"top"`, `"bottom"`, `{ after: id }`, `{ before: id }`; `wholeChat` moves its whole
  chat). Moves go through the same `dropSlots` as a drag: inside a chat the task continues it, between
  chats it starts its own unless `newChat` is false; a whole chat only between chats; nothing above
  tasks that ran. Edits apply in order, all or nothing, and a refused one says why
  (`editTasks`/`setNewChat`/`moveTo` in `lib/tasks.ts`). Only queued tasks, and nothing else in the
  queue changes, so it is safe while the queue runs. Claude uses it instead of rewriting the queue with `jig_set_addon_data`,
  which now refuses to replace a key that changed since the chat read it.
- **What a running task's chat is told** (`contributes.context`, D-287): its place in the queue, how to
  report, and the titles of the tasks still queued (left-out ones marked), so it doesn't suggest work
  that is already planned as follow-ups.
- **How it follows the chats:** the host API `api.chats` (`create`, `send`, `get`; the `chat`
  permission) starts and reads chats, and main calls the host export `chatChanged` when a chat it
  started changes status. A watcher (every minute) catches up after a restart; a task whose chat
  went idle without answering is marked "Interrupted".
- **One queue per project** (D-248): the view's project picker (top right, with each project's
  status: "Needs you", "Running" or "N queued", in the menu's badge slot) switches; the view follows Jig's project picker; picking another project in the view only overrides what it
  shows, until the global project changes again. Queues run
  independently; the badge and "needs you" count every project. The old global queue is split by
  project the first time the host runs.
- **All queues** (D-326): the **All queues** button beside the project picker (and the picker's first
  item) opens the `dashboard` tab (`workbench.tab`; opening it again focuses it). A summary strip in
  fixed slots (queues running · tasks running · needs you · queued · finished today · cost today), then
  a card per project with tasks, in a grid sized by the container (1, 2 or 3 columns): needs you first,
  then running, paused with tasks queued, finished, the rest. Every card has the same rows: the project
  and its state badge (far right), a bar of the run (done, failed or blocked, needs you, running,
  queued), "4 of 12 finished · 1h 5m · $6.98", the task now (its chat, its time, and why it needs you:
  a question, a plan or a permission), the next two queued titles ("+N more") and the last finished
  task with its status; empty rows keep their place. Click a card for its queue in this view; the chat
  link opens the chat; Start/Pause on hover; right-click or ⋯: Open queue, Open current chat,
  Start/Pause. A footer says how many projects have no queue. The host's `dashboard` reads only the
  stored queues and histories (`lib/dashboard.ts` has the logic and its tests), and the tab reloads on
  `changed`. Why a task needs you comes from `chats.get`'s `waitingFor`, read once when its chat starts
  needing you and kept as the task's `waitingFor`.
- **Columns:** the queue and history tables share fixed-width, one-line, right-aligned columns
  (`COL` in `ui.tsx`), sized for their longest values ("10h 59m", "12:59 PM", "$99.99", "4 of 12
  finished"); the title takes the rest and truncates. Narrow containers drop Started, Notes,
  Follow-ups and Files first, then Time and Cost, then the hints beside titles (container variants on
  both sides, D-297).
- **History** (D-248): every Start opens a run; the tasks it starts belong to it, and it finishes
  when the queue does. The History tab lists runs (started, tasks, done, failed, time, cost, status);
  a run opens read-only (details, files, open chat, Run again, Queue every task again, Remove from
  history once finished). Clearing finished tasks keeps them in the history; the last 200 runs are
  kept, and their files stay until the run is removed.
- **Reviewing Claude's tasks** (D-248): `addon_tasks_add` shows `ReviewTasks` (the
  `chat.permissionRenderer` slot) instead of the plain approval: edit titles and prompts, remove
  tasks, pick the project, start now or not, then "Queue N tasks" or "Don't queue".
- Kept in the add-on's project storage as `queue` and `history` (`lib/tasks.ts` has the logic and its
  tests).


- **Reviewed meeting actions** (D-217): the shared addReviewed host export accepts a title, standalone
  prompt, destination project and stable source id. It deduplicates retries and pauses the queue;
  it never starts a chat or runs an action automatically. Meetings' review modal is the user action.
