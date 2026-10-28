# Phase 9 — Learning & suggestions

**Goal:** Jig notices what you repeat and suggests tools for it — locally, quietly, on demand or weekly.

**Done when:** activity is recorded, "Look for patterns now" produces evidence-backed suggestions in an
inbox, the Monday 10:00 run happens (or catches up at next launch), and Build it / Not now / Never work.

## Checklist

### Record
- [x] Activity log (`~/.jig/activity/YYYY-MM-DD.jsonl`), event schema, rotation/retention
- [x] Sources: prompts, session tool calls (Bash commands), terminal commands, script runs, add-on
      actions, git operations, project switches
- [x] Settings → Learning: pause recording, exclusions, retention, "delete all"

### Mine (`packages/learning`, no AI)
- [x] Command normalisation into templates
- [x] Frequency counts across days/projects
- [x] Repeated sequences (n-grams in a time window)
- [x] Similar prompts (token similarity clusters)
- [x] Thresholds + evidence objects; unit tests with realistic fixtures

### Reflect (AI)
- [x] One-shot Claude Code query with mined patterns + add-on catalog + past answers
- [x] JSON output validated (max 3 suggestions; level; change-existing vs new; evidence; time saved)
- [x] Triggers: **Look for patterns now** button; schedule (default Monday 10:00, configurable/off);
      catch-up at launch if a run was missed

### Inbox
- [x] Tools → Suggestions with badge; each suggestion shows evidence
- [x] Build it (→ builder with the goal), Not now (snooze), Never (block pattern)
- [x] Answers stored and fed to the next reflection
- [x] `docs/reference/learning.md`

## Notes

- No AI call is made when mining finds nothing (D-056); the first start doesn't run at once (D-057).
- Tested with recorded fixtures (unit) and seeded activity files plus the fake reflection (e2e). A real
  reflection with Claude Code must be tried on Jon's machine.
