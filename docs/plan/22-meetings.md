# Phase 22 — Teams meetings in Jig

**Goal:** a global Teams meeting room with live named captions, on-demand Claude questions using
explicit project context, notes and reviewed multi-project tasks (Jon, D-217).

- [x] Built-in Meetings add-on, global data and a dedicated call window independent of projects.
- [x] Azure/Entra setup script, public desktop sign-in, CLI-authorised resource access; calling tokens stay in memory, MSAL sign-in cache uses OS encryption (D-232).
- [x] Separate read-only default-calendar consent and two-week agenda, recurring events, join by link.
- [x] Pre-join devices/preview/mute/language, audio/video, incoming video/content, own screen/window share.
- [x] Pre-join device errors and link failures visible in the modal, device retry; remove pre-join acknowledgement/notice (D-222).
- [x] Production media on an owned ephemeral loopback origin accepted by ACS, with scoped IPC and CSP (D-222).
- [x] Speaker-attributed caption revisions, durable text, gap/restart handling, no raw audio or batch processing.
- [x] Explicit project per question; frozen transcript snapshots, read-only paginated tool, normal Claude Code chats.
- [x] Notes chat and save tool, editable owner/project/action review; idempotent paused Tasks integration.
- [x] Unit coverage and fake calling/engine regression for project switches, capture, notes and task destinations.
- [x] Real Microsoft sign-in and keyless calling-credential issuance on the target machine.
- [ ] Administrator approval for calendar consent; device preview, internal/external meeting join, screen sharing,
      caption attribution and long-call credential refresh on the target machine.
- [ ] Verify unsupported-content guidance in everyday meetings and future ACS SDK migration.

This is a working implementation with isolated validation; live account/device acceptance is pending.
No Work IQ, Teams DOM scraping, recording upload, background AI or direct Anthropic API is used.

- [x] Remember Agenda/Week globally (D-231).
- [x] OS-encrypted Microsoft sign-in cache and silent account restoration (D-232).
- [x] Bounded join wait and visible connection/call-end failures (D-234).
- [x] Diagnose/fix camera-off join stuck at None: SDK rejects present empty video list (D-234).
- [ ] Verify actual Teams participation with the corrected join options.
- [x] Lobby and call in separate windows: the lobby stays usable during a call, the call window comes forward to join, call and ring (D-292).
- [ ] Verify both windows with a real meeting and a real call on the target machine (D-292).
- [x] Your Teams chats in the lobby (list, read, reply) and Chat per person in Call… (D-296).
- [ ] Verify the chat list, unread state and Chat from Call… in a real tenant (D-296).
- [x] Captions in group meetings: wait for the meeting's capabilities, retry with backoff, keep Teams' real reason (D-321).
- [x] Transcribe on this computer (Whisper) when Teams captions aren't available, switch back without duplicates (D-321).
- [ ] Verify captions in a real group meeting and the local transcript's CPU on a 30-minute call (D-321).
- [x] Noise suppression on your microphone: Azure deep noise suppression by default, browser fallback, switch in the call's ⋯ menu and Devices… (D-322).
- [ ] Verify noise suppression on a real call: colleagues don't hear typing, voice quality matches Teams (D-322).
- [x] Devices follow Windows' default device, the selects name it, picks are remembered and device changes are followed in a call (D-323).
- [ ] Verify the devices on a real machine: headphones as default output, switching the default and unplugging during a call (D-323).
- [x] Share sound: the SDK has no supported way to send system sound, so the share dialog says "Sound isn't shared" instead of a switch (D-324).
- [ ] Add a "Share sound" switch (off on every open) once the calling SDK gets a public option for system audio (D-324).
