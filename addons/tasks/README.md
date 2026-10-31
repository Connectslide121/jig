# Tasks

A queue of prompts Claude works through one after another (D-182). Each task reports back how it
went, so you read the results as a table instead of scrolling one long chat.

- **Open it:** Chats → Task queue (it opens as a tab in the main area).
- **Add tasks** (D-186): the tasks grouped in chats, one field per task. A chat's first task starts a
  new chat and the next ones ("Then, in this chat…") continue it, in order; **New chat with tasks**
  adds another chat. Each chat has its project; the permissions (Accept file edits by default, so the
  queue doesn't stop at every edit; Ask before edits; Plan only) are for all of them. A task's ⋯:
  Start a new chat from here, Move up/down, Remove; a chat's ⋯: Continue the chat before, Move
  up/down, Remove. Pasting a list (`-`, `1.`, `[ ]` …) into an empty task makes one task per item.
  ⋯ → Edit on a queued task changes its prompt, files, whether it continues the chat before, and
  permissions.
- **Files** (D-187): paste or drop images and documents into a task, or attach them with its
  paperclip, as in the chat (images ≤ 5 MB, PDFs, Word/Excel/PowerPoint, text files). In Add tasks,
  compact filename chips sit beside the single-line prompt in a reserved horizontal scroll area;
  click to preview, × to remove. Files never increase the row height or change the prompt width.
  They go with the prompt and stay with the task: the results' **Files** column opens them
  (one directly, several from a menu), so do ⋯ → Files and the details. Run again sends them again.
  They're kept in `~/.jig/attachments/addon-tasks/` (copied into the chat when sent) and deleted when
  no task uses them any more (`unusedFiles`) or the dialog is cancelled (the host's `discard`).
- **Start / Pause:** the queue runs in the add-on's host, so it goes on with the view closed. A task
  that needs you (a permission or a question) shows "Needs you" and notifies; answer in its chat and
  the queue goes on. With **Stop when a task fails** on (the default) a failed, blocked or broken task
  pauses the queue.
- **The report:** while a task runs, its chat is told (each turn, `contributes.context`) that it is
  task N of the queue and to call `addon_tasks_report` when done: outcome (done, partial, failed,
  blocked), a summary, things to know, and follow-up tasks. A chat that ends without reporting shows
  "No report" with Claude's last answer.
- **The results** (D-186): a bar and counts per status with the total time and cost, then a card per
  chat: its link (opens the chat), number of tasks, project, time, cost and "n of m finished". In it,
  a row per task: #, title (with "same chat", "queued by Claude", "a follow-up", non-default
  permissions), Claude's summary on two lines (or the error, or its last answer), started, notes,
  follow-ups, files, time, cost, and the status at the far right. Click a row for the details: project,
  chat, permissions, started, finished, time, cost and who queued it; summary, things to know,
  follow-ups each with **Add to queue** (or all), the prompt, Open chat and Run again. Right-click or
  ⋯: Edit, Move up/down, Skip, Run again, Remove.
- **Claude can queue tasks** (`addon_tasks_add`): "make a task for each spec in docs/specs" in any
  chat. Each prompt must stand alone. Claude starts the queue only when you say so, and you approve
  the tool call (it isn't read-only). `addon_tasks_list` shows the queue.
- **How it follows the chats:** the host API `api.chats` (`create`, `send`, `get`; the `chat`
  permission) starts and reads chats, and main calls the host export `chatChanged` when a chat it
  started changes status. A watcher (every minute) catches up after a restart; a task whose chat
  went idle without answering is marked "Interrupted".
- Kept in the add-on's global storage as `queue` (`lib/tasks.ts` has the logic and its tests).
