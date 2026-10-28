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

## 2. Mine (no AI) — `packages/learning`

- `normalizeCommand`: paths, URLs, emails, quoted strings, UUIDs, hashes, numbers and branch arguments
  become placeholders (`dotnet run --project <path>`); trivial commands (`ls`, `cd`, `git status` …)
  are ignored.
- Patterns over the last **28 days**: commands (≥ 5 times on ≥ 2 days), sequences of 2–4 commands
  within 10 minutes in one project (≥ 3 times on ≥ 2 days; the longest wins), similar prompts (Jaccard
  ≥ 0.5 on content words; ≥ 3 on ≥ 2 days). Each pattern has a stable `key`, counts, distinct days and
  projects, examples, and a score; the top 20 survive. Patterns you said "Never" to, or that already
  have a suggestion, are left out.

## 3. Reflect (AI, on demand or weekly)

Only when there are patterns: one Claude Code query without tools (`Engine.oneShot`, model
`learning.model`, default `haiku`) gets the patterns, the add-on catalog and your past answers, with
instructions to return at most 3 suggestions as JSON (title, why with evidence, goal for the builder,
level, change-existing vs new, minutes saved per week, pattern keys). The reply is validated
(`main/learning/reflect.ts`). **No patterns → no AI call → no quota used.**

Triggers: **Look for patterns now** (Suggestions view, Settings → Learning, Tools menu) and the weekly
run (`learning.schedule`, default Monday 10:00 local time). A scheduled run that was missed because Jig
wasn't running happens at the next launch; the very first start doesn't run at once.

## 4. Suggest — the inbox

Suggestions view (right sidebar) and the light bulb in the top bar with the number of new ones. Each
suggestion shows why and its evidence (pattern, how often, on how many days, examples).

- **Build it** → starts the builder with the suggestion's goal (and add-on, if it should change one).
- **Not now** → hidden for 14 days.
- **Never** → its patterns are blocked for good.

Answers are stored in `~/.jig/suggestions.json` and given to the next reflection.

## IPC

`learning.state`, `learning.runNow`, `learning.answer { id, answer }`, `learning.clearActivity`,
`learning.record` (activity from the renderer); event `learning.changed`.
