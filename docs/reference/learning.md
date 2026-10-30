# Learning reference

Code: `packages/learning` (mining, schedule — pure, tested), `apps/desktop/src/main/learning/` (activity
log, reflection, service), `apps/desktop/src/renderer/features/learning/` (inbox). Principle 7: local
and quiet.

## 1. Record (always, no AI, local only)

Sources publish to `main/activity/bus.ts`; the log appends one JSON line per event to
`~/.jig/activity/YYYY-MM-DD.jsonl` (local date): `{ at, kind, text, projectId?, detail? }`.

| `kind` | From |
|---|---|
| `prompt` | every message you send in a chat (pastes collapsed, secrets masked — see below) |
| `session.tool` | tool calls in sessions (the command for Bash) |
| `terminal.command` | lines typed in Jig terminals (not in private ones, like the Claude sign-in) |
| `script.run` | scripts started from Jig |
| `addon.action` | add-on Tools actions and menu entries |
| `git` | commit/push/pull/fetch/switch/branch/stage/discard from the Git add-on |
| `project.switch` | switching the active project |
| `friction` | `detail.signal`: `interrupt` (Stop while Claude works), `rewind`, `denied` (a permission), `correction` (a message like "no, I meant…"), `tool-errors` (3 failed tool calls in a turn), `script-failed` (a script that exits non-zero by itself) |
| `evidence` | a note Claude saved with `jig_note_evidence` (`detail.category`) |
| `ai.lines` | Claude's Write/Edit/MultiEdit: `text` the file, `detail.lines` the hashes of the lines it wrote (no content) |

**What is written is sanitized** (`packages/learning/src/sanitize.ts`, tested; D-103):
- **Secrets are masked as `«secret»` in every event:**
  - `Authorization`/`Cookie`/API-key headers;
  - Bearer/Basic credentials, JWTs, known key formats (`sk-…`, `ghp_…`, `AKIA…`, …), private keys;
  - credentials in URLs;
  - `password=`, `token: …`, `"secret": "…"`, `--password …` and other secret-looking names, Azure
    connection strings.
- **Pasted material in chat messages is kept as `[pasted <kind>, N lines]`:** blocks of 6+ lines or
  600+ characters, fenced or not. The kinds are `http`, `json`, `stack trace`, `log`, `xml/html`,
  `sql`, `data`, `code`. The counts go to `detail.pasted` (e.g. `http:1`) for later suggestions. What
  you typed around a paste stays.

Settings → Learning: pause recording, never record activity containing (paths, names, any text —
case-insensitive, also matched against the project path), keep for N days (older days are deleted at
start and daily), open the folder, delete all.

### Notes from chats and the profile (Learning 2, D-111)

- **`jig_note_evidence`** (read-only Jig tool): when you mention manual work, work outside Jig,
  frustration, a chore or a preference, Claude saves one short note without asking. A "Noted for
  suggestions" card with **Remove** shows in the chat. Notes are in `~/.jig/evidence.json`; exclusions
  and masking apply; nothing is saved while recording is paused.
- **The profile** (`~/.jig/profile.md`): how you work, as Markdown with headings (Stack, How I
  release and deploy, Tools I use outside Jig, Preferences, What I already know well). Every reflection
  reads it. `jig_read_profile` (read-only) and `jig_update_profile` (adds bullets under a heading; a
  card with Undo) let chats use it.
- **What Jig knows about me** (tab `jig.knowledge`: Suggestions view's person button, Tools, Settings →
  Learning): the profile in an editor (Ctrl+S), the notes (delete one or all), the activity of the last
  4 weeks per kind, and "How you worked".

## 2. Mine (no AI) — `packages/learning`

- `normalizeCommand`: paths, URLs, emails, quoted strings, UUIDs, hashes, numbers and branch arguments
  become placeholders (`dotnet run --project <path>`); trivial commands (`ls`, `cd`, `git status` …)
  are ignored.
- Patterns over the last **28 days**: commands (≥ 5 times on ≥ 2 days), sequences of 2–4 commands
  within 10 minutes in one project (≥ 3 times on ≥ 2 days; the longest wins), similar prompts (Jaccard
  ≥ 0.5 on content words; ≥ 3 on ≥ 2 days). Each pattern has a stable `key`, counts, distinct days and
  projects, examples, and a score; the top 20 survive. Patterns you said "Never" to, or that already
  have a suggestion, are left out.
- Learning 2 signals (`signals.ts`): **friction** that repeats (3+ on 2+ days, one pattern per
  signal; per script for failing scripts; plus two found from the log itself, `derivedFriction`: a
  chat with 15+ messages over an hour and no commit — messages carry `detail.chat` — and 6+ project
  switches within 30 minutes), **pastes** per kind (5+ on 2+ days, from `detail.pasted`),
  and **tools never used** (5+ UI-related messages on 2+ days in a project where Claude's browser was
  never used).

