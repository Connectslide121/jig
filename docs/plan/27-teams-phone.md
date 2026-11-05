# Phase 27 — Jig on your phone through Teams

Status: in progress (D-370): session 1, the channel layer, done (D-377); session 2, the relay, done
(D-378), its tenant check waiting for Jon; session 3, the Teams channel's 1:1 chat, done (D-379); session 4, the team, channels and rooms, done (D-380); session 5, setup in Settings → Phone, done (D-381). Asked for by Jon (2026-11-05), happy with the Telegram bot (phase 26): "can
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
- New Azure bots are single-tenant (multi-tenant creation ended after 2025-07-31): app registration
  in the tenant where you use Teams. RSC insists on it: a sideloaded app's `webApplicationInfo.id`
  must be an app registered in the user's own tenant.
- Not yet known, checked by Jon with the tenant check below: whether members may register apps and
  create teams, whether team owners may grant an app resource-specific consent
  (`Channel.Create.Group`, `ChannelSettings.ReadWrite.Group`) in that tenant, and (optional step)
  whether the Azure Bot resource may live in a subscription of another tenant than its app
  registration (not documented). Without RSC, rooms fall back to threads in the team's General
  channel.

**Checked in Microsoft's docs (2026-11-05, session 2; details in D-370):** the relay validates
Bot Framework's JWT (issuer `https://api.botframework.com` also for single-tenant bots) and takes
its own tokens from the bot's tenant; new channel threads are `POST v3/conversations` with
`isGroup` + `channelData.channel.id`, replies go to `<channel>;messageid=<root>`; cards are Adaptive
Card **1.5** (Teams renders ≤ 1.6, phones included) with `Action.Submit`; pictures go inline as
`data:` URLs (≤ 1 MB, ≤ 1024²); Flex Consumption runs Node **22**/24, only in some regions, deployed
with `config-zip`; Table storage has no expiry (the relay prunes); the Bot Framework SDK is archived
(the relay uses `fetch`, D-378).

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

**Relay** (`relay/teams/`, TypeScript, Azure Functions v4 Node 22, Flex Consumption; D-378; the
contract with Jig is `relay/teams/src/protocol.ts`):

