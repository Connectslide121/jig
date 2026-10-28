# AI features around the chats

Everything goes through the user's Claude Code: chats, or one-shot questions with no tools (`oneShot`)
that can only answer. Each feature has a visible button or menu entry (D-083).

| Feature | Where | How |
| --- | --- | --- |
| Next-message suggestions | above the composer (Tab takes it) | Claude Code's `promptSuggestions` (`docs/reference/engine.md`) |
| Restore files to before a message | your message's ⋯ → Rewind to before this message → Only the files | file checkpoints, `sessions.rewindFiles` |
| Edit and send again / rewind the chat | your message's ⋯ | `sessions.rewind` (`docs/reference/chat.md`) |
| Fork chat | chat ⋯ | `sessions.fork` (Claude Code's fork) |
| Write the commit message | Git commit box → Write | `ctx.ai.ask` with the diff and recent subjects |
| Check before committing | Git → ✨ menu | `ctx.ai.ask`: secrets, debug output, unfinished code, likely bugs → findings under the commit box |
| Walk me through the changes | Git → ✨ menu, a workspace repo's menu, chat ⋯, `ctx.ai.tour` | `tour.create` (below) |
| Explain / review changes | Git file and repo menus, ✨ → Review in a chat | a chat with the request typed in |
| Try several ways | composer split button, Tools | `docs/reference/attempts.md` |
| Turn this chat into a tool | chat ⋯ | the Build dialog with what happened in the chat (requests, commands, changed files) |
| Claude's terminals | the Terminals panel ("Claude: …") | `jig_terminal_run/read/list/stop` (`docs/reference/terminals.md`) |
| Claude's browser | the Claude's browser view (right), Tools | `jig_browser_*` (`docs/reference/browser.md`) |
| Images from tools | tool cards in the chat | screenshots and charts a tool returns are saved and shown |
| Ask Claude about a failed script | failure toast, terminal list ✨, terminal menu | a chat with the command, exit code and output |
| Ask Claude about a file | Preview tab | a chat with a request suited to the file kind |
| Write my standup | Tools → Write my standup… | `digest.standup` (below) |
| Desktop notifications | system | `main/sessions/notify.ts` |

## Guided change tours

`tour.create { cwd, focus? }` collects the uncommitted changes of the repository `cwd` is in: `git diff
HEAD`, plus new files (up to 40) as diffs. It sends at most 80 000 characters to Claude with a request
for a tour ordered for understanding, not by file name: an entry point first, then the flow, then
tests. The answer is JSON: a title, an overview, and 3–12 steps, each with a file, a line and an
explanation. Steps about files not in the diff are dropped. The **Tour** tab lists the steps next to
the current step's explanation and the file's diff, with the step's hunk highlighted. ←/→ (or j/k)
move between steps. *Ask about this* opens a chat. Tours live in memory until Jig restarts.

## Standup

`digest.standup { period }` (`workday`: since the start of the previous working day, Friday on a
Monday; `week`: 7 days) gathers, for every project's repositories:
- your commits (`git log --author=<your git email> --since`);
- the branch and the number of uncommitted files.

It also gathers the chats you used in the period. Claude writes **Done / Next / Blockers** from those
facts only. The dialog has Copy and Write again.
