# Meetings

Join Teams meetings in a separate Jig window, capture named live captions, ask Claude with any
project's context, and review actions for the task queue. Meetings are global (D-217).

- **Open:** Chats → Meetings, or search for Meetings. The call stays in its own window while
  you switch projects, chats and files. Closing an active window offers Keep meeting running or Leave.
- **Setup:** create a public desktop Entra registration and an Azure Communication Services resource
  with `scripts/setup-meetings.ps1 -SubscriptionId <subscription-id>` (usage charges apply). It writes
  nonsecret settings to ignored `.azure-local/meetings.json`; source builds import them on their next
  normal startup. Packaged/custom-home installations enter them in Connection. No client secret or
  resource key is needed. Your existing `az login` authorises the resource; the signed-in Azure user
  needs resource access permitting identity token issuance (Owner/Contributor are supported).
- **Connect Microsoft:** uses the external system browser, a desktop loopback redirect and MSAL's
  OS-encrypted cache. Calling asks for delegated Teams.ManageCalls and Teams.ManageChats. Calendar
  consent (Calendars.ReadBasic) happens separately on Refresh calendar, so a blocked calendar does
  not prevent joining by link. Jig restores the account after restarting; Disconnect deletes the cache. If tenant policies require approval,
  an administrator approves those permissions for the `jig-meetings` registration.
- **Lobby view:** Agenda/Week is remembered across window closes and app restarts.
- **Upcoming:** refresh the next 14 days of your default Microsoft calendar (recurrences expanded,
  cancelled events excluded). Events with Teams join links have Join. Join from link works without
  calendar permission. Some imported invitations have no structured join link: paste it instead.
- **Before joining:** choose microphone, speakers and camera, preview the camera, choose whether to
  join muted, and choose a spoken language (including English and Swedish).
  No acknowledgement checkbox or notice is shown before joining. The status area shows device readiness. Device and link errors appear inside the modal;
  after device setup fails, use Retry devices once the device/access problem is corrected.
- **During:** microphone/camera and in-call device controls, participant video, incoming screen shares, your screen/window
  sharing with a modal picker and Stop sharing, live text and capture status. Call controls always
  affect the active call even while inspecting a past transcript. Retry captions keeps the language chosen before joining. System-audio sharing isn't enabled.
- **Connection status:** Joining lasts until Connected or the Teams lobby; stalled joins time out
  after 90 seconds with a visible error. Call-end errors include Microsoft's numeric codes.
  Camera-off joins omit video options (the SDK rejects an empty stream list).
- **Transcript:** follows the latest speech until you scroll up to read earlier material. SDK caption events supply speaker identifiers/names, timestamps and partial/final
  text. Partial sentences are replaced, late partials cannot overwrite finals, and repeated utterances
  are retained. Speech before joining/caption activation is unavailable. Capture failures and restarts
  are marked as gaps/interrupted. No raw audio/video file or diarization job exists.
- **Ask Claude:** explicit Meeting only, Current Jig project or a selected project; the normal chat
  opens in Plan mode. It receives a frozen snapshot via `jig_meeting_read`, paginated at 40k characters.
  The selected chat keeps its project; a later question can use another project. Each Ask starts a new
  chat in this version; continue the opened chat normally and request newer meeting material by id.
  Capture invokes no AI on its own. Transcript speech is evidence, never executable instructions.
- **Meeting history (D-250):** the top-bar Meetings button → Meeting history (or Tools → Meeting
  history) opens every past meeting in a tab of Jig's main window, with search, notes and transcript.
  From there: Start a chat (pick a project; the chat's draft mentions the meeting), Generate notes,
  Review actions, and ⋯ → Copy as Markdown, Export Markdown…, Copy chat reference, Rename…, Delete….
- **Teams calls (D-254):** Call… in the meetings window calls someone in your organisation (recent
  calls, people you work with, or a search); calls ring in Jig while it runs (Connection → Ring in
  Jig for Teams calls). Calls are kept with meetings, with Call back. Finding people needs Graph
  User.ReadBasic.All and People.Read.
- **Mention a meeting in a chat:** type `@` and a meeting's name (or `@meeting`) in any chat; the
  picker lists meetings after files. `@meeting:<name>-<id>` tells Claude to read that meeting with
  `jig_meeting_read`.
- **Generate notes:** opens a normal Claude Code chat. Concise notes (a short summary, decisions, open
  questions, one line per action) and owner/project/evidence-bearing actions are saved through `jig_meeting_save_notes` after its normal
  tool approval. Regenerating notes retains already queued actions. Review actions opens a modal to
  edit prompts/owners and choose each task's project. Select explicitly; nothing is preselected.
- **Add selected to queue:** goes through Tasks' shared `addReviewed` export, idempotent per source
  action, with standalone prompts and meeting references. It pauses the queue and defaults tasks to
  Plan mode; start the queue explicitly from Task queue. General actions remain notes until a project
  is assigned. The Tasks add-on must be enabled.

The global `addon-data/meetings.json` is written atomically through the state module. Frozen question
snapshots are in `addon-data/meeting-snapshots/`. MSAL sign-in persists only as OS-encrypted
ciphertext in `cache/microsoft/<tenant-client-hash>.cache`, with no plaintext fallback. Calling
tokens remain in memory, delivered only to the owned meeting window. Logs/activity contain action ids,
not transcript text, resource keys or credentials. Media uses the renderer SDK with host-managed
permissions, while authentication, Graph requests, files and durable call lifecycle belong to main.
The public add-on entry points are `ctx.meetings.open()` and `ctx.meetings.history()`; the media/IPC implementation is host-owned.

Teams policy/role restrictions apply. PowerPoint Live, Whiteboard and breakout participation are not
supported by the SDK; use normal Teams for those meetings. Real Microsoft sign-in and keyless calling-credential issuance passed on the target machine. Calendar
consent requires administrator approval in the configured tenant. Device capture, real meeting join,
caption attribution, sharing and long-call refresh still need an actual meeting.
ACS Teams interoperability remains supported through Microsoft's announced SDK transition; monitor
the retirement/breaking-change guidance before upgrading beyond the pinned SDKs.

For isolated tests, `JIG_ENGINE=fake JIG_MEETINGS=fake` supplies calendar, captions and media controls
without an account, device access or billable call. Fake notes exercise the real transcript/notes
tools and queue review. `e2e/meetings.spec.ts` covers the complete flow and project independence;
`e2e/meeting-history.spec.ts` the history tab and mentions.