- `POST /api/messages`: Bot Framework endpoint. Validates the JWT (Bot Framework OpenID metadata,
  issuer, audience = the bot's app id, signing keys cached); once paired, drops anything not from the
  paired user (Entra object id + tenant), except the bot's own install events; stores activities
  (Table storage in the Function's storage account, 24 h TTL); remembers conversation references
  (1:1 chat, team, channels) for proactive messages.
- `GET /api/updates?after=<cursor>`: Jig's `getUpdates`, long poll up to ~25 s. Relay key in a header;
  a second Jig (another `x-jig-reader` within 90 s) gets 409 `another_reader` (D-379).
- `POST /api/send`, `PUT /api/send/<id>`: send or update an activity as the bot (text, Adaptive
  Card, image, a new thread in a channel or a reply in one), token from the bot's app credentials.
- `POST /api/channels`: create or rename a channel through Graph with the app's RSC token for the
  team. `GET /api/health`: version, paired, 1:1 chat and team known, channels, RSC granted.
- `PUT /api/pairing` (the account that sent the code; the relay doesn't know the code, Jig does),
  `DELETE /api/pairing` (Disconnect: forgets the pairing, 1:1 chats and waiting updates).
- Settings (written by setup): `MicrosoftAppId`, `MicrosoftAppPassword`, `MicrosoftAppTenantId`,
  `JIG_RELAY_KEY` (≥ 32 characters), `JIG_RELAY_STORAGE` (else `AzureWebJobsStorage`); without
  them every endpoint answers 503 `not_configured` naming what's missing.
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

### 2. The relay, and the tenant checks — done (D-378)
- [x] Verify Microsoft's current docs (single-tenant bots, Bot Framework token validation, proactive
      messages to a channel thread, RSC `Channel.Create.Group` and how it is granted, Adaptive Card
      version Teams renders on iOS, Flex Consumption) and note what changes this plan here and in
      D-370. (Above under "Checked in Microsoft's docs", details in D-370.)
- [x] `relay/teams/` as its own small package (`@jig/teams-relay`, a workspace), built to
      `relay/teams/dist/relay.zip` (`npm run relay:build`: one esbuild bundle + `host.json`,
      ~140 KB), carried in the installer as `resources/relay/teams-relay.zip` (`npm run dist` builds
      it first) so setup can deploy it: the endpoints above, JWT validation, Table storage, Bot
      Connector and Graph clients, relay-key check (constant-time), paired-user filter.
- [x] Unit tests (`relay/teams/src/*.test.ts`): token validation (good, wrong audience, wrong
      issuer, expired, unknown key, forged signature, endorsement, service URL), key refresh,
      paired-user filter, cursor paging and concurrent cursors, TTL, send/update/thread/reply/mention
      payloads, opening the 1:1 chat, channel creation/rename and a missing RSC grant, health, pairing.
- [x] A test package for Jon (tab-only, like the upload test), written up below under "Tenant
      check". The fallback (General threads) stays planned either way.
- Found on the way: the test package can't use a made-up app id (RSC wants an app registered in
  the user's tenant), so the check starts with Jon registering a throwaway app, which also answers
  whether setup's "app registration" step can work in his tenant.

### Tenant check (Jon, by hand; nothing waits for it)

Answers, before setup creates anything: may you register an app, create a team, and grant an app
resource-specific consent as the team's owner? About 15 minutes, in the tenant where your Teams is.
Note what each step shows (a screenshot of any error) and tell a Jig chat; the result goes into
"What we know" above and decides whether session 4 makes channels or uses General threads.

1. **Register a throwaway app** (does setup's app registration work for you?): Azure portal, signed
   in to your Teams tenant → Microsoft Entra ID → App registrations → New registration → name
   "Jig tenant check", "Accounts in this organizational directory only" → Register. Copy the
   Application (client) ID and the Directory (tenant) ID. Then Certificates & secrets → New client
   secret (shortest expiry) → copy its Value. If New registration is greyed out or refused, members
   can't register apps there: setup will need the portal guide or an admin (session 5), and you can
   stop here.
2. **Make the package** in this repository: `npm run teams:check -- package --app-id <client id>`
   writes `.tmp/teams-check/jig-tenant-check.zip` (a tab-only app, no bot, no code, asking a team
   for `Channel.Create.Group`, `ChannelSettings.ReadWrite.Group` and `ChannelMessage.Read.Group`).
3. **Create a team:** Teams → Teams → Join or create a team → Create team → From scratch → Private
   → "Jig check". Refused means members can't create teams: setup must then use a team you already
   own, or ask an admin.
4. **Add the app to it:** Teams → Apps → Manage your apps → Upload an app → Upload a custom app →
   the zip → **Add to a team** → "Jig check". Expected: a consent screen listing "Create channels in
   this team" and the channel settings permission, then the app is added. Note whether the consent
   shows and whether adding succeeds (the tab itself shows a page that won't load; that's fine).
5. **Prove it** (the same Graph call the relay makes): the team's ⋯ → Get link to team → copy. Then
   in PowerShell in this repository:
   `$env:JIG_CHECK_SECRET = "<secret value>"; npm run teams:check -- prove --app-id <client id> --team "<link>"`
   Expected: "✓ Created a channel" and "✓ Renamed it". A 403 means the grant isn't there or the
   tenant doesn't allow it: rooms will be General threads.
6. **Optional, an Azure Bot in another tenant's subscription** (only if the subscription you'd use
   is in another tenant than your Teams): `az account set --subscription <that one>`,
   `az group create -n jig-check -l westeurope`, then
   `az bot create -g jig-check -n jig-check-<random> --app-type SingleTenant --appid <client id> --tenant-id <Teams tenant id>`.
   Success means setup may put the bot there; an error means a subscription in the Teams tenant.
   Then `az group delete -n jig-check`.
7. **Clean up:** delete the "Jig check" team (⋯ → Delete the team), remove the app (Apps → Manage
   your apps), delete the app registration in the portal, and `Remove-Item Env:JIG_CHECK_SECRET`.

### 3. The Teams channel in Jig: 1:1 chat — done (D-379)
- [x] `main/phone/teams.ts`: relay client (long poll with backoff; offline and conflict states as
      Telegram), `TeamsChannel` implementing `PhoneChannel`. Conflict: a stable reader id per
      computer and Jig home; the relay answers 409 `another_reader` to a second Jig (a small relay
      change). The credential is `https://<relay>#<key>`, stored like the Telegram token.
- [x] Rendering: Jig's HTML subset as Teams' `xml` text (`<br>` line breaks); buttons as Adaptive
      Cards 1.5 (`Action.Submit` carrying the same ids as Telegram's callback data); answered on the
      computer → the card is updated ("Allowed on the computer"); several questions one card each.
- [x] Pictures: inline image attachments (PNG/JPEG as `data:` URLs, fitted in main to ≤ 1 MB and
      ≤ 1024²; one that can't fit is left out with a note), caption as text; `/screen`.
- [x] Fixed commands as typed text plus the manifest's `commandLists` (`teamsCommandLists`, for
      session 5's package; picked commands arrive bare and become commands); Jig itself in the 1:1 chat.
- [x] Fake relay server for tests (`JIG_TEAMS_RELAY` honoured only with the fake engine); unit tests
      (`teams.test.ts`, a relay test for the second reader); `e2e/phone-teams.spec.ts` (pair,
      permission card Allow, /status, Jig itself) with a rule in `e2e/affected.json`.
- Found on the way: the relay needs to hear about the pairing, so `PhoneChannel` gained optional
  `pair` / `unpair` (`PUT` / `DELETE /api/pairing`). Teams' 1:1 chat has no real replies: a quoted
  message's id is used when Teams sends it (check on a real tenant); threads (session 4) are the
  dependable way to talk to one chat. Teams can't show a typing indicator through the relay.

### 4. The Teams channel in Jig: the team, channels and rooms — done (D-380)
- [x] The "Jig" team: the relay learns the team from the install event (`/api/health`'s `team`);
      without one Jig has no places and Settings → Phone → Team says to add the app to a private
      team (session 5's setup walks you through it). On the install Jig says hello in General.
- [x] A channel per project, made on its first message (named after the project, renamed with it —
      also fixes the Telegram gap "renaming a project doesn't rename its topic"), remade when deleted
      (the relay's `channelDeleted` event, or a 404).
- [x] A thread per chat in its project's channel (every chat that writes gets one, headed
      "💬 chat · project"; writing there goes to the chat); it follows the chat live when opened from
      "Open thread" on a chat's messages, `/chats`, the chat's ⋯ menu → Open on my phone, and by
      itself for chats Jig starts from the phone; `mirror.ts` drives it like a Telegram room. `/close`
      in a thread stops mirroring (the thread stays the chat's).
- [x] What waits: in the thread (with an @mention of you) and as a short card in the 1:1 chat,
      answered from either, both updated.
- [x] Without RSC: rooms are threads in General headed with the project; Settings → Phone → Team
      says why (`PhoneState.topicsNote`).
- [x] e2e: a project's first message makes its channel, a room thread mirrors a turn, a reply in the
      thread reaches the chat.
- Found on the way: a bot only receives channel messages that @mention it unless the team grants
  `ChannelMessage.Read.Group`; the tenant check's package asks for it now, and session 5's app
  package must. Granting RSC after projects already wrote in General leaves them there until
  Disconnect.

### 5. Setup in Settings → Phone — done (D-381)
- [x] Settings → Phone starts with the channel: Telegram or Teams (segmented control, always in the
      same place; the rest of the page is that channel's). Switching asks first and disconnects the
      other.
- [x] "Set up Teams" opens a modal with a fixed list of steps (each row: step, what it creates,
      status at the far right; nothing moves when a step finishes):
      1. **Where:** the active tenant from the top bar (where your Teams is), a subscription, a
         region, a resource group (`jig-phone`).
      2. **Create** (every resource and `az` command listed before it runs; one Create runs them in
         order; a failure stops there with its error and Retry): app registration (single-tenant,
         client secret), resource group, storage account, Function app (Flex Consumption, Node 22,
         a region from `az functionapp list-flexconsumption-locations`), relay deployed
         (`resources/relay/teams-relay.zip` with `az functionapp deployment source config-zip`),
         app settings (bot id, tenant, secret, relay key; the names under "Relay" above), Azure Bot
         (F0, single-tenant, endpoint = `/api/messages`, Teams channel on; in a subscription of the
         Teams tenant unless the tenant check proved another one works).
      3. **Add to Teams:** Jig writes the app package (bot, personal + team scopes, RSC with `ChannelMessage.Read.Group` too (D-380), Jig's icons,
         command list) and shows it in Explorer, with the clicks: upload for yourself, create the
         private team "Jig", add the app to it. Each row ticks when the relay sees the install.
      4. **Pair:** a 6-digit code you send the bot in the 1:1 chat.
      Then Send a test, Disconnect, on/off, when (away / always), away after, finished messages, as
      Telegram.
- [x] `docs/guides/teams-phone.md`: the same in the Azure portal, for a tenant where `az` can't make
      an app registration, and what to ask an admin.
- [x] Disconnect forgets the key and conversations and lists the Azure resources to delete (with the
      `az group delete` command to copy); never deletes them itself.
- [x] Look at the modal and the page in Jig Dark, Light and an imported theme, narrow and wide
      (`shootView`).
- Found on the way: the relay had no way to say the app was added for yourself before pairing, so
  `Health.app` is new (a small relay change). Setup also registers the three resource providers
  (`az provider register --wait`) and reads the Function's host with `functionapp show` (Flex hosts
  aren't always `<name>.azurewebsites.net`); the relay settings go in before the bot. Settings is a
  tab, not a view, so the look was checked with screenshots at two window sizes
  (`e2e/ui-shots.spec.ts`), and Settings rows now put their control under the text in a narrow pane.
  Not tried against real Azure: the command flags are from the CLI's docs, session 6's real check
  proves them.

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
