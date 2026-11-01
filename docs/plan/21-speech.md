# Phase 21 — Speech

Status: built; needs checking on a real machine (D-208). Asked for by Jon: "I would like to be
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

Later ideas (backlog if wanted): talk-and-send hands-free mode, streaming partial text while
speaking, GPU (WebGPU) inference, reading replies aloud automatically.
