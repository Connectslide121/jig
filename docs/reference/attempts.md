# Try several ways (attempts)

Claude works on the same task in 2–4 chats at once, each in its own git worktree and each from a
different angle. You compare what they did, let Claude judge, and keep one.

**Start:** the composer's split button (with what you typed), Search → Try a task several ways…, or
`attempts.start`. The dialog asks for the task, the repository (in a workspace), how many attempts,
and an angle per attempt. The defaults are "simplest change", "cleanest design", "thorough, with tests"
and "unconventional"; you can edit them.

**What happens** (`main/attempts/`):
1. The repository's `HEAD` is the base. Attempts don't include uncommitted changes, and a repository
   without commits can't start.
2. Per attempt: `git worktree add -b jig/attempt-<run>-<n> ~/.jig/attempts/<run>/<n> <base>`, then a chat
   in that folder (permission mode *Accept edits*: it's Jig's own copy). Its first message is the task,
   the angle and "work only here, don't commit, summarise when done".
3. The **Attempts** tab shows each chat's status and what it changed (`git add -A` + `git diff --cached
   <base>` in its worktree), refreshing every 4 s while chats work. Click a file for its diff.
4. **Let Claude judge** sends every attempt's angle, files and diff (15 000 characters each) to Claude
   as a one-shot question with no tools. It answers with JSON: the winner, a summary, and strengths
   and weaknesses per attempt. The tab shows the pick on its card.
5. **Keep this one** checks (`git apply --check`) and applies the attempt's diff to your working copy,
   uncommitted, so you review and commit it as usual. It refuses, changing nothing, when it doesn't
   apply cleanly. Then every attempt's chat stops (chats stay in the list), and every worktree and
   `jig/attempt-*` branch is removed. **Discard all** does only the clean-up.

State: `~/.jig/attempts/<run>.json` (`AttemptRun` in `shared/attempts.ts`); event `attempts.changed`.
The fake engine's judge always picks attempt 2.
