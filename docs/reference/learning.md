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
| `session.tool` | tool calls in sessions (the command for Bash); `detail`: `tool`, `chat` and, for a skill, subagent, add-on or MCP tool, `use` (`skill`/`subagent`/`addon`/`mcp`) and `name` (D-185) |
| `terminal.command` | lines typed in Jig terminals (not in private ones, like the Claude sign-in) |
| `script.run` | scripts started from Jig |
| `addon.action` | add-on Tools actions and menu entries |
| `ui` | Jig's own actions run from a menu or Go to (`text` the action id), a view opened as a main tab (`view.open`) or moved to a region (`view.move`); only ids and regions (D-175). Keyboard shortcuts aren't recorded |
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
  4 weeks per kind, "How you worked", and "How Claude worked for you" (D-185): the chat overview's
  counts summed over 4 weeks (`usageSummary` in `@jig/learning`, IPC `learning.usage`): chats,
  messages, tool calls, and per skill, subagent, add-on, MCP server and tool its calls and chats.
- **Profile interview** (D-169): an empty profile (only headings) makes Jig offer a chat where Claude
  interviews you one question at a time and writes with `jig_update_profile`: a toast when Jig opens
  (once per launch, a project active, "Don't ask again" in localStorage) and **Fill it in with Claude**
  in the tab. The prompt is `profileInterviewPrompt` (`learning/reflect.ts`).

## 2. Mine (no AI) — `packages/learning`

- `normalizeCommand`: paths, URLs, emails, quoted strings, UUIDs, hashes, numbers and branch arguments
  become placeholders (`dotnet run --project <path>`); trivial commands (`ls`, `cd`, `git status` …)
  are ignored.
- Patterns over the last **28 days**: commands (≥ 5 times on ≥ 2 days), sequences of 2–4 commands
  within 10 minutes in one project (≥ 3 times on ≥ 2 days; the longest wins), similar prompts (Jaccard
  ≥ 0.5 on content words; ≥ 3 on ≥ 2 days). Each pattern has a stable `key`, counts, distinct days and
  projects, examples, and a score; the top 20 survive. Patterns you said "Never" to, or that already
  have a suggestion, are left out.
- **Practices** (`practicePatterns` in `review.ts`, D-213), kind `practice`, security first: a secret
  (`«secret»`) in a message or a command, a download piped into a shell, certificate checks off,
  `chmod 777`, permission checks skipped, `sudo` package installs (each once is enough); force pushes
  without `--force-with-lease`, `--no-verify` (2+), pushes straight to main/master (3+ on 2+ days); and
  5+ commits on 2+ days with no tests run (by you or Claude: `npm test`, `vitest`, `pytest`, `dotnet
  test`…).
- **Habit hints** (`habitPatterns` in `habits.ts`, D-214), kind `habit`: a few habits the coach can
  start from (the coaching itself is Claude's, from your chats; see Reflect). From messages and
  Claude's tools grouped by chat (`detail.chat`): asking for one feature **piece by piece** (4+ short
  "write a…", "now add…" messages in a chat, in 2+ chats on 2+ days; the examples are one whole
  sequence in order), **mostly one-off asks** (6+ chats of a single message under 15 words, 60%+ of
  chats, on 3+ days), and **big changes without a plan** (15+ Edit/Write calls in a chat with no plan
  asked for or `ExitPlanMode`; 3+ chats on 2+ days).
- **View habits** (`viewHabitPatterns`, D-175): a view you keep opening as a main tab (4+ times on
  3+ days) and haven't moved to a region since; the reflection may suggest placing it.
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

When there are patterns or notes, or enough activity to review (30+ events on 3+ days,
`enoughToReview`, D-213): one Claude Code query without tools (`Engine.oneShot`, model
`learning.model`, default `haiku`) gets the patterns, the add-on catalog and your past answers, with
instructions to return at most 3 suggestions as JSON (title, why with evidence, goal, level, kind,
minutes saved per week, pattern keys, note ids, workflow steps, `addonId`, `actionId`) plus
`profileUpdates`.

**What Claude looks at (D-213, D-214):** how you work with Claude first, usually the biggest win: it
reads your recent chats like a coach and names the one change that would most improve results or
save time, with your messages as evidence (anything: clarity, context, how much work you hand over,
saying how to check it's done, planning, reacting when Claude goes wrong, reusing what you keep
explaining, parallel work, small commits; the habit hints and numbers are only starting points); what you already have (an add-on, a Jig feature, a
setting, a skill); safety and good practice (a real security problem with evidence comes first);
repeated work (workflow, routine, CLAUDE.md); a new tool last, at most one per review (also enforced
by the parser). Suggestions are spread over different angles. It also gets: an overview of the
activity per kind (`activityOverview`), how you prompt in numbers (`promptStats`: messages per chat,
length of first messages, single-message chats, "one more piece" messages, first messages that say
how to check it's done, chats with a plan), the 10 most recent chats message by message (masked,
pastes collapsed, 10 messages each, 200 characters; `chatSample`), Jig's features with their action ids (`main/learning/features.ts`), and each add-on's
use in 4 weeks (actions run, opened as a tab, Claude's calls; `addonUsage`, shown as `Used:` in the
catalog with the add-on's action ids). Learning 2 adds
the notes, the profile, "How you worked", "How Claude worked for them" (`usageText`, D-185), past answers with their "did it help?" outcome, and whether
tips are allowed (one prompting tip and one habit tip a week at most). A prompting tip carries
`before` (your message(s) as sent), `example` (the same request rewritten the better way) and
`changes` (each difference and why it's better). The reply is validated
(`main/learning/reflect.ts`): extra tips are dropped, and profile updates become one "Add to what Jig knows about you" suggestion.
**No patterns, no notes and too little activity → no AI call → no quota used.**

Triggers: **Look for patterns now** (Suggestions view, Settings → Learning, grouped menus) and the weekly
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
| `prompting-tip` | **Compare prompts** → a dialog with your prompt (`before`) and the better one (`example`) side by side, why yours fell short (`why`) and what's better (`changes`); **Try this prompt** there → a new chat with it filled in (D-214). Without an example **Got it**; **Remind me** / **Dismiss** |
| `habit-tip` | **Show me** when it names a Jig action, else **Got it**; **Remind me** / **Dismiss** (tips always quote your own activity; one of each a week at most) |
| `profile` | **Add to my profile** (written at once) |
| `practice` | **Fix it with Claude** → a chat that explains the risk and fixes it (D-213) |
| `use-addon` | **Switch it on** when it is off, else **Show me** (runs `actionId`), else **Got it** |
| `use-feature` | **Show me** (runs the Jig action `actionId`), else **Got it** |

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
