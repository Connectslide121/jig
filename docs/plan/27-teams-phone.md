# Phase 27 — Jig on your phone through Teams

Status: in progress (D-370): session 1, the channel layer, done (D-377). Asked for by Jon (2026-11-05), happy with the Telegram bot (phase 26): "can
we do a similar thing with Teams? so I can communicate through Teams?". His choices: a real bot with
a small relay (so Jig's messages buzz the phone like a colleague's), Telegram **or** Teams ("one or
the other"), Jig creates the Azure resources ("you have access"), and "a whole system … where i can
have chat rooms and stuff like that, as complete as we can do it", not one thread.

**Done when:** in Settings → Phone you pick Teams instead of Telegram and set it up in one modal
(Jig creates the Azure pieces with your `az`, you add the app to Teams, send a code), and then
everything phase 26 does works in Teams:

- a **1:1 chat with your "Jig" bot**: Jig itself (the concierge), `/status`, `/queue`, `/chats`,
  `/pause`, `/resume`, and everything that waits for you, with buttons (this chat buzzes);
- a private **"Jig" team** with **a channel per project** (Telegram's topics) and **a thread per
  chat** (Telegram's rooms: the chat mirrored live, what you write there goes to the chat);
- pictures, `jig_phone_send`, finished/stopped messages, answered-on-the-computer card updates.

## What we know (checked 2026-11-05)

- Jon's Teams lives in a work tenant where he is not an admin; he is Owner of an Azure subscription.
  Uploading a custom app for himself works there (tested with a tab-only package). An admin could
  approve the app if needed, but setup must not need one.
- Teams notifies only of messages someone else posts: Jig's Graph sign-in (Meetings) posts as you,
  so the phone channel needs a bot identity (D-370).
- A bot can't poll: Microsoft POSTs every activity to the bot's public endpoint. Hence the relay.
- New Azure bots are single-tenant: app registration in the tenant where you use Teams.
- Not yet known, checked in session 2 with a throwaway test: whether members may create teams, and
  whether team owners may grant an app resource-specific consent (`Channel.Create.Group`) in that
  tenant. Without RSC, rooms fall back to threads in the team's General channel.

## How it fits together

```
Teams (phone) ⇄ Bot Framework ⇄ relay (Azure Function, yours) ⇄ Jig (long polling, relay key)
```

**Where things appear in Teams**

| Teams place | Telegram today | What's there |
|---|---|---|
| 1:1 chat with the bot | the private chat / 📌 Jig topic | Jig itself, fixed commands, everything that waits for you (buzzes), the test |
| "Jig" team → General | — | the team's welcome, chats without a project |
| a channel per project | a topic per project | that project's chats' messages: one thread per chat |
| a thread in a project's channel | a room ("💬 title") | the chat mirrored live: your messages from the computer, Claude's replies (edited while they grow), steps, pictures, what waits (cards), Finished |

- What waits for you shows in the chat's thread **and** as a short card in the 1:1 chat ("Shop · Fix
  login wants to run `npm test`", Allow / Deny / Open thread), so the phone buzzes once and you can
  answer from either; answering one updates both.
- Channel posts don't buzz unless you follow the channel; the bot @mentions you in a thread only
  for what needs you. Finished messages stay quiet.
- Writing in a chat's thread goes to that chat; in a project channel's new post, to Jig itself with
  that project preset; in the 1:1 chat, to Jig itself. Same rules as phase 26b's table.

**Relay** (`relay/teams/`, TypeScript, Azure Functions v4 Node, Flex Consumption):

- `POST /api/messages`: Bot Framework endpoint. Validates the JWT (Bot Framework OpenID metadata,
  issuer, audience = the bot's app id, signing keys cached); once paired, drops anything not from the
  paired user (Entra object id + tenant), except the bot's own install events; stores activities
  (Table storage in the Function's storage account, 24 h TTL); remembers conversation references
  (1:1 chat, team, channels) for proactive messages.
- `GET /api/updates?after=<cursor>`: Jig's `getUpdates`, long poll up to ~25 s. Relay key in a header.
- `POST /api/send`, `PUT /api/send/<id>`: send or update an activity as the bot (text, Adaptive
  Card, image, a new thread in a channel or a reply in one), token from the bot's app credentials.
- `POST /api/channels`: create or rename a channel through Graph with the app's RSC token for the
  team. `GET /api/health`: version, conversations known, RSC granted.
- No other state, no logs of message text. The bot's client secret only in the Function's settings.

**Jig**: a `PhoneChannel` interface between `PhoneService` and the transport, a Teams channel that
talks to the relay, the setup modal, the app package generator. The relay key is kept like the
Telegram token (safeStorage or memory, never the renderer, logs or add-ons).

## Sessions

Each session is one queued task: it reads this file, `26-phone.md`, D-350 and D-370 first, keeps
Telegram working, and ticks its items here.

### 1. The channel layer (no behaviour change) — done (D-377)
- [x] `PhoneChannel` interface in `main/phone/channel.ts`: who's paired, send (text, buttons,
      silent, mention), edit, photo, voice (optional), receive (Jig's own `PhoneUpdate`: text, tap,
      voice, with sender, place and reply-to), places (Telegram: topics; Teams: channels and threads;
      "create a place for a project / for a chat", rename, delete), command menu (optional).
      Capabilities as flags (voice, silent, edits, places), like `ENGINE_CAPABILITIES`.
- [x] Telegram becomes `TelegramChannel`; `PhoneService`, `mirror.ts` and `concierge.ts` only use the
      interface. `messages.ts` builds channel-neutral messages (button rows and, instead of
      Markdown, the small HTML subset they already used: escaped and masked in one place, rendered
      by Teams too; D-377); each channel renders them (Telegram: HTML as is + inline keyboards).
- [x] `phone.channel` setting ("telegram" default, "teams"; protected; `SETTINGS_GUIDE`,
      `docs/reference/state.md`); `phone.json` keeps each channel's saved state apart
      (`{ telegram?, teams? }`, the old flat file read as Telegram's); switching disconnects the
      other. Until session 3, picking Teams leaves the phone off ("not in this version yet").
- [x] Existing unit tests and `e2e/phone.spec.ts` pass unchanged; new `telegram.test.ts` (reading
      updates, offsets, error reasons, rendering) and `switch.test.ts` (switching channels).
- Found on the way: rooms weren't read back from `phone.json` after a restart (the schema lacked
  `rooms`); fixed with the per-channel schema.

### 2. The relay, and the tenant checks
- [ ] Verify Microsoft's current docs (single-tenant bots, Bot Framework token validation, proactive
      messages to a channel thread, RSC `Channel.Create.Group` and how it is granted, Adaptive Card
      version Teams renders on iOS, Flex Consumption) and note what changes this plan here and in
      D-370.
- [ ] `relay/teams/` as its own small package, built to `relay/teams/dist/relay.zip` (`npm run
      relay:build`), copied into the app's resources so setup can deploy it: the endpoints above,
      JWT validation, Table storage, Bot Connector and Graph clients, relay-key check (constant-time),
      paired-user filter.
- [ ] Unit tests: token validation (good, wrong audience, wrong issuer, expired, unknown key),
      paired-user filter, cursor paging, TTL, send/update/thread payloads, channel creation.
- [ ] A test package for Jon (tab-only, like the upload test): can he create a team, and does adding
      an app with RSC to it show the consent and succeed. Written up in this file; the fallback
      (General threads) stays planned either way.

### 3. The Teams channel in Jig: 1:1 chat
- [ ] `main/phone/teams.ts`: relay client (long poll with backoff; offline and conflict states as
      Telegram), `TeamsChannel` implementing `PhoneChannel`.
- [ ] Rendering: Markdown as Teams' supported Markdown/HTML; buttons as Adaptive Cards
      (`Action.Submit` carrying the same ids as Telegram's callback data); answered on the computer →
      the card is updated ("Allowed on the computer"); several questions one card each.
- [ ] Pictures: inline image attachments (PNG/JPEG, size-capped), caption as text; `/screen`.
- [ ] Fixed commands as typed text plus the manifest's `commandLists`; Jig itself in the 1:1 chat.
- [ ] Fake relay server for tests (`JIG_TEAMS_RELAY` honoured only with the fake engine); unit tests;
      `e2e/phone-teams.spec.ts` (pair, permission card Allow, /status, Jig itself) with a rule in
      `e2e/affected.json`.

### 4. The Teams channel in Jig: the team, channels and rooms
- [ ] The "Jig" team: setup asks you to create a private team named Jig and add the app to it (Teams
      can't let a bot create a team without admin consent); the relay learns the team from the
      install event.
- [ ] A channel per project, made on its first message (named after the project, renamed with it —
      also fixes the Telegram gap "renaming a project doesn't rename its topic"), remade when deleted.
- [ ] A thread per chat in its project's channel: opened from "Open thread" on a chat's messages,
      `/chats`, the chat's ⋯ menu → Open on my phone, and by itself for chats Jig starts from the
      phone; `mirror.ts` drives it like a Telegram room (last four turns, then live, edits while
      Claude's reply grows, pictures, cards for what waits, Finished). `/close` in a thread stops
      mirroring.
- [ ] What waits: in the thread (with an @mention of you) and as a short card in the 1:1 chat,
      answered from either, both updated.
- [ ] Without RSC: rooms are threads in General headed with the project; setup says why.
- [ ] e2e: a project's first message makes its channel, a room thread mirrors a turn, a reply in the
      thread reaches the chat.

### 5. Setup in Settings → Phone
- [ ] Settings → Phone starts with the channel: Telegram or Teams (segmented control, always in the
      same place; the rest of the page is that channel's). Switching asks first and disconnects the
      other.
- [ ] "Set up Teams" opens a modal with a fixed list of steps (each row: step, what it creates,
      status at the far right; nothing moves when a step finishes):
      1. **Where:** the active tenant from the top bar (where your Teams is), a subscription, a
         region, a resource group (`jig-phone`).
      2. **Create** (every resource and `az` command listed before it runs; one Create runs them in
         order; a failure stops there with its error and Retry): app registration (single-tenant,
         client secret), resource group, storage account, Function app (Flex Consumption), relay
         deployed, app settings (bot id, tenant, secret, relay key), Azure Bot (F0, single-tenant,
         endpoint = `/api/messages`, Teams channel on).
      3. **Add to Teams:** Jig writes the app package (bot, personal + team scopes, RSC, Jig's icons,
         command list) and shows it in Explorer, with the clicks: upload for yourself, create the
         private team "Jig", add the app to it. Each row ticks when the relay sees the install.
      4. **Pair:** a 6-digit code you send the bot in the 1:1 chat.
      Then Send a test, Disconnect, on/off, when (away / always), away after, finished messages, as
      Telegram.
- [ ] `docs/guides/teams-phone.md`: the same in the Azure portal, for a tenant where `az` can't make
      an app registration, and what to ask an admin.
- [ ] Disconnect forgets the key and conversations and lists the Azure resources to delete (with the
      `az group delete` command to copy); never deletes them itself.
- [ ] Look at the modal and the page in Jig Dark, Light and an imported theme, narrow and wide
      (`shootView`).

### 6. Docs and the real check
- [ ] `docs/architecture.md` (phone: channels, relay), `docs/reference/ipc.md`,
      `docs/reference/state.md`, `docs/status.md` (what works, how to try it, what needs a real
      tenant), the "What Jig can do" line, `AGENTS.md` phone rule (the relay key is a credential; the
      bot secret never leaves Azure), README headline.
- [ ] Real check with Jon (not in the queue, he does it): set up in his tenant, the team and a
      project channel, a room, a permission from the phone, a reply in a thread, a picture, a
      sleeping PC catching up.

## Left out (for now)

- Voice notes: bots don't receive Teams voice messages.
- Running Telegram and Teams at the same time (Jon: one or the other).
- A shared, Jig-hosted bot: against "your own" (D-350); every user's tenant would need it.
