# Plan usage reference

Your plans' usage — Claude's from Claude Code and, when OpenAI's Codex CLI is signed in, ChatGPT's
(D-298) — is always visible:

- **Status bar** (right): Claude's group, then ChatGPT's after a thin divider. Each starts with its
  mark (an icon and "Claude" / "ChatGPT" in the `provider-claude` / `provider-chatgpt` tokens), then
  a bar per window: `5h ▰▱ 42% 2h 13m`, `wk ▰▱ 69% 4d 22h` (share used, time left). The bars mean the
  same for both: green, amber from 60 % and red from 85 % (`usageTone`); who it is comes only from
  the mark. Every slot has a fixed width with tabular numbers, so nothing moves when numbers change.
  When the status bar is narrow (a container query on it, `@max-5xl/statusbar`), each group shrinks
  to its mark and its highest share. ChatGPT's group shows only while Codex is signed in with
  ChatGPT; the renderer remembers whether it showed last time, so it reserves its space at startup
  (with "—" until Codex answers).
The chat header has no usage ring any more: the status bar is always visible (D-152).

Hovering it shows a card with a section per provider, always both, so it has the same size whichever
group you hover (mark, plan badge, windows, "From Claude Code" / "From Codex · updated …"; signed out,
ChatGPT's section offers Get started). Claude's section has every window (current session, this week for all models, per-model
weekly windows, named as the server names them, e.g. "This week (Fable)" from `model_scoped`), a bar each, when it resets ("Resets in 2 h 13 min · 14:13"), extra usage
when your plan has it, and when the numbers were updated. Clicking (or the card's one refresh
button) refreshes both.

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

## ChatGPT (Codex)

Jig never reads Codex's login or tokens. It starts `codex app-server` (the user's Codex CLI from PATH,
`readChatGptUsage` in `main/providers`), sends `initialize`, `initialized` and
`account/rateLimits/read` (`excludeResetCreditDetails: true`), reads the answer and stops it (20 s
timeout). Codex fetches the limits with its own sign-in; nothing is sent to ChatGPT, so it uses none of
your limits. The answer's `rateLimits.primary` / `.secondary` (`usedPercent`, `windowDurationMins`,
`resetsAt` in unix seconds) become `UsageWindow`s `primary` / `secondary` (`codexUsageFrom`):
"Current session (5 h)" and "This week" for 300 and 10080 minutes. `planType` is the badge,
`rateLimitReachedType` a "Limit reached" warning. "Authentication required" (no ChatGPT sign-in) or
no Codex makes it `unavailable`, and the footer hides the group. The account id in the answer is
dropped. `codex exec --json` reports only token counts, so the app-server is the source.

A second `UsageService` (`source: "Codex"`) asks 4 s after start, every 5 minutes, after every ChatGPT
call the provider layer makes (`onChatGptCall`, at most every 15 s), after the Codex sign-in ends, on
`usage.get` when older than 2 minutes, and on click.

## IPC

| Method / event | Result | |
|---|---|---|
| `usage.get` | `UsageByProvider` (`{ claude, chatgpt }`) | the current numbers; refreshes in the background when older than 2 min |
| `usage.refresh` | `UsageByProvider` | asks Claude Code and Codex now |
| event `usage.changed` | `UsageByProvider` | after every refresh or rate-limit event, of either provider |

## Jig's tool (D-386)

`jig_usage_limits` (read only, on the `jig` server, so every chat and the phone's concierge have it)
returns the same numbers as text (`usageReport`): per provider its plan, then per window % used,
% left and when it resets (relative and ISO), extra usage, a reached limit. It asks again first when
the numbers are over a minute old. A provider without windows says "no limit data" and why; never a
guess.

The fake engine (`JIG_ENGINE=fake`) reports 42 % (5 h), 18 % (week) and 31 % (Fable, a per-model weekly limit as the server names it);
`JIG_FAKE_USAGE=unavailable` acts like an API-key login, and a JSON value replaces the answer. For
ChatGPT it reports a Plus plan at 27 % (5 h) and 64 % (week); `JIG_FAKE_CHATGPT_USAGE=signedout` acts
like no ChatGPT sign-in, and a `RawCodexRateLimits` JSON replaces the answer.

Extra-usage amounts from the SDK are currency minor units. The UI formats them using the currency's decimal places (4000 EUR → €40.00), preserving raw amounts in the usage contract. This is display only and does not change the billing limit.
