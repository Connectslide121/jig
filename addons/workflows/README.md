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
- **Export as skill** writes `.claude/skills/<name>/SKILL.md` in the project, so Claude can do it from
  any chat. **Move to the cloud** opens a chat that turns it into a Claude Code routine or an Azure
  DevOps pipeline.
- **From suggestions:** a "workflow" suggestion's **Draft a workflow** opens the editor with its steps
  (tab params `{ draft: { name, goal, steps: string[] } }`; lines that look like commands become
  command steps).

Storage (this add-on's, private to you): `workflows:<projectId>`, `runs:<workflowId>` (last 20),
`triggered`. Pure logic in `lib/workflow.ts` (tested).
