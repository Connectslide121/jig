# Phase 26 — Jig on your phone

Status: built; needs checking with a real bot and phone (D-348). Asked for by Jon: "a way to
communicate to Jig from my phone … for free. I have an iPhone … I often leave Jig working and go for
a walk", then "something like a message bot or even emails … I want Jig to be able to reach me if
needed and vice versa" (not remote desktop).

- [x] A Telegram bot of your own (free, two-way, buttons, no router changes, no email password):
      `main/phone/` (`telegram.ts` client, `messages.ts` pure text and decisions, `service.ts`
      pairing, polling and routing, `index.ts` Electron wiring).
- [x] Settings → Phone: set up in a modal (paste @BotFather's token → Connect → send the 6-digit
      code from your phone); then Send a test, Disconnect, on/off, when (away / always), away after,
      finished messages. `phone.*` settings, protected.
- [x] The token encrypted with the OS (safeStorage) in `phone.json`, or kept only until Jig closes;
      it never reaches the renderer. Only the paired account's private chat is read; stale messages
      (> 10 min) ignored; five wrong codes make a new one.
- [x] Jig → phone: permission requests (Allow / Deny), one-choice questions (options as buttons),
      several questions (Skip, reply with answers), plans (Approve / Keep planning), finished with
      Claude's last reply, stopped with the error. Masked and escaped. Answered elsewhere: the message
      is edited ("Allowed on the computer"). When away: requests waiting from before are sent too.
- [x] Phone → Jig: a reply to a message goes to its chat (answers what waits there, otherwise a
      message into the turn); plain text goes to the last chat Jig told you about; /chats picks one.
- [x] `jig_phone_send` for Claude (only when asked, or blocked on you); fake engine "text my phone".
- [x] Unit tests (`messages.test.ts`, `service.test.ts`), `e2e/phone.spec.ts` with a fake Telegram
      server.
- [ ] Check with a real bot on an iPhone: pairing, buttons, replies, away detection on Windows
      (idle and locked), a sleeping PC (nothing arrives until it wakes).
- Email was considered and left out: it needs an app password stored in Jig and polling a mailbox,
  and has no buttons.

## Phase 26b — Talk to Jig itself, in topics (planned)

Asked for by Jon (2026-11-04), after reading the first version: "I often let Jig run, start a queue,
and go work out … I'd like to be notified and see how everything is going … not only talk to a chat
but to Jig itself, like the voice commands: go to the Podium project, start a new chat, tell it to
look at the board, card 29992, prepare a plan, then send it to me for approval or iterate." And: "would
I see everything in the same thread?" The first version puts every chat in one thread and sends plain
text to the last chat that wrote: fine for two chats, a wall with a running queue.

**Topics, not one thread.** Telegram lets a bot split its private chat into topics (Bot API 9.3,
2025-12-31; the bot creates them itself since 9.4, 2026-02-09). The user switches on topics for the
bot in @BotFather's Mini App and turns off "users may create topics"; `getMe` reports both
(`has_topics_enabled`, `allows_users_to_create_topics`). Setup checks it and says how to turn it on.
Fallback when it's off: today's single thread, with the chat named on every message. No group needed.

- **📌 Jig**: talk to Jig itself (below), the queue digest and one pinned status message that is
  edited in place (what each project is doing, what needs you), never a stream of new messages.
- **One topic per project** (created on its first message, renamed with the project, colour from the
  project's): every message from that project's chats, each headed with its chat. Not one per chat:
  a day of queued tasks would make dozens.
- **Quiet by default:** finished messages are sent with `disable_notification`; only what needs you
  (permission, question, plan) and a queue's digest buzz the phone.

**Where what you write goes** (replaces "plain text goes to the last chat"):

| You write | It goes to |
|---|---|
| a reply to a message about a chat | that chat (as today: the answer to what waits, else a message into the turn) |
| a button | the request it belongs to (as today) |
| `/status`, `/queue [project]`, `/chats`, `/pause`, `/resume`, `/help` | fixed commands, instant, no Claude |
| anything else, in 📌 Jig | the concierge, with no project preset |
| anything else, in a project topic | the concierge, with that project preset |

Nothing ever lands in a working chat unless you reply to one of its messages or pick it with `/chats`.

**Fixed commands (no Claude):** the same answers as the voice status commands (D-278, phase 25),
moved to `main` so the phone and voice share them: chats per project and what they're doing, the
Tasks queue of a project (`addonService().call("tasks", "overview" | "list")`), pause/resume a
queue. Buttons under the answer: open a chat's last reply, pause, resume.

**The concierge: a chat with Jig itself.** A chat of its own kind (`kind: "concierge"`, like
`builder`: hidden from the chat lists, one per day, opened on the computer from the phone's settings
page), running on the helper model with only Jig's tools (no file tools, no shell, cwd `~/.jig`):

- what exists: projects, the Tasks tools (`addon_tasks_*`), Boards (`addon_boards_*`), Workflows,
  Tests, Pipelines (read; running deploys stays manual), `jig_list_projects`;
- new tools: `jig_chat_start` (project, prompt, permission mode: default `plan`; the project's
  defaults for model and folder; returns the chat's id and title), `jig_chat_send` (into an existing
  chat), `jig_chat_read` (status, last reply, what waits), `jig_chats_list` (per project, status).
  They wrap `createChat` and `sessionManager().send/snapshot` in `main/sessions`.
- Its replies go back to the topic you wrote in. A chat it starts is announced with its title and
  then talks in its project's topic like every chat, so your example runs as: "Podium: look at card
  29992 and prepare a plan" in 📌 Jig → "Started *Card 29992 plan* in Podium" → the plan arrives in
  🟣 Podium with Approve / Keep planning → reply with changes to iterate, Approve to let it work.
- Safety: chats started from the phone start in plan mode unless you say otherwise; the concierge
  can't approve anything for another chat (only buttons and replies from you do); it never queues
  deploys.
- Disclosure: its messages are marked "🤖 Jig (AI)"; the topic's first message says it can be wrong.

**Also in 26b:**
- [x] Remember which message belongs to which chat in `phone.json` (message id → chat, last 300), so
      replies still work after Jig restarts.
- [ ] Queue digest: one message when a project's queue ends ("8 done, 1 failed, 1 needs you"), with
      buttons per failed or waiting task; per-task "Finished" messages off while a queue runs.
- [x] Keep Windows awake (`powerSaveBlocker`, `prevent-app-suspension`) while a chat works or waits
      for you and the phone is connected; setting `phone.keepAwake`, default on.
- [x] Finished messages arrive silently (`disable_notification`); what waits for you still buzzes.
- [ ] Several questions: one message per question with its options as buttons, sent in turn.
- [ ] Voice messages: a Telegram voice note is transcribed with Jig's Whisper (`speech.*`) and
      handled as text (shown back as "🎙 …" so you see what was understood).
- [ ] Settings → Phone: the topics check (on / how to turn it on), the concierge's model, a link to
      open the concierge chat on the computer.

**Order:** check the first version with a real bot (above) → persistence, keep awake, quiet finished
messages → topics → fixed commands → concierge and its chat tools → digest, questions, voice.
