# Phase 21 — Speech

Status: built; needs checking on a real machine (D-208, D-209). Asked for by Jon: "I would like to be
able to talk to the AI".

- [x] Dictation in the composer: a mic button and Ctrl/Cmd+Shift+Space; click again to stop, Esc
      throws the recording away; the text goes in at the caret and is not sent by itself.
- [x] Local Whisper (transformers.js, WebAssembly) in a Web Worker; no audio leaves the machine.
- [x] The model is downloaded once, after asking, with a progress dialog; kept in `~/.jig/models`
      and served over `jig-speech:`; works offline afterwards.
- [x] Microphone access: macOS asks; a denied Windows/macOS privacy switch is explained.
- [x] Read aloud on Claude's messages (system voices; code blocks are skipped).
- [x] Settings → Speech: model (tiny/base/small), language, voice; remove downloaded models.
- [x] Fake microphone and transcriber for e2e (`e2e/speech.spec.ts`); a real inference check with
      whisper-tiny in the built app.
- [ ] Check on Windows and macOS: the real download, microphone permission, accuracy and speed of
      `base` and `small`, and the packaged app (`NSMicrophoneUsageDescription`).

## Real time and talking with Claude (D-209)

Asked for by Jon: "as real time as possible" and "talk to the AI real time, it answers me in a
speech live conversation, and when we agree to the task … it starts working".

- [x] WebGPU: Whisper on the graphics card (fp32 encoder, q4 decoder) when there is one, else the
      processor (q8); `speech.gpu`; each is downloaded on its own (`variants` in `speech.models`).
- [x] Live text: the microphone is read at 16 kHz with Web Audio; Whisper reads the current piece
      again every ~250 ms and the words appear (and get corrected) while you speak
      (`speech.live`); long speech is cut at a quiet moment into 20 s pieces.
- [x] Talk with Claude: the Talk button (sound waves) (and + → Talk with Claude). Voice activity detection
      ends your turn after a pause (`speech.pause`) and sends it; Claude's reply is read sentence
      by sentence as it streams (`speech.rate`); talking over it stops it.
- [x] Talking puts the chat in plan mode and tells Claude to answer briefly (`voice` on the chat,
      `sessions.setVoice`); "yes, go ahead" approves the plan and Claude starts working; anything
      else goes back as feedback. Tool permissions: yes/no; "bye" ends it; "stop" interrupts work.
- [x] e2e: live text while recording; a spoken conversation through the fake engine's plan.
- [ ] Check on a real machine: WebGPU speed and the GPU download, echo without headphones,
      turn-taking feel with `speech.pause`, how well Whisper hears short answers ("yes").

## The talking window (D-210)

Asked for by Jon: "a dedicated interface … sound waves when we talk … one line showing the sentence
being said", "Claude able to search code while we are talking", "when I give it the go ahead it
should start its work and the speech mode should turn off", "some sound that indicates it's working
… during the work", "saying bye should not stop the chat or Claude's work", controls for closing,
going ahead and the transcript.

- [x] A window over the chat while talking (`VoiceDialog.tsx`), always the same size: sound waves
      (`Waves.tsx`, `meter.ts`) for you and for Claude, the status line with what Claude is doing,
      and the sentence being said now.
- [x] Conversation tab: every line said, scrollable, follows the end unless you scroll up; Plan tab:
      the plan Claude asks to start, shown as it comes.
- [x] Controls: Mute, Stop Claude's voice, End talking, Go ahead.
- [x] Claude looks at the code while you plan (guidance: search and read, say what it's looking at;
      plan mode keeps it read-only); a soft note while it thinks.
- [x] Go ahead (said: `isGoAhead`, or the button): approves the plan, or asks for it and approves it
      as it comes; talking ends; Claude works in the chat's work mode.
- [x] Working sound (`cues.ts`): a soft note every 2.4 s while the chat works, a chime when done or
      when it needs you; `speech.workSound`.
- [x] "Bye" ends only talking: Claude's work goes on (followed by the sound), and the chat returns to
      its own permission mode when idle.

## A calmer talking window, and planning a task queue (D-218)

- [x] Redesign: one wide window, no tabs: waves in the centre, the conversation under them fading
      out upwards, controls along the bottom; the Now line is gone.
- [x] The plan as a card in the right margin, only while Claude asks to start something.
- [x] Claude proposes a task queue (`addon_tasks_add`) instead of one plan when the work clearly
      needs several chats, or when the user asks; the go-ahead queues and starts it.
- [x] Working sound louder (gain 0.09) and more frequent (every 1.4 s).
- [ ] e2e for a spoken task queue (needs a fake-engine behaviour that calls `addon_tasks_add` in
      plan mode).
- [x] e2e: looking at the code, the transcript and plan tabs, go-ahead by voice and by button, mute,
      bye during work.
- [ ] Check on a real machine: waves with a real microphone, word pulses with your system voice,
      the volume of the sounds.

Later ideas: neural voices (Piper/Kokoro on the GPU) instead of the system's; reading every reply
aloud outside talking; a push-to-talk key.
