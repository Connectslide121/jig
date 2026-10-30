# Chat reference

The chat is meant to do everything Claude Code's own terminal UI does, and more. Code:
`apps/desktop/src/renderer/features/sessions/` (Composer, ComposerPicker, composerInput, Transcript,
ToolCard, PermissionCard, ChatPanels, SessionDialogs, menus), host side in `main/sessions/` and
`main/engine/` (`docs/reference/engine.md`). Decision: D-091.

## Claude Code next to Jig

| Claude Code (terminal) | Jig |
| --- | --- |
| `/` commands and skills | `/` in the message box opens a picker of Claude Code's own commands and skills (`sessions.commands`, from the running Claude Code, cached per folder). The **+** button → Commands and skills does the same |
| `/model`, `/permissions`, `/mcp`, `/add-dir`, `/export`, `/clear`, `/rewind` | the same names in the picker open Jig's menus and dialogs (model and effort menu, permission menu, MCP servers dialog, folders dialog, export, new chat, the message menu). Commands that only make sense in a terminal (`/login`, `/config`, `/vim`, `/exit`…) are left out |
| `@` file mentions | `@` opens a fuzzy file and folder picker (`files.search`: git's file list inside repositories, a walk elsewhere that skips `node_modules`, build output and caches). Folders keep the picker open to go deeper |
| `!` bash mode | `! command` runs in the chat's folder (PowerShell on Windows, `$SHELL` elsewhere, 2 minutes at most). The output shows as a card and goes to Claude with your next message as `<bash-input>`/`<bash-stdout>`, like Claude Code |
| `#` memory | `# text` → Enter asks which CLAUDE.md: the chat folder's or `~/.claude/CLAUDE.md`; a line `- text` is appended |
| ↑ / ↓ history | your earlier messages of this chat (↑ on the first line of an empty box; a recalled `/command` doesn't open the picker) |
| Shift+Tab modes | Ask before changes → Accept edits → Plan only → Ask. The mode shows above the box; plan mode outlines it |
| Esc | stops Claude |
| Typing while Claude works | Enter queues the message for after the turn (the list above the box). **Ctrl+Enter** or ⚡ sends it now: it joins the running turn and Claude reads it at its next step (`priority: "next"`) |
| Esc Esc / `/rewind` | your message's ⋯ → **Edit and send again** or **Rewind to before this message** (the chat; the chat and the files; or only the files). The transcript drops the message and what came after, the text goes back into the box, and the next message continues the conversation from the turn before (`resumeSessionAt`), or starts a new one when it was the first message |
| Todo list | TodoWrite shows as a checklist in the chat, and the current list stays above the box while it has open items |
| Plan approval | ExitPlanMode is a plan card: Approve and accept edits, Approve and ask before edits, or Keep planning with feedback |
| Edit diffs | Edit/Write cards show the diff (from Claude Code's structured patch) with +/− counts; long diffs fold |
| Bash output | the first lines under the card; click for all of it. Running tools show how long they've run |
| Subagents | Task/Agent cards show progress: tool uses, tokens, time, the tool it's using, and its summary; its own tool calls are inside |
| Ctrl+B background | ⤓ on a running Bash or Task card moves it to the background; background commands and agents are listed above the box with Stop |
| `/mcp` | chat ⋯ → MCP servers…: status (connected, failed, needs sign-in, off), tools, on/off, reconnect. A server that fails at start adds a notice in the chat |
| `/add-dir` | chat ⋯ → Folders for this chat…: other folders Claude may use (Claude Code restarts with them at the next message) |
| `/model`, effort | the model menu (bottom row of the message box, next to the permission mode) lists Claude Code's models (`sessions.models`) and an Effort submenu for models that support it (`sessions.setEffort`, applied to the running session) |
| `/export` | chat ⋯ → Export as Markdown… (`shared/chatExport.ts`) |
| `/context`, `/compact`, `/usage` | the context meter, Compact, the plan usage ring (`docs/reference/engine.md`) |

## Beyond the terminal

- **Claude's questions** (AskUserQuestion) are asked one at a time (D-161): a strip of the steps
  (green once answered; click one to go back), the question with its options as rows — a circle for
  one choice, a square for several, a "Recommended" badge, "Something else…" with its own field —
  then Back, Skip and Next; the last step's Answer sends every answer to Claude together. Once
  answered, the card is a summary of what you said.
- **Compact or Detailed** (switch in the chat's top bar; setting `chat.view`, D-159): Compact, the
  default, shows what you and Claude say, with each run of steps between (commands, reads, edits,
  searches, agents, thinking) folded into one line — "Ran 3 commands, read a file, edited cart.ts
  +4 −1", a single command's description, failures counted, a spinner and the current step while
  it runs; click it for the cards. Subagents' hand-backs in chats opened from Claude Code are a
  step too ("Message from subagent"). Questions,
  permission prompts, plans, results, the changed-files bar and notices stay in view. Detailed shows
  every step as its card. Find in chat opens the line that holds a match.
- **An empty chat** shows where Claude runs, starter prompts (a click puts one in the box) and the
  message box's shortcuts.
- **Message actions on hover:**
  - your messages: Edit and send again, Copy, and ⋯ (rewind, restore files, add-on entries);
  - Claude's answers: Copy and ⋯.
- **After a turn that changed files**, a bar lists them with +/− counts. Each file opens in Preview,
  and the bar has **Review** (Git), **Walk me through** (a tour) and **Undo changes** (restore files to
  before your message, after confirming). `turnChanges()` in `Transcript.tsx` computes it.
- **A tool waiting for your permission** says "waiting for you" instead of a spinner, and can't go to
  the background until it runs.

- **Find in chat** (Ctrl+F, or 🔍 in the header): matches in messages, tool calls, outputs and plans,
  newest first; Enter / Shift+Enter step, the transcript scrolls to each.
- **Jump to latest** when you've scrolled up.
- Images from tools, previews of files Claude touched, next-message suggestions, fork, restore files,
  Try several ways, Claude's terminals and browser (`docs/reference/ai-features.md`).
- Notices for Claude's API retries ("answered 529; retries in 4 s"), Claude Code's warnings,
  permission-rule denials, and MCP servers that need you.

## Fake engine

`/name` (a command prints, a skill answers), "todo list", "make a plan", "subagent",
"background job", "edit <file>" (`e2e/chat-parity.spec.ts`).
