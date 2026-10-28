# Phase 17 — UI/UX sweep

**Goal:** what you use every day is one click away, without putting everything on screen (D-094).

## Checklist

- [x] Home: start a chat from a box, starter prompts, recent chats, next steps, widgets (also the
      project dashboard)
- [x] New chat button in the top bar; Ctrl+K for Tools
- [x] Status dots on tabs (working, needs you, error, unread)
- [x] Chat: starter prompts when empty; Edit and Copy on hover; changed files after a turn with
      Review / Walk me through / Undo; "waiting for you" on tools that wait for permission
- [x] "chat" in all user-facing text; "Needs you" in the Chats list
- [x] Tests: `turnChanges` unit test, `e2e/ux.spec.ts`
- [x] Model and permission mode moved from the chat header into the message box's bottom row (they
      configure the next message; the header was cramped and wrapped them)
- [x] Claude's browser: a setting for whether the view opens by itself (`browser.showWhenUsed`, on
      by default); screenshots of the whole page and at several sizes in one call (D-095)

## Later

- Keyboard answers for permission cards (Claude Code's 1/2/3) without stealing typing from the box.
- A first-run walkthrough that points at the top bar, the Home box and the Tools menu.
