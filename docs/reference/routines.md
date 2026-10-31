# Routines reference

Code: `apps/desktop/src/main/routines/`, `apps/desktop/src/shared/routines.ts` (parsers, schedules in
words), `apps/desktop/src/renderer/features/routines/`. Decision: D-092.

A **routine** is a Claude Code prompt that runs on a schedule in Claude Code on the web, for example
"every weekday at 8:30, review my open pull requests". Claude Code manages routines with its own
`RemoteTrigger` tool, signed in with your claude.ai account. Jig never calls the routines service
itself and never sees your login.

## Two ways in

- **Claude, from any chat:** "make a routine that…". Claude uses `RemoteTrigger` directly.
  - The call goes through the normal permission card.
  - The tool card has **Open Routines**.
  - `jigContext` tells Claude about the tab.
  - When a chat's `RemoteTrigger` call creates, updates or runs a routine, the host emits
    `routines.changed`, and the Routines tab reloads the next time it shows.
- **The Routines tab** (Search → Routines):
  - **The list:** every routine, its schedule in words (`describeSchedule`: "Weekdays at 08:37
    (Europe/Stockholm)"), its last run, and an on/off switch.
  - **The selected routine:** what it does, when it runs next, **Run now**, and its runs. Click a run
    for its messages; ↗ opens it in Claude Code on the web.
  - **New routine…** and **Change with Claude…** open a chat with the request drafted, because Claude
    knows the routines service's fields. There is no delete: switch a routine off, or delete it on
    claude.ai.

## How Jig asks Claude Code

Each tab action is one guarded tool call (`Engine.callTool`, `main/engine/toolCall.ts`):
1. A hidden Claude Code session starts with only `RemoteTrigger` available, on Haiku, with no
   settings loaded.
2. It is told to call the tool with an exact input.
3. A `PreToolUse` hook and `canUseTool` both refuse any call whose tool or input differs.
4. Jig reads the tool's raw result (`tool_use_result`: `{ status, json }`), not Claude's reply.

| Tab action | `RemoteTrigger` input |
| --- | --- |
| List | `{ action: "list" }` (cached 5 minutes; Refresh skips the cache) |
| Run now | `{ action: "run", trigger_id }` |
| On / off | `{ action: "update", trigger_id, body: { enabled } }` |
| Runs | `{ action: "list_runs", trigger_id }` |
| A run's messages | `{ action: "get_run_log", session_id }` |

Each call is **a small model call on your plan**. So the tab loads when it opens or when you press
Refresh, never on a timer.

The parsers accept several shapes, because the service's JSON may grow:
- a list under `data`, `triggers`, `runs` or `items`;
- the prompt from `prompt` or `job_config.ccr.events[0].data.message.content`;
- run messages from `text`, `content` or `message.content`.

An answer with status ≥ 400 shows the service's message.

## Needs

- Claude Code signed in with a Claude subscription, with routines available on the account.
- The `RemoteTrigger` tool in your Claude Code version. If it is missing, the tab says Claude Code
  didn't run it.

## Fake engine

Two routines ("Morning PR review" on, "Weekly dependency check" off) with one past run. In a chat, a
message with "routine" makes Claude create "Daily standup notes" after the permission card
(`e2e/routines-artifacts.spec.ts`).