### How you worked (2e)

`attribution.ts` and `main/learning/worked.ts`: for every workspace repository (and the ones Claude
wrote in), your commits of the last 7 days (`git log -p --unified=0 --author=<user.email>`; 21 days
are read for churn). Added lines whose hash Claude recorded for that file count as Claude's, others
as yours (a line Claude wrote and you changed is yours). **What counts as Claude's (D-162):** the
Write/Edit calls recorded in Jig's chats, plus everything Claude Code itself saved on this computer
for the last 28 days (`main/learning/claudeLines.ts`, `Engine.savedToolUses`: whole transcripts,
subagents' too, compacted parts included): its Write/Edit/MultiEdit calls per file, and the long
lines (20+ characters) of the commands and files it wrote, which count in any file (a script that
carries the real code in strings). Lock files, minified code, source maps and snapshots are left out
(`isGenerated`). Work Claude did on another computer or tool leaves nothing here and counts as
yours; the card says so. Lines removed again within 14 days are
**churn** for their origin; "fix" commits that remove recent lines are attributed to the origin of
most of them. Chat time (in Jig's chats only) is estimated from message and tool times (gaps under 10 minutes). Shown as one
paragraph on the Suggestions view and the knowledge page, and given to the reflection; never as a
notification. `learning.worked` caches it for an hour.

## 3. Reflect (AI, on demand or weekly)

Only when there are patterns or notes: one Claude Code query without tools (`Engine.oneShot`, model
`learning.model`, default `haiku`) gets the patterns, the add-on catalog and your past answers, with
instructions to return at most 3 suggestions as JSON (title, why with evidence, goal, level, kind,
minutes saved per week, pattern keys, note ids, workflow steps) plus `profileUpdates`. Learning 2 adds
the notes, the profile, "How you worked", past answers with their "did it help?" outcome, and whether
a tip is allowed (at most one coaching tip a week). The reply is validated (`main/learning/reflect.ts`):
extra tips are dropped, and profile updates become one "Add to what Jig knows about you" suggestion.
**No patterns and no notes → no AI call → no quota used.**

Triggers: **Look for patterns now** (Suggestions view, Settings → Learning, Tools menu) and the weekly
run (`learning.schedule`, default Monday 10:00 local time). A scheduled run that was missed because Jig
wasn't running happens at the next launch; the very first start doesn't run at once.

## 4. Suggest — the inbox

Suggestions view (right sidebar) and the light bulb in the top bar with the number of new ones. Each
suggestion shows why and its evidence (pattern, how often, on how many days, examples).

Each kind has its own action:

| Kind | Action |
|---|---|
| `layout`, `settings`, `change-addon`, `new-addon`, `app` | **Build it** → the builder with the goal |
| `workflow` | **Draft a workflow** → a new workflow in the Workflows add-on with the steps (or a chat when it is off) |
| `claude-setup` | **Set it up with Claude** → a chat with the goal |
| `project-memory` | **Add to CLAUDE.md** → a chat that adds the text |
| `automation` | **Make a routine** → a chat that makes a Claude Code routine |
| `prompting-tip`, `habit-tip` | **Got it** / **Remind me** / **Dismiss** (at most one tip a week, always with your own examples) |
| `profile` | **Add to my profile** (written at once) |

- **Not now** → hidden for 14 days. **Never** → its patterns are blocked for good.
- **Did it help?** A week or more after a suggestion was built or adopted, the next run compares how
  often its patterns happened since with the 4 weeks before. The result shows on the card (Done list),
  comes once as a notification, and goes to the next reflection.

## 5. Check-in (2c)

`learning.checkIn`: `off` (default), `weekly`, `biweekly`. After two weeks of activity the Suggestions
view offers it once (Turn on / No thanks). When due, a card offers **Start** (a new chat with a first
message built from the profile's empty sections and recent notes: 3–5 questions, then
`jig_update_profile`) or **Skip this one**.

Answers are stored in `~/.jig/suggestions.json` and given to the next reflection.

## IPC

`learning.state`, `learning.runNow`, `learning.answer { id, answer }` (`build`, `act`, `snooze`,
`dismiss`, `never`), `learning.clearActivity`, `learning.record` (activity from the renderer),
`learning.knowledge`, `learning.setProfile`, `learning.removeNote`, `learning.clearNotes`,
`learning.worked`, `learning.checkIn`; events `learning.changed`, `learning.knowledgeChanged`.
