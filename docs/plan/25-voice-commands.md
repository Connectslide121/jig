# Phase 25 — "Hey Jig" voice commands

Status: in progress (D-277). Asked for by Jon: "control Jig with voice commands … like Siri … say
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
- [ ] Listening for "Hey Jig" while Jig runs (also minimized or behind other windows, never when
      closed): the voice detector notices speech, Whisper reads the short phrase, the matcher looks
      for the wake words. Off by default; `speech.wake`; Settings → Speech; a listening indicator.
- [ ] A chime on waking, spoken answers through the existing voices; "I didn't get that" for unknown
      commands (nothing goes to Claude unless you say "ask Claude").
- [ ] Handlers: chats (new chat / continue / talk to / talk mode open in Talk mode; switch project;
      add task; ask Claude), checking in (from Jig's own state), running (tests, scripts, workflows,
      pipeline deploy and pull after a spoken yes, fetch), Jig itself (note, mute, volume, repeat,
      stop listening, what can I say).
- [ ] Spoken announcements when a chat finishes or needs you, and when a pipeline you started ends;
      each can be switched off.
- [ ] e2e with the fake microphone and transcriber.
- [ ] Check on a real machine: waking from minimized, idle CPU, how well Whisper hears "Hey Jig".
