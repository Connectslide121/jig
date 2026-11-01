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

Later ideas: neural voices (Piper/Kokoro on the GPU) instead of the system's; reading every reply
aloud outside talking; a push-to-talk key.
