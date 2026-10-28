# Phase 15 — The chat, at least as good as Claude Code

**Goal:** everything you can do in Claude Code's terminal works in Jig's chat, with menus for all of
it, plus what a window can do better (D-091, `docs/reference/chat.md`).

## Checklist

- [x] Engine: command output, subagent progress, background tasks, API retries, warnings, permission
      denials, MCP status, structured patches, turn ends for rewind; commands, models, effort, MCP
      control, background/stop, messages into a running turn
- [x] Composer: `/` commands and skills, `@` files and folders, `!` shell, `#` memory, ↑/↓ history,
      Shift+Tab modes, Send now (Ctrl+Enter), the + menu
- [x] Transcript: todo checklist and panel, plan card, inline diffs, output peek, subagent progress,
      running time, move to background, background tasks with Stop, shell cards, find in chat, jump to
      latest
- [x] Session: Claude Code's model list with effort, MCP servers dialog, folders for the chat, export
      as Markdown, rewind / edit and resend
- [x] Tests: unit (normalizer, manager, fuzzy, file search, composer input, export), e2e
      (`e2e/chat-parity.spec.ts`)

## Later

- Output styles and `/agents` management from a menu.
- Rewind with a picker of all your messages (like Esc Esc), not only from a message's menu.
- Thinking display options (summaries) once Claude Code offers them to hosts.
