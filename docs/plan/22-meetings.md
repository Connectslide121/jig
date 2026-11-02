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
