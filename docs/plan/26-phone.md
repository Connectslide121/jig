# Phase 26 — Jig on your phone

Status: built; needs checking with a real bot and phone (D-337). Asked for by Jon: "a way to
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
