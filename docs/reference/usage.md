# Plan usage reference

Your Claude subscription usage — the **5-hour session window** and the **weekly windows** — is always
visible:

- **Status bar** (right): a bar per window, like the usage plugin's footer: `5h ▰▱ 42% 2h 13m`,
  `wk ▰▱ 69% 4d 22h` (share used, time left). Each bar is green, amber from 60 % and red from 85 %
  (`usageTone`); the whole item turns red when a window passes 85 % or Claude Code reports a limit
  was reached.
The chat header has no usage ring any more: the status bar is always visible (D-152).

Hovering it shows a card with every window (current session, this week for all models, per-model
weekly windows, named as the server names them, e.g. "This week (Fable)" from `model_scoped`), a bar each, when it resets ("Resets in 2 h 13 min · 14:13"), extra usage
when your plan has it, and when the numbers were updated. Clicking refreshes.

Code: `shared/usage.ts` (types, `planUsageFrom`, `formatResetIn`, `usageTone`, tested),
`main/usage/` (`UsageService`, IPC), `engine/claude.ts` → `planUsage()`, renderer
`stores/usage.ts` and `features/usage/UsageMeter.tsx`.

## Where the numbers come from

Jig never reads your Claude login. It asks **Claude Code** for the data behind its own `/usage`
command:

- `planUsage()` starts a Claude Code process with no prompt and calls the Agent SDK's
  `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })`; Claude Code fetches
  the windows from Anthropic's usage endpoint with its own sign-in. Nothing is sent to Claude, so it
  uses none of your limits. The process is closed right after (45 s timeout).
- During chats Claude Code emits `rate_limit_event` messages — information about your subscription's
  limits (close to a limit, limit reached), not a restriction. Jig adds no limits of its own; it only
  reads these to update the meter sooner; the normalizer turns them into
  `rate_limit` engine events. A warning (`allowed_warning`) or a limit reached (`rejected`) shows in the
  card at once and triggers a refresh 5 s later.

`UsageService` asks at most once at a time: 3 s after start, every 5 minutes, after a chat turn (if the
numbers are older than a minute), on a rate-limit event, when the renderer asks and the numbers are
older than 2 minutes (`usage.get`), and on click (`usage.refresh`). If a refresh fails, the last numbers
stay, marked "couldn't refresh".

`state`: `ok`; `unavailable` (API key, Bedrock/Vertex, or not signed in with a subscription — the meter
says "usage n/a"); `error` (Claude Code couldn't be asked and there are no earlier numbers); `unknown`
(not asked yet).

The SDK method is marked experimental; if Anthropic renames it, the meter shows "usage n/a" with the
error until Jig is updated (the rest of Jig is unaffected).

## IPC

| Method / event | Result | |
|---|---|---|
| `usage.get` | `PlanUsage` | the current numbers; refreshes in the background when older than 2 min |
| `usage.refresh` | `PlanUsage` | asks Claude Code now |
| event `usage.changed` | `PlanUsage` | after every refresh or rate-limit event |

The fake engine (`JIG_ENGINE=fake`) reports 42 % (5 h), 18 % (week) and 31 % (Fable, a per-model weekly limit as the server names it);
`JIG_FAKE_USAGE=unavailable` acts like an API-key login, and a JSON value replaces the answer.

Extra-usage amounts from the SDK are currency minor units. The UI formats them using the currency's decimal places (4000 EUR → €40.00), preserving raw amounts in the usage contract. This is display only and does not change the billing limit.
