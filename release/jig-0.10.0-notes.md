## New

- **Mention a Teams chat with @chat.** In any chat, type `@chat` to pick a Teams chat from the Meetings lobby; Claude reads it when you send.
- **Meetings chats toolbar.** Search your Teams chats (including message search), filter by Unread, Chats or Meetings, start a new chat, and pin the chats you use most.

## Improved

- **One View menu.** The top bar's View menu now holds the sidebars, bottom panel, views and layouts; the separate layout and help buttons are gone.
- **Don't ask mode and safety checks.** When Claude Code's own safety check needs you, the permission card waits a minute with a countdown before declining, and the chat shows "Needs you".
- **ChatGPT chats in Don't ask** run without Codex's sandbox, like Claude chats, and a command that prints nothing for a few minutes is flagged in the chat.

## Fixed

- ChatGPT chats on Windows no longer hang on every command in Don't ask mode.
- ChatGPT chats: the last output is no longer lost when Codex exits, approvals are always answered, model and permission choices survive a failed send, and closing a chat stops Codex completely.
- ChatGPT chats: tool cards close properly after Stop, file changes and deletions show correct diffs, tool results show as text and images, and reopened chats look the same as they did live.
- AI features on ChatGPT (titles, suggestions) keep a good answer after a reconnect notice, no longer return half answers after a crash, and no longer hang on a timeout.
