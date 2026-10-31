# Workflows

Lists of steps you repeat, per project: a release, a deploy, a morning routine (D-112).

- **View Workflows** (left sidebar, follows the active project; Tools → Show workflows): the project's
  workflows with their schedule; ▶ runs one. **+** makes a new one.
- **Workflow tab:** the steps with who does each one:
  - **You do it** (a check, or "wait for your OK"): Done / Skip;
  - **Ask me first:** Run it / Skip;
  - **Jig does it:** runs by itself when it's next.
  Step kinds: a check you do, a command (run in the platform shell in the project folder; output
  shown), a script Jig found in the project (runs in a terminal), an Azure DevOps pipeline (`az
  pipelines run`), a message to Claude (a new chat), or waiting for your OK. **Edit** changes the name,
  goal, steps (kind, who does it, order) and when it runs.
- **Schedules** (every day, weekdays, once a week, at a time) fire **while Jig is open** (watcher
  `schedules`, every minute). A workflow whose steps are all automatic commands or pipelines runs by
  itself and notifies you; otherwise you get a notification to start it.
- **Events** (D-177): **After you push** (any branch or one) — seen in the upstream's reflog — and
  **When a pipeline finishes** (any result, succeeded or failed; through your `az`), checked by the
  same watcher. The first check only remembers the latest push or run, so old events never fire.
- **Export as skill** writes `.claude/skills/<name>/SKILL.md` in the project, so Claude can do it from
  any chat. **Move to the cloud** opens a chat that turns it into a Claude Code routine or an Azure
  DevOps pipeline.
- **From suggestions:** a "workflow" suggestion's **Draft a workflow** opens the editor with its steps
  (tab params `{ draft: { name, goal, steps: string[] } }`; lines that look like commands become
  command steps).

- **Tools for Claude** (slot `claude.tool`): `addon_workflows_list` and `addon_workflows_get`
  (read-only), `addon_workflows_save` (create or update by name, from steps as text or
  `{ title, kind, mode, command?, prompt? }`), `addon_workflows_delete`, and `addon_workflows_run`
  (Jig's automatic command and pipeline steps run with their output; it stops at the first step that
  is yours, asks first or is a message for Claude, and Claude guides you through the rest). Without
  `project`, the chat's project. Claude is told to offer saving a step-by-step request you'll repeat
  as a workflow (once, in one sentence).

Storage (this add-on's, private to you): `workflows:<projectId>`, `runs:<workflowId>` (last 20),
`triggered`. Pure logic in `lib/workflow.ts` (tested).
