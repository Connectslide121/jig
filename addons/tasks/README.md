# Tasks

A queue of prompts Claude works through one after another (D-182). Each task reports back how it
went, so you read the results as a table instead of scrolling one long chat.

- **Open it:** Chats → Task queue (it opens as a tab in the main area).
- **Add tasks:** one prompt, or many at once with "Each line is its own task" (list marks such as
  `-` or `1.` are dropped). Pick the project and the permissions (Accept file edits by default, so
  the queue doesn't stop at every edit; Ask before edits; Plan only). "Continue the previous task's
  chat" makes a task continue the chat of the task before it (same project); otherwise each starts
  its own chat. You decide per task: ⋯ → Edit.
- **Start / Pause:** the queue runs in the add-on's host, so it goes on with the view closed. A task
  that needs you (a permission or a question) shows "Needs you" and notifies; answer in its chat and
  the queue goes on. With **Stop when a task fails** on (the default) a failed, blocked or broken task
  pauses the queue.
- **The report:** while a task runs, its chat is told (each turn, `contributes.context`) that it is
  task N of the queue and to call `addon_tasks_report` when done: outcome (done, partial, failed,
  blocked), a summary, things to know, and follow-up tasks. A chat that ends without reporting shows
  "No report" with Claude's last answer.
- **The table:** #, task (with its summary), project, chat (a link that opens it; the icon says new
  chat or continued), follow-ups, time, cost, and the status at the far right. Click a row for the
  details: summary, things to know, follow-ups each with **Add to queue** (or all), the prompt,
  Open chat and Run again. Right-click or ⋯: Edit, Move up/down, Skip, Run again, Remove.
- **Claude can queue tasks** (`addon_tasks_add`): "make a task for each spec in docs/specs" in any
  chat. Each prompt must stand alone. Claude starts the queue only when you say so, and you approve
  the tool call (it isn't read-only). `addon_tasks_list` shows the queue.
- **How it follows the chats:** the host API `api.chats` (`create`, `send`, `get`; the `chat`
  permission) starts and reads chats, and main calls the host export `chatChanged` when a chat it
  started changes status. A watcher (every minute) catches up after a restart; a task whose chat
  went idle without answering is marked "Interrupted".
- Kept in the add-on's global storage as `queue` (`lib/tasks.ts` has the logic and its tests).
