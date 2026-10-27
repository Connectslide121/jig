# Phase 9 — Learning & suggestions

**Goal:** Jig notices what you repeat and suggests tools for it — locally, quietly, on demand or weekly.

**Done when:** activity is recorded, "Look for patterns now" produces evidence-backed suggestions in an
inbox, the Monday 10:00 run happens (or catches up at next launch), and Build it / Not now / Never work.

## Checklist

### Record
- [ ] Activity log (`~/.jig/activity/YYYY-MM-DD.jsonl`), event schema, rotation/retention
- [ ] Sources: prompts, session tool calls (Bash commands), terminal commands, script runs, add-on
      actions, git operations, project switches
- [ ] Settings → Learning: pause recording, exclusions, retention, "delete all"

### Mine (`packages/learning`, no AI)
- [ ] Command normalisation into templates
- [ ] Frequency counts across days/projects
- [ ] Repeated sequences (n-grams in a time window)
- [ ] Similar prompts (token similarity clusters)
- [ ] Thresholds + evidence objects; unit tests with realistic fixtures

### Reflect (AI)
- [ ] One-shot Claude Code query with mined patterns + add-on catalog + past answers
- [ ] JSON output validated (max 3 suggestions; level; change-existing vs new; evidence; time saved)
- [ ] Triggers: **Look for patterns now** button; schedule (default Monday 10:00, configurable/off);
      catch-up at launch if a run was missed

### Inbox
- [ ] Tools → Suggestions with badge; each suggestion shows evidence
- [ ] Build it (→ builder with the goal), Not now (snooze), Never (block pattern)
- [ ] Answers stored and fed to the next reflection
- [ ] `docs/reference/learning.md`
