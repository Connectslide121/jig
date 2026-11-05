# Phase 25 — "Hey Jig" voice commands

Status: built; needs checking on a real machine (D-278). Asked for by Jon: "control Jig with voice commands … like Siri … say
hey Jig and Jig should wake up", for cooking or being around the house without looking at the
screen; "talking to Jig more than talking to Claude"; commands "should not use my Claude
subscription"; "somewhere where we can see all the voice commands that we support".

- [x] One command list (`features/speech/commands/grammar.ts`) in four groups: Chats, Checking in,
      Running things, Jig itself; names (projects, chats, repositories, workflows, scripts) are slots
      matched against your own lists, never hard-coded.
- [x] Matcher on this computer (`commands/match.ts`): the wake phrase as Whisper spells it, polite
      padding, contractions, fuzzy names; unit tests.
- [x] Voice commands section on "What Jig can do" and Jig menu → Voice commands, drawn from the
      same list; commands that run something risky say "Asks for a yes".
- [x] Listening for "Hey Jig" while Jig runs (also minimized or behind other windows, never when
      closed; the main window isn't throttled while it's on): the voice detector notices speech,
      Whisper reads the first 2 s of it, the matcher looks for the wake words; only then is the rest
      read. Off by default; `speech.wake` (protected); Settings → Speech → Hey Jig; Jig menu action;
      a status bar item (`WakeStatus.tsx`) of fixed width that opens the commands.
- [x] The status bar item always shows (D-387): dimmed while off, a click turns listening on or off
      (`toggleWake`, the same as the Jig menu action), a right-click opens Train Hey Jig…,
      Voice commands… and Speech settings…; one icon per meaning (Mic listening, MicOff not
      listening, VolumeX Jig's voice muted). Settings → Speech → Hey Jig: Jig's voice Mute/Unmute,
      Train…, Show the commands.
- [x] Train Hey Jig on your voice (D-389): a modal with five takes (live level, a tick or "say it
      again" per take), asked for when Hey Jig is turned on untrained; `speech.wakeProfile` keeps
      Whisper's text per take, learned starts, median loudness and voice score, never audio (D-388).
      Used for learned wake starts, the tuned gate and voice score; for everyone a "sounds like jig"
      matcher, a 0.5 s pre-roll and a Whisper prompt (`decoder_input_ids`) on the wake window only.
- [x] Readout of every wake check (text, woke or why not, loudness, voice score) in the training
      dialog, and `console.debug("[hey-jig]")` in dev.
- [ ] On a real machine: train with Jon's voice, then count misses and false wakes over a day; the
      readout says why each one was ignored. Audio matching (MFCC + DTW) only if that still misses.
- [x] A chime on waking, spoken answers through the existing voices; "I didn't get that" for unknown
      commands (nothing goes to Claude unless you say "ask Claude"). "Hey Jig" alone waits 8 s for
      the command; a yes/no question waits 8 s for the answer.
- [x] Handlers (`commands/run.ts`, through existing IPC and add-on host methods): chats (new chat /
      continue / talk to / talk mode open in Talk mode via `requestTalk`; switch project; add task;
      ask Claude), checking in (from Jig's own state), running (tests, scripts, workflows, pipeline
      deploy and pull after a spoken yes, fetch), Jig itself (note, mute, repeat, stop listening,
      what can I say).
- Volume (louder/quieter) left out: Jig has no volume of its own to change.
- [x] Spoken announcements when a chat finishes, needs you or fails (`speech.announce`).
- [ ] Announce when a pipeline you started ends (the Pipelines add-on's notifications).
- [x] e2e with the fake engine (`jig-fake-wake` events): `voice-commands.spec.ts`.
- [ ] Check on a real machine: waking from minimized, idle CPU (the voice detector runs on every
      frame; Whisper only on speech), how well Whisper hears "Hey Jig" (add spellings to `WAKE` in
      `match.ts`), Jig not hearing its own answers, a real deploy by voice (you run it).
