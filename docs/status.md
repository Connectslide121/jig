# Status

ChatGPT chats close the gaps (2026-11-04, D-315): a ChatGPT chat now has **Plan only** (Codex looks
around read-only, then shows its plan on the same plan card as Claude; approving switches the mode and
Codex carries the plan out), **question cards** (Codex asks with choices on the same card, which voice
mode answers too), a **suggested next message** after each turn (a small ChatGPT one-shot, Settings →
AI features → Next-message suggestions, behind the existing suggestions switch), and **Claude Code's
skills** next to Codex's own (Settings → Chats → ChatGPT chats → Claude Code's skills; nothing is
copied). **Open a saved chat…** (was Open a Claude Code chat…) lists your Codex threads with your
Claude Code chats, each with its mark; a Codex one opens as a ChatGPT chat with its history and diffs.
**Ask before changes** now asks before Codex runs any command it doesn't know to only read (on Windows
that includes `git status`) and before every file change; before, Codex often just reported the
sandbox's "access denied". The plan, question and permission cards say ChatGPT in ChatGPT chats.
Checked on Windows with Codex 0.166.0 signed in to ChatGPT, driving the built app: an edit with its
approval and diff, a command with its approval card, a Jig tool (project notes), Plan only with the
plan approved (the file was created in Accept edits), a question answered, a suggestion, Stop, a
restart with the chat resumed (it remembered earlier turns), the saved Codex threads listed and the
ChatGPT usage meter. Known gaps: an answered question card shows "—" for its answers after a restart
(Claude chats too: the answers aren't saved with the card); Codex chats still have no subagents,
rewind or fork.

Picking Claude or ChatGPT for a chat (2026-11-04, D-314): a new chat has a provider button before its
model picker, Claude or ChatGPT (greyed out with a link to Get started while Codex isn't signed in).
It can change until the first message; then it is the chat's mark. ChatGPT chats show ChatGPT's
models (Sol, Terra, Luna first, then exact versions) and reasoning levels, and hide what Codex can't do
(rewind and edit-and-resend, fork; Plan only, questions and suggestions came with D-315). The chat header shows the chat's
mark, and once a ChatGPT chat exists the Chats list marks them at the far right. **Settings → Chats**
(was Claude Code): "New chats run on" Claude | ChatGPT, then a Claude chats group and a ChatGPT chats
group (default model, reasoning effort, personal instructions, Codex binary, OpenAI API keys), the
default one badged. A project's settings have "Chats run on". A ChatGPT chat's turn refreshes the
ChatGPT usage meter. Checked with the fake engine in Jig Dark and Jig Light, narrow and wide. Needs
testing on your machine with Codex signed in: a real ChatGPT chat from the picker (reply, a command,
the model and effort menus, the ChatGPT meter moving), and the picker greyed out after `codex logout`.

Jig's tools in Codex chats (2026-11-04, D-313): a Codex chat now has the same Jig tools as a Claude
chat, under the same names (`addon_boards_*`, `addon_tasks_add`, `jig_*`), so instructions that name
them work in both. They come from a small server only that chat can reach (on this computer, with a
secret of its own, gone when the chat ends). Tools that only read run without asking; the others show
the usual permission card; screenshots from tools show on the tool card. The project's `.mcp.json`
servers that Claude Code is allowed to start there come along too. Checked against Codex 0.166.0 with
a script (the server connects, a read-only tool runs unasked, another asks, commands Codex runs can't
see the secret). Needs testing in the app with a ChatGPT chat from the provider picker (D-314).

Codex chat engine (2026-11-04, D-311, D-312): a chat whose provider is Codex now runs on OpenAI's
Codex (`codex app-server`, your ChatGPT sign-in) instead of failing: replies stream, commands show on
the Bash card, file changes on the Edit/Write cards with their diffs, MCP calls on the tool card, and
Codex's approvals are the usual permission cards (Allow, Always, Deny). Ask before changes runs Codex
read-only and asking; Accept edits lets it write in the project; Don't ask never asks. Your personal
instructions (`~/.claude/CLAUDE.md` with its imports) go with every Codex chat, so one file stays the
source. (Starting one from the UI came with D-314.)
checked with a script driving the engine against Codex 0.166.0 on Windows (a reply, a command, the
context meter, the model list, Stop). Needs testing in the app once the picker exists.

ChatGPT model families (2026-11-04, D-310): in **Settings → AI features**, a row on ChatGPT now offers
Sol, Terra and Luna first ("Terra (latest) · now GPT-6.1 Terra"), then a divider and the exact
versions for pinning one. A family always runs on its newest version in the list Codex reports, so a
new release is used without changing a setting. Switching a row to ChatGPT picks the family of its
Claude tier (Luna for Haiku, Terra for Sonnet, Sol for Opus) instead of Codex's default. Checked with
the fake engine; needs testing on your machine: a feature on Sol, Terra and Luna with Codex signed in.

Editing a queued message (2026-11-04, D-308): clicking a message waiting in the queue opens a dialog
with the chat's own message box: its attachments as thumbnails and chips with ×, paste a screenshot or
drop files, the paperclip, the + menu (commands, mention a file, attach), dictation, and the `@` and `/`
lists while typing. The model, permission mode, attempts, Stop and Send stay in the chat. Ctrl+Enter
or Save writes the text and the files back to the same message in the same place in the queue. The
dialog keeps its size: attachments have their own row. Checked on Windows with screenshots in Jig
Dark and Jig Light (fake engine). Needs testing on your machine: dictating into the dialog, and
dropping a file from Explorer onto it.

Task queue reordering (2026-11-04, D-307): drag a queued task's row, or a chat card's header for the
whole chat, to a new place in the Queue tab; a line shows where it lands and nothing else moves until
the drop. A task dropped inside a chat continues that chat; dropped between chats it starts its own.
Nothing moves above or between tasks that ran. Alt+↑/↓ on a focused row does the same from the
keyboard; ⋯ has Move up/down, Move to top and Move to bottom. Checked on Windows with screenshots,
wide and in a narrow view. Needs testing on your machine: dragging with a real mouse in a sidebar.

Top bar placement and live menus for add-ons (2026-11-04, D-305): an add-on's top bar item can ask
for `"placement": "right-start"` to be the first item on the right, before Suggestions (items with the
same placement sort by `order`); without it the item stays after Jig's own items. A new slot,
`tools.menuGroup` (`menuGroups: [{ group, items }]`), fills a top bar menu with entries the add-on
computes each time the menu opens (Start/Stop by state, one entry per project with its square, a
badge and a check), above the group's static actions; headings work in add-on menus now too. If the
export fails or takes over half a second the menu opens with the actions alone and a toast says
which add-on. The builder knows both. Try it: give an add-on a `menuGroups` entry for its action
group and open that menu twice after changing its state. Needs testing on your machine: the Time
add-on once it's rebuilt to use both (see D-305).

ChatGPT usage in the footer (2026-11-03, D-298): the status bar shows Claude's plan usage, then
ChatGPT's after a thin divider, each behind its own mark (an icon and the name, in its own colour).
The bars keep green/amber/red for room/near/limit for both. Hover for a card with both plans (plan
badge, every window, when it resets, when it was updated) and one refresh button. ChatGPT's numbers
come from OpenAI's Codex CLI, refreshed after every ChatGPT answer and every 5 minutes; without a
Codex sign-in only Claude's shows. When the status bar is narrow each group shrinks to its name and
highest share. Checked on Windows with real numbers from Codex (signed in and out) in Jig Dark, Jig
Light and an imported VS Code theme. Needs testing on your machine: the numbers moving after a few
ChatGPT answers, and a ChatGPT plan that reaches its limit (the "Limit reached" warning).

AI features per provider (2026-11-03, D-297): **Settings → AI features** lists Jig's one-shot AI
features (commit message, check before committing, release notes, tour, compare attempts, standup,
chat names, weekly patterns, caption translation, add-ons' questions) in one table: pick Claude or
ChatGPT and a model from that provider for each. Everything starts on Claude with the model it used
before, so nothing changes until you pick. ChatGPT is greyed out until OpenAI's Codex CLI is signed
in (the footer links to Get started). Checked on Windows with Codex signed in: commit message, the
check, release notes, an add-on question, the tour and the standup all answered on ChatGPT, and the
table moves nothing when you switch. Needs testing on your machine: compare attempts, chat names, the
weekly pattern run (it needs some recorded activity) and caption translation in a real meeting on
ChatGPT.

ChatGPT through Codex (2026-11-03, D-294): Get started has an optional **ChatGPT (Codex)** row. With
OpenAI's Codex CLI installed (`npm install -g @openai/codex`) it shows the version and whether Codex is
signed in; **Sign in…** runs `codex login` in a private terminal (Codex opens your browser), and when
it ends Jig says whether it worked, closes the terminal and checks again. Without Codex the row offers
How to install. Under the hood Jig can now run a one-shot prompt on ChatGPT (`codex exec`, read-only,
no tools) and list ChatGPT's models; no feature uses it yet (picking a provider per feature comes
next). Chats stay on Claude Code. Checked on Windows with Codex 0.166.0 signed in and out. Needs
testing on your machine: a real `codex login` from the row (browser sign-in, then the toast and the
row turning green), and Codex installed through Homebrew or winget instead of npm.

Teams chats in the lobby (2026-11-03, D-296): the Meetings lobby has a rail with **Meetings** and
**Chats**. Chats lists your Teams chats newest first (picture or group icon, name, last message, time,
an unread mark, the unread count on the rail); a row opens the chat beside the list, where you read
and write (refreshed every 5 seconds). In **Call…** each person has a **Chat** button that opens your
one-to-one chat with them; with no chat yet, Jig says it can't start one and offers **Open in Teams**.
Needs testing in a real tenant: the list loads with Chat.Read (also where Graph refuses expanding
members and previews together), group and meeting chats get sensible names, unread matches Teams,
sending works, Chat from Call… finds an existing chat, and Open in Teams starts a new one.

Meetings in two windows (2026-11-03, D-292): Meetings opens the **lobby** (agenda, week, history,
reviews, notes, actions), and joining or calling brings up a separate **call window** (device check,
the live call with its panels, ringing calls). The lobby stays usable during a call: its status bar
shows the live meeting or call (click to bring it forward), and Join/Call… then offer to show it rather
than start a second one. Hanging up hides the call window and opens the meeting's review in the lobby.
Closing the lobby doesn't end a call. Needs testing on your machine: a real Teams meeting and a real
call (both windows on screen, the call window coming forward to ring while the lobby is closed, and
quitting Jig with only the hidden call window left).

Board search and filters (2026-11-04, D-304): Boards has a toolbar under its tabs like Azure DevOps':
a search field (id, title, tags, person; Esc clears; Ctrl+F or / on the board focuses it) and pickers
for Type, Assigned to (@Me, Unassigned, people with avatars), State, Tags, Iteration and Area, each a
menu with checkboxes that stays open, showing a count. Filtering is instant on the loaded cards;
columns keep their place and width and count "shown/total"; Clear filters has a reserved slot. Kept
per board. Narrow sidebars get one Filter button instead of the row of pickers. How to try it: open
Code → Boards, type in the search, tick a few values, switch tabs and back. Needs testing on your
machine: @Me with your real az sign-in (it matches your e-mail), and a board with many people and tags.

Boards load at startup (2026-11-04, D-302): Jig fetches every followed board of every project a few
seconds after it starts (two at a time, in the active tenant) and keeps the cards, also across
restarts. Opening or switching to a board tab shows its cards at once and refreshes them behind the
scenes: the refresh button turns and "updated N min ago" sits beside it, both in fixed slots, and
changed cards update in place (a card you're dragging, or an open card, isn't interrupted). The
centred spinner only shows for a board with nothing cached yet. A tenant switch shows that tenant's
cached cards, never another's, and refreshes its boards. Claude's board tools read the cache when it's
under a minute old. Signed out or expired: the board says so as before, and background refreshes in
that tenant pause for 5 minutes. How to try it: follow two boards, restart Jig, open Code → Boards and
switch tabs. Needs testing on your machine: a real board with many cards (no flicker or scroll jump
while it refreshes), and Jig's start-up time with several followed boards.

Board avatars (2026-11-03, D-291): Boards cards show who has them as an avatar at the far right
(their Microsoft profile picture when Meetings' sign-in is connected, else initials; an empty slot when
unassigned; hover for name and e-mail), and the card's detail shows it next to "Assigned to". Add-ons
get the same through `PersonAvatar` / `ctx.people.photo`. Needs testing on your machine with the
meeting sign-in connected: real colleagues' pictures appear on a real board.

Boards text and delete (2026-11-03, D-290): card titles, descriptions, comments and names with "–",
"…", "›", quotes or "ö" show and save as written (az now runs without cmd.exe and answers in UTF-8),
creating a card whose description has double quotes no longer fails, and deleting a card no longer
reports a JSON error. Checked against a real board on Windows. Needs testing on a machine whose az is
not the MSI/winget install (the `@file` fallback).

Chats name themselves (2026-11-03, D-288): when you send a new chat's first message, the quick model
(Haiku by default) gives it a short name of 2–5 words, in the message's language, a few seconds later.
Until then it is called by the message's first words; renaming it yourself meanwhile wins. Turn it off
in Settings → Claude Code → **Name new chats**. Needs testing on your machine: the name arrives and
the chat list doesn't jump.

Task queue control (2026-11-03, D-279): every queued task has a tick (all ticked by default; one on
each chat and in the header ticks all): Start takes only the ticked ones, the others stay queued as
"Left out" until ticked again. A finished or skipped task's menu has **Put back in the queue** (in its
place, as if it never ran; Run again still adds a copy at the end); a running task has it too, with a
confirmation (the queue pauses and stops following its chat). ⋯ → **Start over…** puts every task
back to queued and takes the open run out of History.

Pipelines on Windows (2026-11-02): run names, build numbers and branches with "·", "ö" and the like show
correctly (az printed them in the Windows code page; they came out as "�" in toasts and the view).

Restart a script (2026-11-02): in the Scripts view a running script shows ↻ on hover (and Restart in its
⋯ / right-click menu); a group with running scripts gets ↻ beside Stop to restart them. Uses the existing
`scripts.restart` (stop, then start in a fresh terminal).

Update progress (2026-11-02, D-252): Install and restart now shows an "Installing Jig X" modal (Jig
closes in a moment → the installer shows its progress → Jig opens again) for 2 s before Jig closes, and
the "ready" toast goes away. When the installer starts Jig again (`--updated`), a toast says "Updated to
Jig X". **Needs testing on Windows** with a real update: the gap between Jig closing and the installer's
window appearing, and that the installer's progress page shows in update mode.

Azure DevOps boards per project (2026-11-02, D-251): Code → Boards opens the active project's boards,
one tab per board. **+** finds the team boards of your Azure DevOps organisations (organisation and
project pickers, the project named like the Jig one first; tick several). A board shows its real
columns side by side (WIP limits, over-limit in amber, one width for all set by the header slider) with a card per work item: type colour, id,
title, who has it, its state when it differs from the column. Click a card to open it in the browser;
right-click or ⋯ for Start a chat about it, Copy link. Uses your own `az login`; Done cards older than
30 days stay off, like Azure DevOps. Needs a real-machine check against a real organisation (fake `az`
in the tests).

Add-ons: restore and share (2026-11-02, D-249): add-ons installed from a gallery or a `.zip` keep their
original; once changed they show **edited** in Settings → Add-ons, and ↶ restores them (an edited
built-in: ↶ removes your copy). ⤓ opens Share: a `.zip` or a folder gallery source, as itself or as a
separate copy with its own name (always, for an edited built-in). Git gallery sources aren't written to.

Task queue per project with history (2026-11-02, D-248): each project has its own queue (the view's
project menu at the top right switches, with a count of queued tasks); queues run independently.
Every run is kept: History lists the runs (started, tasks, done, failed, time, cost) and opens one
read-only, with Run again / Queue every task again and Remove from history. When Claude queues tasks
(`addon_tasks_add`) the approval is an editable list (titles, prompts, project, start now). The old
single queue moves to its projects on first start. Needs a try with a real Claude Code chat.

Icon/text alignment (2026-11-02, D-237): Inter's vertical metrics are tuned so text in icon rows sits
centred on its icons (they looked ~1px low everywhere: chat steps line, Files, Git…). Upgrading
@fontsource-variable/inter means updating `styles/inter.css`.

Terminal shells (2026-11-02, D-240, D-241): Settings → Terminal picks the shell from the installed ones
(PowerShell 7, Windows PowerShell, cmd, Git Bash, … / `/etc/shells`) or a custom path. In the Terminals panel the
chevron next to "+" opens one terminal in another shell (also right-click on "+" and Code → New terminal in…);
each terminal row shows its shell. Needs a try on machines with PowerShell 7 and WSL (not offered).

`.sh` scripts on Windows (2026-11-02, D-239): the Scripts view runs them with Git for Windows' bash, found
automatically; without Git Bash the row says so. Needs a try on a real Windows machine.

Scripts follow the files (2026-11-02, D-238): add, remove or rename a script file (`scripts/backend.sh`) or an npm
script and the Scripts view updates by itself within a second, no restart; groups pick the script up again.
Needs a try on a big real workspace (watch count, Windows).

`.sh` scripts on Windows (2026-11-02, D-239): the Scripts view runs them with Git for Windows' bash, found
automatically; without Git Bash the row says so. Needs a try on a real Windows machine.

Scripts follow the files (2026-11-02, D-238): add, remove or rename a script file (`scripts/backend.sh`) or an npm
script and the Scripts view updates by itself within a second, no restart; groups pick the script up again.
Needs a try on a big real workspace (watch count, Windows).

Updates (2026-11-02, D-236): installed Windows Jig checks 5 s after opening and shows a toast
(Download, Details) when a newer release exists; nothing downloads until you press Download (toast or
Get started). When it's downloaded, a toast offers Install and restart, and the installer's own window
shows the progress before Jig starts again. Covered by `e2e/updates.spec.ts` (toasts); the real
download/visible installer needs a check on an installed build with the next release.

Jig 0.7.0 published (2026-11-04): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.7.0),
source/tag `43b923dee9ceec6da0e31038383a981e88b3448d`. Installer: 373,138,754 bytes;
SHA-256 `9ad4c70dcd0491b34e63b7370d0a39bf099c6b8964f350e592392f0688509393`.
Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;
the draft's installer matched the local one, and unauthenticated latest-release discovery returns
v0.7.0 with its feed and installer. In 0.7.0: Jig 0.7.0 adds ChatGPT (through the Codex CLI) as a second provider for one-shot AI features with its usage in the footer, a meeting lobby window with your Teams chats and history folders, a Boards toolbar with search and filters, and times in chats.

Jig 0.6.0 published (2026-11-03): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.6.0),
source/tag `d212aa8923af0c4f4e446c08b632ed823239cc06`. Installer: 373,097,013 bytes;
SHA-256 `b4d802b0a6ba7144f8f82fd6c7c98d70686014aa0e9631139991ec3ae6e58a5f`.
Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;
the draft's installer matched the local one, and unauthenticated latest-release discovery returns
v0.6.0 with its feed and installer. In 0.6.0: Jig 0.6.0 adds Azure tenants: sign in to several tenants, switch from the avatar at the top right, pin one per project, and have chats, terminals, Pipelines and Boards follow it. Claude now hears when a terminal it started finishes, and the task queue no longer loses changes.

Jig 0.5.0 published (2026-11-03): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.5.0),
source/tag `da3672b10281e8257eae1cbf99af6093a59628fb`. Installer: 373,067,457 bytes;
SHA-256 `46a862154094876f2c05241595560e6cce6c57fc1b6eddffeada4170979e6f05`.
Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;
the draft's installer matched the local one, and unauthenticated latest-release discovery returns
v0.5.0 with its feed and installer. In 0.5.0: Jig 0.5.0 adds "Hey Jig" voice commands, Claude-translated meeting captions when Teams can't translate, microphone and speaker choice, and a task queue you can tick, put back and start over; talking with Claude now ignores background noise.

Jig 0.4.0 published (2026-11-03): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.4.0),
source/tag `917606eb546b1fefe71a405fb689f48226a031d8`. Installer: 371,236,512 bytes;
SHA-256 `3c07a133744ca5467f4e47fad1a00cfceb80a2440185e11748da3b1a03b30bbf`.
Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;
the draft's installer matched the local one, and unauthenticated latest-release discovery returns
v0.4.0 with its feed and installer. In 0.4.0: Boards you manage in Jig (and Claude from chats), the Teams chat of meetings and calls, profile pictures, a frame around what you share, past meetings that stay joinable, a pipeline picker in workflows, file links in chats and a task queue that fits a sidebar.

Jig 0.3.0 published (2026-11-03): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.3.0),
source/tag `8d041765232c2dacc5d42d3ef83ec64aa5d4ff04`. Installer: 371,216,992 bytes;
SHA-256 `9fc35d6fdbda062d8a6ae5e10fac9c41a7d43501ce0ecb10c08cb23914afb058`.
Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;
the draft's installer matched the local one, and unauthenticated latest-release discovery returns
v0.3.0 with its feed and installer. In 0.3.0: Jig 0.3.0: Teams calls and translated captions, code completion (Copilot or Claude) and language servers in the editor, project knowledge with claude.ai import, per-project task queues with history, meeting history and Azure DevOps boards.

Jig 0.2.0 published (2026-11-02): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.2.0),
source/tag `5f286d05f57fdd650e0037ca1331d11166d9b858`. Installer: 369,632,053 bytes;
SHA-256 `7861d02d5d13c7170ac879ee221cbb7c8f6694720a3b17137af9b0c3b72bacca`.
Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;
the draft's installer matched the local one, and unauthenticated latest-release discovery returns
v0.2.0 with its feed and installer. In 0.2.0: Jig 0.2.0 adds the Tests add-on, a natural on-device voice for Read aloud and talking, editable queued messages and a shell picker for terminals; updates are now announced and downloaded on request.

Jig 0.1.3 published (2026-11-02): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.1.3),
source/tag `e493da1047d1b3fd3f91e20b98bad6d059fcddfe`. Installer: 259,677,586 bytes;
SHA-256 `ccbf3bd4993bf2005ae9b4bb213255cecf952e3de6095be9ce9109db53a0143f`.
Draft digests and a downloaded installer matched local artifacts; unauthenticated latest-release discovery
returns v0.1.3, latest.yml reports 0.1.3 and the installer returns HTTP 200. No installation was performed.
In 0.1.3: Meetings keeps a fresh Microsoft sign-in for silent token requests (D-235, one browser tab on
Connect, Join no longer bounces to the lobby), rejected join links show in the pre-join modal again, and
the composer drops the permission line above the box. npm run check, chat/meetings e2e and the packaged
app test passed. A real Teams join with a real account still needs acceptance on a real machine.

Jig 0.1.2 published (2026-11-02): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.1.2),
source/tag `7a03748d3e2821628fed46a203c677ae8132a28d`. Installer: 259,677,522 bytes;
SHA-256 `bd6244d241b2ab01dbdbe80678b2ba110557a4a4ca0562bf2b78ab3f2bf854b1`.
Installer, blockmap and latest.yml server digests match local artifacts; feed version/size/SHA-512
match the installer. Unauthenticated latest-release discovery returns v0.1.2, and feed/installer
requests return HTTP 200. No installation or running-app restart was performed.

In 0.1.2 (D-231–D-234): Meetings remembers Agenda/Week and
restores Microsoft sign-in from an OS-encrypted MSAL cache. Windows downloads updates in-app and
offers Install and restart; Get started checks automatically and shows the installed version.
The real Teams join stuck at None/no audio was traced to a camera-off empty stream list, which SDK
2.0.0 rejects before connecting and silently catches. Jig now omits video options in that case.
Join handling also waits for Connected/InLobby and reports timeout/connection failure instead of waiting indefinitely.
Type checking, lint, design-token checks and production build passed; further tests were explicitly skipped by Jon.
Real corrected meeting join, sign-in restoration and installed update/restart acceptance remain pending.

Meeting sign-in fix (2026-11-02, D-235): Join failed with "Reconnect your Microsoft account" and
Connect opened two browser tabs. The MSAL cache plugin only loaded the encrypted file once, but MSAL clears
its memory before every silent request, so a fresh sign-in was wiped and every silent token failed. The
plugin now hands back the latest cache on each access; silent failures log MSAL's error code only.
Needs real-machine acceptance: Connect should open one tab and Join should no longer bounce to the lobby.

Jig 0.1.1 published (2026-11-02): [GitHub release](https://github.com/Connectslide121/jig/releases/tag/v0.1.1),
source/tag `1555bb10d6b98e215495499bd81fc7f1b0abd5af`. Public unauthenticated latest-release discovery
returns v0.1.1 and the installer download returns HTTP 200. The installer is 259,395,400 bytes;
SHA-256 `92817f6e1db7769530e5151ffd25d02b79f345398948a14e01c54231400f7f7c` matches GitHub's asset digest.
Type checking, lint, 722 unit tests and token checks passed; seven already-running browser/image/
Suggestions e2e scenarios also completed successfully. The user requested immediate publication
without further test runs; packaged smoke testing was omitted for this release.

Agent-managed Jig releases (2026-11-02, D-230): the repository now contains a shared `jig-release`
skill, discoverable by Codex and Claude Code/Jig, routed from AGENTS.md. “Publish a Jig release”
runs versioning, validation, Windows packaging, checksum/draft verification and GitHub publication
with the existing CLIs. The first authorized publication completed as v0.1.1, with matching uploaded installer digest and
public update discovery. No release UI was added.

Learning evidence (2026-11-02, D-229): sent prompts record shared-file counts, including image-only
messages, without inferring paste/drop/picker use from paths. Browser-gap mining requires web
context and reports only missing recorded calls. Reflection guidance rejects “let Claude” reminder
habits and nonexistent browser-enable settings; the catalog now distinguishes Claude’s browser
from the user browser. Existing suggestions are unchanged.

Image zoom (2026-11-02, D-227): image tabs, image/SVG Preview and both sides of Git image diffs
now have zoom out/in, a 10–800% percentage menu, Fit and 100%. Ctrl/Cmd + scroll zooms; ordinary
scrolling pans oversized images. The toolbar stays in place.
Suggestions width (D-228): its header, cards and weekly summary use a centered readable column
on wide screens and still fill narrow panels.

Browser access (2026-11-02, D-226): the top-right globe icon opens your Browser in the main panel.
Claude’s browser uses MonitorCog (your Browser keeps the globe), with an explicit heading and read-only address; navigation, viewport and test-launch
controls are removed from its toolbar. Clicking/typing/pasting inside the page remains available
for sign-ins. A permanent hint links directly to your own Browser.

Native user browser (2026-11-02, D-225): Tools → Open Browser opens a Browser tab in the main panel,
with direct Chromium rendering/input, navigation, stop/reload, zoom, developer tools and opening in
the default browser. Claude’s browser keeps the existing offscreen tools/live view in the sidebar;
the two pages have separate cookies and history. Native surfaces hide behind Jig menus/dialogs and
when switching/closing tabs. Browser integration tests pass for native text/IME, address focus,
history, overlay bounds, native Ctrl+W, Claude separation and existing screenshots/console/network.
Reviewed the composed native/workbench screenshot; everyday browsing on the target machine remains
to be tried.

Meeting join feedback (2026-11-02, D-222): pre-join shows device and link errors inside the modal,
and production media loads from a window-owned loopback server: ACS rejected `jig-app:` before
device setup. The workbench keeps its normal origin and meeting IPC remains restricted to its owner.
stops the spinner after device failure and offers Retry devices. The pre-join checkbox and notice are removed at Jon's request; a reserved status area shows device
readiness without moving existing controls.
Physical devices and a real Teams call still need target-machine acceptance.

Teams chat in meetings and calls (2026-11-03, D-270): a Chat panel (on the left by default; move or
hide it like the others) shows the meeting's or call's Teams chat, read every 5 seconds while you're in
it, with a box to write in it. The chat is kept with the meeting, in Claude's transcript (so notes and
actions see links and decisions posted there) and in the Markdown export. Needs Chat.Read and
ChatMessage.Send: until your administrator approves them, the panel says so with Connect chat…. A
call's chat is your one-to-one chat with that person (none until one of you starts it in Teams).
Needs a real-tenant check: reading, sending, and the 1:1 chat id lookup.

Profile pictures in meetings (2026-11-03, D-263): people's Microsoft profile pictures show on their
tiles, in People, beside their captions in the transcript, in Call someone and on a ringing call;
initials until (or unless) there is one. Needs the User.ReadBasic.All approval.

Boards you manage in Jig (2026-11-03, D-262): Code → Boards. Click a card to open it in Jig and
edit it (title, description, column, state, assignee, tags, priority, story points, comments); drag
cards between columns; + in a column adds a card; ⋯ → Move to / Delete…. Claude reads and updates the
project's boards from chats (`addon_boards_*` tools; changes ask first). Uses your own `az`; needs a
try against your real organisation.

File links in chats (2026-11-03, D-261): a file or folder path Claude writes in inline code
(`docs/status.md`, `E:\repos\x\index.html`, `src/a.ts:42`) is a link when it exists: click opens a
file in Preview and a folder in the file manager; Ctrl/Cmd+click opens it with its own app (an HTML
page in the browser). Relative paths count from the chat's folder; a path that isn't there stays code.

Translated captions (2026-11-03, D-260): in a live meeting the Transcript's language picker ("As
spoken", or any language Teams offers) shows each caption in that language with what was said in
small grey text under it; both are kept with the meeting and Claude reads both. The choice is
remembered. Teams translates: that needs Teams Premium for the meeting; without it Jig says so and
captions stay as spoken. Needs a real meeting to confirm.

Captions translated by Claude (D-277): when Teams can't translate (no Teams Premium, or a language
Teams doesn't offer), Claude translates each finished caption on a fast model (Haiku), in order;
the picker also lists common languages Teams may not (Swedish, Spanish, Basque, Catalan, French…).
While it translates, each line keeps room for the original under it ("Translating…"), and the
Transcript header says "AI translation, may be inaccurate" (or why a translation failed).
Settings: `meetings.aiTranslation` (on) and `meetings.translationModel` (`haiku`), from a chat
only with your approval. Untested in a real meeting; the fake meeting covers it in e2e (not yet run
to the end: run `meetings.spec.ts` at the release and look at `translated-ai.png`).

"Hey Jig" voice commands (2026-11-03, D-278): Settings → Speech → Hey Jig → Listen for "Hey Jig"
(off by default). While Jig is open, also minimized, say "Hey Jig" and a command: new chat (in a
project), continue my last chat, talk to a chat, talk mode, switch project, add a task, ask Claude,
what's happening, read the last answer, the queue, tests, pipeline status, run the tests, deploy to
stage or production and pull (both after a spoken yes), fetch, run a workflow, start a script, save
a note, mute, repeat, stop listening, what can I say. A chat opened by voice starts in Talk mode.
Everything is understood and run on this computer, without Claude (only "ask Claude" starts a
chat). Jig also says when a chat finishes or needs you. The status bar shows it listening; Jig menu →
Voice commands (or the status bar item) lists every command. Covered by `voice-commands.spec.ts`
with the fake engine; the real microphone, waking from minimized and CPU need a real machine.

Language servers (2026-11-03, D-259): in the file editor, the language servers you install give
errors and warnings as you type (wavy underlines, message on hover), hover information, go to
definition (F12; another file opens in Preview), find references (Shift+F12), rename (F2), signature
help and Format document (Shift+Alt+F). The status line names the server (click for these and
Restart); "No language server" offers to install one. Settings → Editor → Language servers lists
TypeScript/JavaScript, Python, C#, JSON, CSS, HTML, Go and Rust with where each was found, or Install…
(runs the install command in a terminal). Needs a try with real servers (`typescript-language-server`).

Project notes in the project's knowledge (2026-11-03, D-289): notes are no longer an add-on. The
Home's **Knowledge** card shows **Notes** (every chat gets them) above **Documents** (Claude reads
them when they help), with **Add note…**; the **Project notes** sidebar view stays. Claude's tools
are now `jig_notes_*`; adding, changing or removing a note asks like other changes unless the
chat's mode allows it. At the first start, notes the add-on kept move into each project unchanged
and `addon-data/notes.json` becomes `notes.json.migrated`. Try: start Jig with existing notes and
check each project's Knowledge card.

Project knowledge (2026-11-03, D-256): a project's Home has **Knowledge**: drop files on it or
Add files… (text, Markdown, code, PDF, Word, Excel, PowerPoint), click one to read it, ×
removes it. Every chat in the project is told which documents there are and Claude reads them with
`jig_knowledge_read`. **Import from claude.ai…** (Projects view ⋯, the Knowledge card, or Go to)
shows the steps to export your data on claude.ai, then reads the zip you drop and makes Jig projects
with each project's instructions and knowledge. Needs a real claude.ai export to confirm its shape.

Code completion (2026-11-03, D-255): the file editor suggests code as you type, as faint text at
the caret; Tab takes it, Esc drops it, typing what it says keeps the rest. Who completes shows in the
editor's status line (click it to switch): **GitHub Copilot** (optional: Get started → GitHub Copilot
→ Set up…, or the status line; Jig downloads Copilot's language server, ~28 MB, and you sign in to
GitHub with a code; Copilot keeps the sign-in) or **Claude** (Settings → Editor → Code completion
with Claude, off by default; Haiku by default, about 1 s after a typing pause, the first about 5 s).
Needs testing with a real Copilot account.

Chat (2026-11-03): the context window card (hover the % in a chat's top bar) stays open while you
move onto it and has Compact now and With instructions….

Chat (2026-11-03): in the Compact view the latest steps line keeps its spinner and glow while the
chat works, also between steps ("· Working" while Claude writes its next step), not only while a
tool runs.

Teams calls (2026-11-03, D-254): in the meetings window, **Call…** finds people (recent calls,
the people you work with, or a search of your organisation) and a whole row calls them (Camera on
for video). While Jig runs, Teams calls ring in Jig too: the meetings window comes to the front with
the caller, a ringtone and a system notification; Decline, Video or Answer. Calls are kept in the
meeting history like meetings (captions when Teams gives them, notes, actions) with **Call back**.
Connection → "Ring in Jig for Teams calls" turns ringing off. The first call asks Microsoft for the
User.ReadBasic.All and People.Read permissions (your administrator may need to approve them).
Needs a real call: consent, captions in one-to-one calls, ringing next to the Teams app.

Composer mentions (2026-11-03, D-253): `@` mentions that point at something (a file that exists, a
folder, a meeting) are highlighted in the message box, and each gets a chip above the text: click it to
open the file in Preview (a folder in the file manager, a meeting in Meetings), × to take it out of the
message. Ctrl/Cmd+click on the mention in the text opens it too. Try: type `@` in a chat, pick a file.

Meeting history (2026-11-02, D-250): past meetings open in Jig's main window — the top-bar video
button → **Meeting history** (or Tools → Meeting history). Search on the left; notes and transcript of
the selected meeting on the right. **Start a chat** opens a chat in a project you pick with the
meeting mentioned; **Generate notes** and **Review actions** work as in the meeting window; ⋯ copies or
exports Markdown, copies the chat reference, renames or deletes. In any chat, `@` + a meeting's name
lists meetings after files; sending `@meeting:…` makes Claude read it. Notes are now much shorter.
The meeting window's "Saved meetings" is now "Meeting history". To try: join a meeting with
`JIG_MEETINGS=fake`, leave, then open the history. Needs real-machine testing: Export Markdown's save
dialog and how concise real notes come out.

Meeting history folders (2026-11-03, D-295): in the history tab and the lobby, meetings sit in folders.
**New folder** (beside the search, or the lobby's history heading) makes one; drag a meeting onto a
folder, or use its menu → Move to folder. A recurring meeting (two or more meetings with the same Teams
meeting link, e.g. a daily) gets its own folder by itself; you can still move one of its meetings
elsewhere and back. A folder's ⋯ renames or deletes it (its meetings stay). To try: two meetings joined
from the same recurring invite, then open the history.

Add-on rows (2026-11-02, Jon): Settings → Add-ons rows show Change with AI, Share and the switch;
History, Restore, Open folder, Reload and Delete are in the row's ⋯ menu.

Top bar (2026-11-02, Jon): New chat sits beside the search in the centre; Meetings is a video icon
button among the icons on the right (the Meetings add-on's `topbar` item), and still in Chats → Meetings.

Meeting window screens (2026-11-02, D-221): the window now has a lobby (a large Next up card, the
next 14 days as cards with an Agenda | Week toggle, saved meetings as cards; every card is clickable), a live room and a saved meeting's review. In the live room the call is
the main area; Transcript and Notes go in the left, right or bottom slot from their ⋯ menus, share
a slot with a resizable split, can be hidden or reset from Layout, and the layout is remembered.
The call shows everyone like Teams: a gallery of tiles (camera
when on, initials when off, muted mic, a ring while speaking, you included); when someone presents,
their screen gets the space with everyone's tiles in a strip beside it. People (hidden by default,
toggled from the participant count) is a third movable panel. Saved meetings can be deleted (review ⋯ → Delete
meeting…, or right-click a saved card), after a confirm; this also removes the meeting's frozen
question/notes snapshots. Leaving a call opens its review (transcript, notes, Ask Claude, Open in Teams). A stopped chat turn
now shows "Stopped" instead of Claude Code's red diagnostic, and Meetings sits in the Chats menu.

Automatic source cleanup (2026-11-02, D-220): fresh Claude Code/Jig chats opened in this repository
load a native hook that runs installed Biome safe fixes after Edit/Write and Bash/PowerShell.
Shell tools sweep modified/untracked files, covering Windows Python CRLF writes. Success is silent;
remaining errors go to Claude. No AI calls/downloads. Scope and activation: `guides/developing.md`.

Meeting room redesign (2026-11-02, D-219): one stable layout — resizable stage with floating call
controls, meeting bar, Transcript | Notes, status line for call state and errors. Sidebar: Join from
link, Upcoming (auto-loaded, grouped by day) | Saved tabs. Speaker-grouped captions, tidier pre-join,
connection, share, Ask and review dialogs. Meetings e2e and npm run check pass.

Teams meetings (2026-11-01, D-217): Chats → Meetings opens a global meeting window with a two-week
calendar, Join from link, pre-join devices/preview, audio/video and screen/window sharing. Named live
captions are saved incrementally without raw audio or post-meeting processing. Ask Claude opens a normal
Plan-mode chat with an immutable transcript snapshot and explicit project context; project switches do
not interrupt the meeting. Generate notes saves a draft action plan for modal review and per-action
project assignment. Adding selected actions is idempotent, pauses Task queue and never starts it.
Azure resource and public desktop registration are provisioned in Sprinta Intern, with Europe data
residency and user-specific calling consent. Calendar consent via CLI was refused; Refresh calendar
tries normal delegated browser consent separately, and joining by link remains available. Source
builds import ignored `.azure-local/meetings.json` on normal startup; custom-home/packaged builds use
Connection. Reconnect Microsoft after a Jig restart (no disk token cache). Real Microsoft sign-in
and keyless calling-credential issuance passed. Microsoft's calendar consent page confirms admin
approval is required for Graph Calendars.ReadBasic on jig-meetings. Physical devices, caption attribution,
screen sharing and long-call refresh still require target-machine acceptance. The screen or window you
share gets an accent frame, hidden from the capture (D-266; check on a real machine that it follows a moved
window and isn't visible to the others). PowerPoint Live, Whiteboard
and breakouts aren't supported. The normal local Jig profile has the Azure connection settings saved.
Production build and npm run check pass (699 tests, 8 skipped). Meetings and existing Task queue
Electron regressions pass, including project independence, caption revisions, notes and cross-project
queued tasks. See `addons/meetings/README.md` and `docs/plan/22-meetings.md`.

Browser naming (2026-11-01, D-216): the built-in browser is called Browser in its view,
Open Browser action, settings and What Jig can do. Search for Open Browser to open it.

Models and searching (2026-11-01): new chats use Opus; `opusplan` used Opus only in Plan mode and
Sonnet for everything else, so chats in other modes never reached Opus. Saved settings keep their
value: change Settings → Claude Code → Default model (or Use recommended defaults). Every chat gets
the `jig-search` subagent on the new Search model (Haiku; Off removes it) and is asked to hand code
searches to it. The chat details list each model's replies, tool calls, tokens and cost (Claude
Code's totals, subagents included, after a turn ends) (D-207). `npm run check` passes (620 tests,
8 skipped). How often a real Opus chat actually delegates, and Haiku's search quality, need everyday use.

Skills library and pipeline details (2026-11-01): Chats → Skills library lists nine bundled skills,
all enabled by default, with per-skill global switches, searchable project selection and modal
instructions/provenance. Changes apply before the next message, preserving a continuing chat.
AI feature UX adds a short product-disclosure default and deeper guidance without claiming legal
compliance (D-205). Pipeline CLI output is forced to UTF-8; run details show execution duration
excluding queue time, distinct from the finish-age badge (D-206).
Production build, 617 unit tests (8 skipped), Skills/Pipelines Electron regressions and isolated
native discovery of all nine skills passed. Final minor polish was not re-tested, and the full
screenshot scenario was not rerun, at Jon's explicit request to skip further tests and finish.
The Skills image is from the successful UI regression. Live model outcome quality and actual
Azure CLI metadata refresh still need everyday verification; no real account was used in tests.

Whole-chat file summary (2026-11-01): the per-turn file cards are replaced by a reserved row
above the composer: X files changed, +/− totals, Walk me through and Undo changes. Review is removed.
The file count opens a modal snapshot with full paths, edit counts and per-file line totals (D-204).
Counts span all successful recorded file edits in the chat, including subagents; they are not a
live Git diff. Production build/check pass (609 tests, 8 skipped). Hidden Electron checks verify
stationary scrolling/input geometry, modal alignment, compact/detailed parity, reload persistence,
and Undo after commit/push to a temporary local remote. That test confirms histories stay intact
and a new commit can record/push the restoration. The confirmation explains its local-file scope.
About/README screenshots have been regenerated and visually inspected.

Project notes and busy buttons (2026-10-31): notes now describe the project and are shared
across its chats (D-202), with Waiting on, Note and Link kinds. Claude receives current notes
each turn and guidance to retain important project knowledge beyond the current task/chat.
Legacy chat notes are ignored. Search for Show this project's notes; Add/Edit uses a modal.
Busy buttons retain full contrast and a fixed icon slot; spinners inherit their text colour (D-203).
Validation: production build and `npm run check` pass (609 tests, 8 skipped). Hidden real-app
regressions pass for shared/isolated notes, reload persistence, editor closure on project switches,
stationary modal headers and the pipeline queue spinner's colour, opacity and button geometry.
Real Claude's editorial judgment about which facts to retain still needs everyday use; automated
checks cover the guidance and project boundaries, not live model behavior.

Repos branch readability (2026-10-31): the branch column starts farther left and occupies one third
of the row; its trailing chevron is removed. Sidebar width stays unchanged; full names remain in
tooltips, and clicking the branch still opens the switch menu (D-201). The production build and
real-app branch-switch regression pass.

Desktop polish (2026-10-31): JSON opens as editable Source, with tree Preview a click away.
Unsent new chats stay memory-only and out of history/search/restored tabs; the first prompt saves
the chat and its open tab. Legacy empty records are ignored without deletion. Extension slots are
one card per row with independent animated disclosures; shared dialogs/menus and workbench panel
toggles use short reduced-motion-aware animations (D-198–D-200). About screenshots reserve their
aspect ratio before loading. Build/check pass (606 tests, 8 skipped). Electron regressions verify
JSON Source/Preview, draft and sent-chat restart behavior, chat paging, project actions, stationary
slot headers and shared panel/modal interactions including reduced motion.

Model attribution (2026-10-31): the overview card counts reported models; the wider details modal
lists model/tool-call counts, caller models per tool, and reported/requested subagent models separately.
Detailed tool headers reserve a model column and agent cards a model row; compact mode remains uncluttered.
Missing historical data stays Not reported. This identifies the assistant calling a tool, not an AI
inside a tool or MCP service. Build/check pass (604 tests, 8 skipped); the overview UI regression passes.

Repos refresh (2026-10-31): the Refresh button now rescans workspace folders before updating Git
status. Deleted repos/worktrees disappear and new repos appear without restarting. Present repos
with Git errors remain visible; automatic status polling keeps using the cached workspace inventory.
The real-app regression passes for removing a repository and Git worktree, discovering a newly
created repo, and retaining the error on an existing broken repo. It also covers workspace-only additions.
Production build and `npm run check` pass (599 tests, 8 skipped).

Model aliases (2026-10-31): chat, project and Settings pickers show Opus, Sonnet, Haiku and Opus Plan
Mode for aliases, even if discovery names their resolved version. Settings remain unpinned aliases;
explicit version selections are still available. New chats inherit `opusplan` unless a project model
overrides it. The user corrected the reported project override; the agent changed no user settings.
Validation: production build and `npm run check` pass (599 tests, 8 skipped). Focused Electron checks
verify the wider task dialog, footer permissions, stable attachment geometry, model/permission menus,
short alias labels in Settings and new-chat opusplan inheritance with optional project overrides.
The refreshed task-dialog screenshot is `test-results/tasks-add-compact.png`.

Task dialog (2026-10-31): Add tasks is wider, with a one-line hint and Permissions in the footer
beside Cancel/Add. Prompts get more horizontal space; attachments retain the compact row layout.

Chats list (2026-10-31): ten chats per group initially, including pins; all pins stay visible above
ten. Show more reveals ten more at a time. The header now has only New chat and ⋯; View type is a
submenu in ⋯. Chats board and Open a Claude Code chat remain in the Chats top-bar menu and search.
Validation: `npm run check` passes (595 tests, 8 skipped). Electron checks cover ordinary and >10-pin
paging, View type, board/import access, shared search and stable anchored results at two window widths.
The full screenshot suite passes, and the About/README screenshots now show the permanent search field
and reduced Chats header. A production build bundles the refreshed assets.

Search bar (2026-10-31): search is always visible in the center of the top bar. Results drop from
directly beneath it; Ctrl+P/Ctrl+K focus it. Escape/outside clicks close results without moving content.

Pipeline arrangement (2026-10-31): nested cards no longer show the duplicate Add divider/help row.
Use the small side divider icon; the outer list retains its footer.

Menus (2026-10-31): the duplicate Tools dropdown is removed. Use the grouped top-bar menus or the
top-bar Go to search (Ctrl+P and Ctrl+K). `tools.action` add-ons remain available in those menus
and search, including a dedicated menu for their own groups; no action is exclusive to the old picker.

Chat alignment (2026-10-31): transcript and input now share a column and matching content edges.
The overview card's column remains reserved when hidden and in empty/loading chats, preventing
sideways movement as it appears or disappears. Work continues directly on `main` with logical commits.
Validation: build and `npm run check` pass (592 tests, 8 skipped). Five fake-engine Electron checks
pass, covering exact input/message alignment at narrow and wide widths, no movement when the overview
is hidden or first appears, visible command pickers, queued messages, streaming and long-text overflow.
Narrow-pane follow-up: model and permission labels truncate within their buttons so the Send button
stays inside the composer; full labels remain available in tooltips. Alignment/overflow coverage also
includes an 800-pixel window. The screenshot generator selects the last preview tab when several exist.
The screenshot suite passes; chat, overview, details and related chat screenshots were refreshed.

Task entry (2026-11-01, D-212): Add tasks prompts are 3 rows tall; files sit in a fixed box beside
them, one per line, with "+N more" (a menu) past 3 and no scrolling; files never grow a row or move its
controls. Click a filename to preview or × to remove; paste, drop and paperclip still work.
Validation: production build and `npm run check` pass (592 tests, 8 skipped). The fake-engine task
queue regression verifies image paste, document drop, unchanged row/prompt geometry, retained files
in results and attachments delivered to the chat. Screenshot: `test-results/tasks-add-compact.png`.

_Last updated: 2026-10-29 (phases 0–17: every phase of the plan is done; the latest are routines and artifacts, Browser and the chat at Claude Code's level)._

## Continue here (next session)

1. Clone Jig and install: `npm install` (npm reads `.npmrc`, which sets `legacy-peer-deps`).
2. Clone ThinkRail beside it for reference: `git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail`.
   Which parts to read for which phase: `docs/reference/reference-repos.md`.
3. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`.
4. Phases 0–18 in `docs/plan/README.md` are ✅ (19 is 🟡: only the Windows taskbar-icon check is left) (phase 18 was Jon's list: file explorer, editing in
   Preview, projects you manage, arranging panels, split view, project links, Releases, Learning 2
   with Workflows). What's left of it is in `docs/plan/99-backlog.md`. Next: try phase 18 on Windows
   ("Needs testing on your machine" below) and ask Jon what comes next.
5. Phase 23 (`docs/plan/23-jons-notes.md`) is done. Next: try its features on a real machine (a real Teams
   call, a Copilot account, a real claude.ai export, a Windows update) and ask Jon what comes next.
6. Phase 24 (`docs/plan/24-tenants.md`, Azure tenants) is done in code (sessions 1–6, D-282–D-286):
   the top bar tenant switch, add/manage modals, the views, chats, terminals and projects following
   it, reviewed in Jig Dark and Light at narrow and wide sizes with a fake `az`. Next: Jon tries it
   with a real second tenant ("Needs testing on your machine" → Azure tenants).
7. Run `npm run check` before every commit; keep plan, docs and decisions true.

## What works today

- Azure tenants (D-282, D-283): the round avatar at the far right of the top bar shows the tenant
  Jig's `az` uses (initials; tooltip with name, user, domain; a warning dot when its sign-in
  expired). Its menu lists your az login and the tenants you added (user and domain in columns,
  ✓ for the one in use, ⚠ for an expired sign-in) to switch, plus Add tenant… (a modal: tenant id or
  domain, Sign in opens the browser through `az login`, progress and errors in the modal, Cancel)
  and Manage tenants… (switch, rename, sign in again, remove). Also in Settings → Azure. Claude can
  list tenants and, with your approval, switch (`jig_azure_tenants`, `jig_azure_switch_tenant`).
  On a switch (D-284) Pipelines shows a spinner in its list's place and then that tenant's
  pipelines (its organisations setting is per tenant), Boards reloads and a board followed in another
  tenant shows a card "In tenant X" that switches to it, Releases' and Workflows' pipeline runs use the
  tenant and name it when they fail, and Project links → Add from Azure lists the tenant's
  subscriptions. Add-ons use the same `az` (`api.azure.az`). New chats, terminals and scripts run
  `az` with the active tenant (D-285), and Claude is told which tenant and user that is; a chat or
  terminal that was running when you switched keeps its tenant and shows its initials (the chat header
  also its name) until it ends. Try it: start a chat and a terminal, switch tenant, look at the chat
  header and the terminal tab. A project can pin a tenant (D-286): project settings → Azure tenant
  (Default keeps the tenant in use); switching to that project switches the tenant, and the avatar's
  tooltip says "Pinned by the project X". A project whose tenant was removed uses Default and its
  settings say so. Claude can set it (`jig_update_project azureTenant`). When a tenant's sign-in
  expired, Pipelines says so in its list's place ("Couldn't list pipelines", naming the tenant)
  instead of "No pipelines found".

  Your az login can be renamed too (D-301): Manage tenants → the pencil on its row; the avatar's
  initials, the menu, the tooltip (which adds "Your own az login"), Settings → Azure, chat and
  terminal tags, the project dialog's tenant picker, Boards' "In … (your own az login)" card and what
  Claude is told all use the name; it still is the Azure CLI as you left it and can't be removed.
  The ↺ button where other rows have Remove goes back to "Your az login".

  **Try it:** click the avatar at the top right → Add tenant…, type a tenant id or domain (or leave it
  empty and pick in the browser), Sign in. Then switch between it and "Your az login" from the avatar
  and watch Pipelines and Boards reload; start a chat and a terminal, switch, and look at the chat
  header and the terminal tab; pin the tenant to one project (project settings → Azure tenant) and
  switch projects. Nothing changes until you add a tenant: "Your az login" is the `az` as you left
  it. What still needs a real second tenant is under "Needs testing on your machine" → Azure tenants.

- Speech (D-208): the mic button in the composer (or Ctrl/Cmd+Shift+Space) records; click again
  and the words appear at the caret (not sent). Esc throws a recording away. The first time it asks
  to download the Whisper model (Settings → Speech: tiny ~45 MB, base ~80 MB (default), small
  ~250 MB; language; remove). It runs locally, offline afterwards. Read aloud (speaker icon on
  Claude's answers) and talking use the natural voice (below) or the system's voices.
- Natural voice (D-243): Claude's replies are read with Kokoro, a realistic voice that runs on this
  computer (19 voices: American and British English and Spanish, women and men). The first time it
  reads, it asks to download the model (~330 MB) and the system's voice reads until it's ready.
  Settings → Speech → Reading aloud: Reads aloud (natural / system), Natural voice, Try it, Natural
  voice model (Download / Remove).
- Real-time speech and talking with Claude (D-209): with a graphics card Whisper runs on it
  (WebGPU), and the words appear while you speak. The Talk button (sound waves) in the composer (or + →
  Talk with Claude) starts a spoken conversation: pause and it is sent, Claude answers out loud,
  talk over it to interrupt; the chat is in plan mode and "yes, go ahead" approves the plan so
  Claude starts working. "Read it out loud" (or "I can't see the screen") while a plan waits makes
  Jig read the plan or tasks, then ask again (D-280). "Bye" ends it. Settings → Speech: graphics card, live words, pause, speed, Try the voice, and step-by-step
  instructions for talking and for adding system voices (Windows, macOS, Linux).
- Background noise while talking (D-275): a voice detector (Silero, bundled, runs on this computer)
  decides what is you speaking, so dishes, typing or a sniff neither start your turn, keep it open,
  nor interrupt Claude. What Whisper makes up from noise ("you", "Thank you.", [Music]) is dropped.
  Settings → Speech → Talking with Claude → Ignore background noise: Strongly (default), A little, Off.
  A turn you start while the last one is still being sent now waits for it, so words no longer stay
  in the message box and come back in your next message.
- Microphone and speaker (D-276): Settings → Speech → Microphone and speaker, and the headphones
  button in the talking window (Audio devices dialog), choose the microphone dictation and talking
  listen to and the speaker the natural voice and talking sounds play on. A new microphone is used
  at once, also mid-conversation; an unplugged one falls back to the system's default.
- Talking window (D-210, redesigned in D-218): talking opens a wide, calm window over the chat with
  sound waves in the centre (blue: you, from the microphone; accent: Claude, a pulse per spoken
  word) and the conversation under them, fading out upwards as it scrolls (no tabs). While Claude
  asks to start something, its plan shows as a card in the right margin: one plan, or, for bigger
  work that needs several chats, a task queue (Claude decides, or you say "make it a queue"); "go
  ahead" then queues the tasks and starts them. Claude searches and reads the code while
  you plan (the status line says "Searching the code…", "Reading cart.ts…"; a soft note every 1.17 s
  while it thinks). Controls: Mute, Stop Claude's voice, End talking, Go ahead. "Go ahead"
  (said or pressed) approves the plan, or asks Claude for it and approves it as it comes; talking
  ends and Claude works as in any chat, with a soft note every 1.17 s and a chime when it finishes
  or needs you (Settings → Speech → Sound while Claude works). "Bye" ends only talking; Claude's
  work goes on, and the chat returns to its own permission mode when idle.
- **"Don't ask" never waits (D-293):** a safety check Claude Code still asks for in that mode
  (`rm -rf` on a drive root…) is declined at once with a warning notice in the chat, and Claude
  carries on another way. Questions still wait. Try it: a "Don't ask" chat, ask Claude to
  `rm -rf` a new empty folder at a drive root.
- Navigation and layouts (D-175, D-176): **Ctrl+P** (or the search field in the top bar) opens Go to:
  chats, views, actions and files. **View → Layout → Layouts** saves named layouts and switches
  between them (also Settings → Layout, and from a chat). Learning notices views you keep opening or
  moving the same way and suggests placing them.
- Chats board (D-178): Chats view header → board icon, or Chats menu → Chats board.
- Task queue (D-182): Chats menu → Task queue. Add tasks grouped in chats, one field per task
  (a chat's first task starts it, the next ones continue it; D-186), then Start. Claude does them in
  order and reports each (outcome, summary, things to know, follow-ups); the results show a card per
  chat (its link, project, time, cost, progress) with a row per task, and a status bar on top; click
  a row for details. Paste, drop or attach (paperclip) images and documents in a task like in the
  chat (D-187): they're sent with it and stay with it, in the Files column, ⋯ → Files and the details.
  In a chat, ask Claude to queue tasks (for example one per spec in a folder):
  it uses `addon_tasks_add`. Known gaps: which add-on follows which chat is kept in memory, so after a
  restart running tasks catch up within a minute (the watcher); a task Claude didn't report on shows
  Claude's last answer instead. Needs testing on a real machine with real Claude Code.
- A workflow's pipeline (step or trigger) is picked from a dropdown of your pipelines (D-267).
- Generated meeting notes ask to **Save notes and actions for review**, not to approve a plan (D-268).
- Meetings that already took place stay in the lobby's week and agenda, faded, and can still be joined (D-269).
- Workflows (D-177) can run **after you push** or **when a pipeline finishes**. Needs testing on a
  real machine: a real push and a real Azure DevOps pipeline (the e2e tests use a fake `az`).
- Add-on gallery (D-179): Tools → Add-on gallery, or Settings → Add-ons. Add a git URL or a folder,
  then Install. Needs testing on a real machine: a private git repository over https and ssh.
- Commit messages (Git → Write) use the quick model, Haiku by default (D-181; Settings → Claude Code → Quick model).
- Pipelines (D-180): each pipeline is one compact row; click it for the details dialog. They load when
  Jig starts (D-183) and opening the view shows them at once, refreshing in the background.
- Chat overview (D-184): a small card at the top right of each chat, beside the transcript (it never
  covers it), counts turns, tool calls, files changed, skills, subagents, add-ons, MCP calls and
  tokens. **Show details** opens a modal with every tool, skill, subagent, add-on, MCP server and file.
  Toggle it with the chart button in the chat's top bar; ⋯ → Chat overview… opens the details; setting
  `chat.overview`.
- How Claude worked for you (D-185): What Jig knows about me sums the overview's counts over 4 weeks
  of chats (skills, subagents, add-ons, MCP servers, most used tools; calls and chats each), and the
  weekly reflection reads it. Tool calls recorded before this have no skill/add-on tag, so they count
  only as tools.
- Repos: a row's branch is a dropdown to switch branches (D-172). Needs testing on a real machine with a dirty tree and remote-only branches.
- Layout (D-173, D-174): **View menu → Reset layout** puts every view back. Sidebars hold only daily
  views; Suggestions, Links, Releases and Workflows open as main tabs from the top bar menus. Drag
  any view's tab anywhere: another region, a sidebar's lower part (splits it), the main area, or the
  dashed edge target of a hidden sidebar/bottom panel. Top bar menus are merged into Chats, Code,
  Build and View; project actions are in the project switcher. Needs testing on a real machine:
  drag and drop with a mouse on Windows, and old layouts loading.

- **Phase 0–1 (done):** docs, plan, tooling; the Electron app with the typed host bridge, config in
  `~/.jig/config.json`, window state, host log in `~/.jig/logs/main.log`.
- **Phase 2 (done): design system & themes.**
  - Every colour, space, radius and type size is a token (`docs/reference/design-tokens.md`);
    `npm run check:tokens` rejects hard-coded colours and arbitrary values.
  - Themes: Jig Dark, Jig Light, your own files in `~/.jig/themes` (Jig or VS Code format, re-applied
    on save), themes from installed VS Code / Insiders / Cursor / VSCodium / Windsurf (plus VS Code's own
    built-in themes), and Open VSX search + install (theme JSON only). See `docs/guides/themes.md`.
  - Settings → Appearance: theme grid with selection only, follow the system light/dark mode, density,
    corners, font size, UI/code fonts. Code is highlighted with Shiki using the theme's own colours.
  - Base components in `apps/desktop/src/renderer/ui/` (buttons, inputs, menus, dialogs, …).
- **Phase 3 (done): workbench shell.**
  - No native menu bar on Windows/Linux; Jig's own top bar with the project switcher, **Tools** menu
    (every action, grouped, with a filter box), layout menu and settings.
  - Layout as data (`~/.jig/layout.json`): left/right/bottom regions (resizable, collapsible), views
    movable/hideable from their `⋯` menu, main-area tabs (reorder by drag, close, close others),
    restored on restart.
  - Projects: add a folder, switch, rename, recolour, remove (right-click or `⋯`), project dashboard.
  - Settings tab: Appearance, Layout, Claude Code, Terminal, Learning, About.
  - Toasts, keyboard shortcuts (`docs/reference/layout.md`).

- **Phase 4 (done): chat sessions.**
  - Sessions view (left sidebar, next to Projects): every session of every project with live status
    (idle / working / needs you / error). New session: `Ctrl+N`, the `+` in the Sessions header, or Tools.
  - Chat tab: streaming markdown, collapsed thinking, tool-call cards (click to see input/output),
    permission prompts (Allow once / Always allow / Deny), Claude's questions as clickable options,
    per-turn duration/tokens/cost, follow-ups queue while Claude works (click one to edit it before it is sent), Stop (or `Esc`), model and
    permission-mode menus, attach files (`@path`), rename/archive/delete/stop from the `⋯` menu.
  - Sessions persist and resume with Claude Code's own session id after a restart.
  - API keys are stripped from sessions by default; a warning shows if a session still bills an API key.
  - `JIG_ENGINE=fake npm run dev` gives scripted replies (try "run the tests", "ask me a question",
    "slow", "fail", "login"; the full list is in `docs/guides/testing.md`).

- **Phase 5 (done): terminals & scripts.**
  - Terminals in the bottom panel (`Ctrl+\``, or `+` in its header): PowerShell by default on Windows,
    themed, survive switching tabs; rename/stop/close from the right-click menu.
  - Scripts in the Scripts view (no longer on the project dashboard, D-153): npm/pnpm/yarn/bun
    scripts, `.ps1`/`.sh`, .NET launch profiles, `func start`, per folder; Run / Stop; groups start
    several at once; the status bar shows "N running".
  - Tools → Sign in to Claude Code… runs Claude Code's own sign-in in a private terminal; when you're
    signed in Jig says so and closes it (D-126). Get started shows whether you're signed in.

- **Phase 6 (done): add-on system.**
  - Add-ons are folders with `addon.json` (+ `ui.tsx`, `host.ts`, `README.md`) in `~/.jig/addons`
    (a git repository) or Jig's built-in `addons/`. They load into 20 slots (views, tabs, top bar,
    status bar, dashboard, Tools actions, context menus, chat toolbar and tool cards, prompts,
    watchers, Claude tools and context, Jig events, search results, settings pages, themes); see
    `docs/guides/writing-addons.md`.
  - More for add-ons (D-215): toasts with buttons, system notifications while Jig is in the
    background, badges on their views (over the icon, nothing moves), host code that runs when a chat
    finishes / needs you / fails, a commit lands, the branch or the active project changes, live
    output from long-running programs (`api.spawn`), file watching (`api.fs.watch`), results in Go to
    (Ctrl+P), and calling each other's shared functions (`exports`). The builder and the weekly
    review know all of it. The built-in add-ons use them where it clearly helps: Pipelines' "run
    finished" and Tasks' "needs you / paused / finished" are also system notifications with a button
    (Open run, Open Tasks), the Tasks icon counts tasks waiting for you, Workflows and Releases
    reminders have Open Workflows / Open Releases, and Repos refreshes right after a commit or branch
    switch. Try it: ask the builder for "a view that counts TODO comments in this
    project, with a badge, that updates when files change and after each commit".
  - Saving a file reloads that add-on; a crash shows "Turn off" in its place, never a broken app.
  - Host code runs in its own process with permission-checked `exec`/`fs`/`fetch`.
  - Settings → Add-ons: on/off, problems and token warnings, permissions, open folder, reload,
    history and roll back, and Delete for your own add-ons (D-122: kept in the history and its data
    kept; deleting your copy of a built-in brings the built-in back).

- **Phase 7 (done): built-in add-ons.**
  - **Git** (left sidebar, `Ctrl+Shift+G`): current branch with ahead/behind and fetch/pull/push,
    working changes with stage/unstage/discard and commit, branches (click → history, right-click →
    switch/compare/new branch). History, commit detail, diffs (side by side / inline) and compare open
    as tabs in the main window. Branch in the status bar.
    Updates live: on Windows and macOS within about a second of a file changing (watchers, only the
    repository that changed is looked at again); on Linux by a check every few seconds. Every
    repository is fetched in the background every 5 minutes (Settings → Git), so "behind" stays
    current; it never asks for a login.
  - **Open a Claude Code chat** (Chats header; D-150): your Claude Code conversations from the
    terminal, the desktop app or an IDE, filtered by title/folder/branch; opening one brings its
    history into a chat in No project that continues it as a copy.
  - **Repos** (click a repository: its commits to pull and push, a commit's files and diffs; D-149)
    (in the lower half of the left sidebar, D-173; drag its tab anywhere, D-174), like the Git plugin (D-143): every
    repository by its own name, a sync chip (pull, then push) and its branch; Arrange hides,
    reorders and groups them with dividers, once for all projects; "N to push/pull" in the status
    bar; right-click a project → Open in VS Code / Explorer.
  - **Pipelines** (right sidebar; D-148), like the pipelines plugin: the Azure DevOps pipelines of
    the repositories in your workspaces, per repository, with the newest run (chip, branch, why, who,
    changed parameters) and its stages; **Run** opens a modal form with the branch, a picker per YAML
    parameter and a checkbox per boolean, queued only on **Queue run** (the form closes at once, toasts
    say queueing, then queued; D-211); notifications when your
    runs finish. New pipelines join their repository on their own and the form reads the YAML in
    Azure DevOps on the picked branch (D-166). Every organisation's other pipelines (D-125) under
    "More pipelines", with the same form.
  - **Scripts** (right sidebar), like the scripts plugin (D-142): what runs now; your groups (folded to their header until you unfold them; **All scripts** folds too) with
    Start/Stop (right-click a script → Add to group); every script as a tree of folder → repository
    → package (API / npm), scripts as ▶ chips. .NET projects offer their launch profiles (D-141);
    worktrees inside a folder are left out (D-127). Tools → Run a script… (`Ctrl+Shift+R`).

- **Phase 8 (done): builder, levels 1 and 2.**
  - Tools → **Build something…** (`Ctrl+Shift+B`), **Change this with AI…** in an add-on view's `⋯`
    menu or tab menu, **Fix with AI** on a crashed add-on, or ask in any chat ("make me a …").
  - The builder (a Claude Code session you can open) picks the lightest level: a layout or settings
    change, else an add-on — changing an existing one when it fits — validated (manifest, bundles,
    exports, design tokens, README; up to 3 fix rounds).
  - You review in the build tab: layout/settings changes, or the add-on running as a "(preview)" with
    its files, diffs and permissions. **Accept** applies it (add-ons: a commit in `~/.jig/addons`,
    roll back from Settings → Add-ons); **Discard** leaves nothing behind. Builds view in the bottom panel.
  - **Development requests** (D-119): when no add-on can do it, the build ends with a request for
    Jig's developers: title, user story, why, the proposed extension point, how the tool is then an
    add-on, acceptance criteria and a clickable mockup. The Build tab works it out with you (D-120):
    **1. Try it** (the demo runs right there), **2. Is this what you want?** (say what to change and
    the builder writes version 2, 3…; **This is what I want** confirms it), **3. Send it**: **Email to
    developers**, only for the confirmed version, saves the package zip in your Downloads folder
    (SPEC.md, PROMPT.md to paste into Claude Code in the Jig repository, mockup.html, context.json),
    shows it there and opens a new email to support@sprinta.se (fixed in Jig, not a setting) in your
    mail app; you attach the zip and send (D-123). Also Copy prompt and Show package.
  - Starting a build opens its chat beside the Build tab (split view), so you see the builder work.
  - With `JIG_ENGINE=fake` a scripted builder runs the real pipeline (try "move the terminals",
    "compact", "a pomodoro timer").

- **Phase 9 (done): learning and suggestions.**
  - Jig records locally what you do (prompts, commands in sessions and terminals, scripts, add-on
    actions, git operations, project switches) in `~/.jig/activity`; pause, exclusions, retention and
    delete-all in Settings → Learning. Secrets are masked and pasted blocks (responses, JSON, stack
    traces, logs) are kept only as their kind, never their content.
  - **Look for patterns now** (light bulb in the top bar → Suggestions, or Tools) and every Monday at
    10:00 (catch-up at launch): repeated commands, sequences and similar prompts are found without AI;
    only then one small Claude Code request picks at most 3 suggestions with evidence.
  - **Build it** starts the builder; **Not now** hides it for 14 days; **Never** blocks the pattern.
  - **Learning 2** (D-111):
    - **Notes from chats:** when you mention work you do by hand or outside Jig, frustration or a
      chore, Claude saves a short note; a "Noted for suggestions" card in the chat has Remove.
    - **Friction** is recorded without AI: Stop while Claude works, rewinds, denied permissions,
      corrections ("no, I meant…"), repeated tool errors, scripts that fail, long chats that end
      without a commit, and hopping between projects. Pastes per kind and
      "Browser never used for UI work" are signals too.
    - **More kinds of suggestions**, each with its action: workflows (Draft a workflow), Claude Code
      setup, CLAUDE.md additions, routines, tips (one prompting and one habit tip a week at most, with your own examples), and
      additions to your profile. **Did it help?** shows on built or adopted suggestions after a week.
    - **What Jig knows about me** (the person button in Suggestions, Tools, Settings → Learning): your
      profile (`~/.jig/profile.md`, editable), the notes (deletable), activity per kind and **How you
      worked** (lines by Claude vs by hand in your commits of the week, churn, fixes, chat time — an
      estimate).
    - **Profile interview** (D-169): when Jig opens and the profile is empty (and a project is active)
      a toast offers a chat where Claude asks one question at a time, follows up and fills the profile
      with `jig_update_profile`; once per launch, "Don't ask again" stops it; the same chat starts from
      **Fill it in with Claude** in What Jig knows about me. Needs testing with real Claude.
    - **Check-in** (Settings → Learning, off by default; offered once after two weeks): a short chat
      with 3–5 questions that adds what it learns to your profile.
    - **Workflows** (opens as a main tab: Chats menu → Show workflows, D-173/D-174; a new built-in add-on): lists of steps you
      repeat, per project. Each step is yours (a check), "ask me first" or done by Jig (a command, a
      script, a pipeline, a message to Claude). Run it step by step with the output shown; schedule it
      (while Jig is open); export it as a Claude Code skill; Move to the cloud asks Claude to make it a
      routine or a pipeline. Workflow suggestions open here as drafts.
    - **Reviews, not only repetition** (D-213): the weekly run also looks for risky practices
      (secrets in messages or commands, piping downloads into a shell, certificate checks off, force
      pushes, `--no-verify`, commits without tests…), reads a sample of your recent messages for
      prompting tips, knows Jig's features and how much you use each add-on, and runs once there is
      enough activity even when nothing repeats. New suggestions: **better practice** (Fix it with
      Claude), **an add-on you have** (Switch it on / Show me) and **a Jig feature** (Show me). New
      tools come last, at most one per review. Needs trying with real Claude (haiku) on a real month.
    - **Coaching how you work with Claude** (D-214): the weekly review reads your recent chats message
      by message, like a coach, and names the change that would help you most (how you ask, what
      context you give, how much you hand over, planning, checking the result…), with your messages
      as evidence. A few habits Jig spots itself (asking piece by piece, one-off asks, big changes
      without a plan) are hints for it. A **prompting tip** has **Compare prompts**: your prompt and a
      better one side by side, why yours fell short and what's better, then **Try this prompt** (a
      new chat with it filled in); a habit tip can **Show me**
      the Jig feature. One of each a week at most.
    - **Browser records the network:** Claude reads the page's requests (status, headers,
      bodies; credentials redacted) with `jig_browser_network`, and the browser view has a Network
      list — so API calls are debugged there instead of copied from your browser.
- **Phase 10 (done, reworked): no self-editing.** When no slot can do a request, the build ends with a
  proposal for the missing extension point (why, and the slot or API to add), with **Copy proposal** —
  Jig never changes its own code; you add the slot yourself (D-074).
- **Resizable panels:** drag the edge of the sidebars and the bottom panel (or focus the handle and use
  the arrow keys; double-click resets), the terminal list, the Settings list and the two sides of a Git
  diff. Sizes are remembered (`layout.json`).
- **Image previews:** a changed image in the Git view shows before/after side by side; images Claude
  reads or writes show a thumbnail in their tool card; both open an image tab (fit / 100%, pixel and
  file size, show in folder).
- **Screenshots and documents in chat:** paste (Ctrl+V) or drop images, PDFs, Word, Excel, PowerPoint
  (.docx/.xlsx/.pptx) and text files into the message box, or pick them with the paperclip. They show as
  thumbnails or chips (remove with ×), go to Claude with your message (PDFs as documents, Office files
  as text Jig extracts), and stay in the transcript (click to open).
- **Configure Jig from a chat:** ask Claude to change the theme, fonts, density, file icons, layout,
  add-ons on/off, a project's name or colour, or to find and install a theme. You approve each change
  (Claude Code's prompt) and a card in the chat shows what changed, with Undo. Billing and
  program-running settings stay in Settings only.
- **Compact chats** (D-159): each run of Claude's steps folds into one line ("Ran 3 commands, edited 1
  file"); click it for the cards, or switch the chat's top bar to Detailed for every card.
- **Plan usage, always visible:** the status bar shows a bar per window like the usage plugin
  (`5h ▰▱ 26% 2h 55m · wk ▰▱ 69% 4d 22h`, green, amber from 60 %, red from 85 %; D-152); hover it for a card with every window, a bar each and when it resets (click
  to refresh). The numbers come from Claude Code's own `/usage` data.
- **Projects you manage** (D-101, D-102): a project groups chats; folders never decide which chats are
  in it.
  - **New project…** (Projects view, top bar menu, Tools) asks for a name, a colour, a default
    workspace folder, a default Git repository, the model/effort/permission defaults for its chats,
    instructions for Claude (added to its system prompt in those chats) and starter prompts for its
    Home. ⋯ → Project settings… changes them.
  - **Chats:** the active project's group comes first and open, the other projects below (click to
    open), then "No project". Drag a chat onto a group to move it; pin a chat (hover → pin) to keep it
    on top, and drag pinned chats to reorder them; the chat's menu has Pin and Move to project.
    Removing a project moves its chats to "No project". The filter button in the header groups the list
    by project, status, day, or as one list (D-170).
  - **Home** uses the project's starter prompts (a click opens a new chat with it in the composer).
    Its **New chat** button has a folder picker (any workspace or one of its repositories; the
    project's default workspace first). No separate chat box there (D-246).
  - **Claude** can create projects, change their settings and move or pin chats from a chat (with
    Undo).
- **Project links** (section below Projects, and a card on Home): the project's places in groups you
  name (Stage, Prod…).
  - Each link is typed (resource group, website, database, Azure DevOps repo…), with its icon; the
    type and label come from the address.
  - Add one by hand (+), or tick resource groups or resources from your `az` login (cloud button).
    Drag links between groups; click opens your browser.
  - Claude can add or rearrange them from a chat (with Undo).
- **Arrange Scripts and Pipelines:** Arrange in each panel's header hides items, lets you drag them
  into your order and adds dividers (optionally titled). It's the same in every project. Scripts
  shows one group per folder, whatever the active project.
- **Releases** (opens as a main tab: Code menu → Show releases, D-173/D-174; a "N to release" item in the status bar): versions,
  changelogs and release notes per repository (D-110).
  - **Set up** a repository once: Jig shows what it found (version files, tags, changelog, conventional
    commits, tools such as GitVersion) and **Set up with Claude** opens a chat that proposes a release
    policy with reasons, or adopts what's there. **Use what's there / Use the defaults** writes it
    without a chat. The policy is `.jig/release.json` in the repository (commit it to share it).
  - **Planned releases:** the unreleased commits (with their type and AB# work items), **Prepare
    release** with the suggested version (the first release is the baseline), **Draft with Claude** for
    the bump's reason, the changelog and notes per audience, then **Release**: version file, changelog,
    commit "Release x", tag (with the notes), push.
  - **Continuous:** "Deployed to prod" tags the checked-out commit with the next version. Production
    pipelines (from the policy) are watched every 5 minutes: a deploy of a commit without a release
    warns (planned) or becomes the release (continuous).
  - **What's live** per environment and the release history (notes to copy, or publish as an
    artifact through a chat). Merged pull requests are listed with the unreleased commits; an optional
    release pipeline starts on the new tag; Git shows "N unreleased" next to the repository. Weekly reminders when the
    policy asks for them. Git's **Write** uses Conventional Commits when the policy says so.
- **Review comments on diffs** (Git → a changed file): click a line number to comment on it; the
  comments collect per repository and **Review (N) → Send to a new chat** hands them to Claude as one
  message.
- **A chat in its own worktree** (Tools → New chat in a worktree…): Claude works on a copy of the
  project's repository on a new branch (`jig/<what it's for>-<id>`), so your working copy isn't
  touched. The chat's ⋯ menu applies its changes to your working copy (uncommitted), opens the folder,
  or removes the worktree and branch (the chat is stopped and archived first; you can still read it).
- **Unsaved edits are kept safe:** a Preview tab with unsaved changes shows a dot on its tab; closing
  it (Ctrl+W, Close others, Close all) asks first, and Jig never closes it to make room for new tabs.
- **Sweep (Oct 29):** four reviews (renderer, main process, built-in add-ons, packages and docs) and
  their fixes: races in attempts, chats' message queue, add-on hooks and several add-ons (scheduled
  workflows, review comments, deploy tracking, pipeline tracking); safer inputs (IPC schemas, add-on
  zip size, browser popups); file saves that keep permissions and symlinks; shortcut labels that say
  ⌘ on macOS; keyboard access to rows and hover buttons; split view sends keys only to the focused
  pane.
- **Claude and add-ons** (D-115): add-ons can give Claude tools (slot `claude.tool`). Releases does:
  ask a chat "what changed since the last release?", "write the notes for 2.5.0", or "release 1.4.0"
  (that one asks first). Claude can also look inside any add-on and read, create, change or delete its
  stored data (e.g. a workflow, a pipeline arrangement), each change with a card and Undo; the
  add-on's views update.
  - **Data scope** (D-116): an add-on says whether its data is global, per project or per
    repository (`"storage": { "scope": "project" }`); the builder chooses it, `useStorage` keeps one
    copy per project/repository and follows the active one, and Settings → Add-ons shows it.
  - Workflows has tools too: Claude lists, reads, saves, deletes and runs your workflows from a chat.
  - **Claude recommends add-ons in the chat:** it knows your add-ons, and when you ask for something
    step by step that you'll do again (check the code, release notes, user stories, test cases…) it
    does it and offers once to save it as a workflow; it points to an add-on that already does what
    you ask, or offers to build one.
- **Drag views between sidebars:** drag a view's tab to reorder it, or onto another sidebar's tabs
  to move it there (the ⋯ menus still work).
- **Sharing add-ons:** Settings → Add-ons → ⤓ exports an add-on as a `.zip`; **Import add-on…**
  shows what a `.zip` is and what it may do, then installs it (replacing yours only after you confirm).
- **Split view:** two tabs side by side.
  - Right-click a tab → Open to the side, or drag it to the right part of the main area (or onto
    the other pane's tab bar).
  - Drag the divider to resize; closing a pane's last tab (or One pane) ends the split. It's kept
    with the layout.
- **Editing in Preview:** code and text files are editable (Markdown, HTML, JSON… in Source).
  - A full editor (D-118): the theme's own syntax colours, indentation guides, the file's own
    indentation, closing brackets, several cursors (Alt+click, Alt+drag, Ctrl+D), folding, find and
    replace, go to line (Ctrl+G), toggle comment, move lines; a status line with line/column,
    indentation, line endings, language, word wrap (wrapped lines keep their indentation) and whitespace. Settings → Editor.
  - `Ctrl+S` or Save writes the file. If it changes on disk while you have unsaved edits, a bar asks:
    Keep mine / Load theirs / Show diff. Closing a tab with unsaved edits asks first.
- **Files** (left sidebar, `Ctrl+Shift+E`): the project's files as a tree.
  - Changed files in git colours with their letter; ignored ones dimmed.
  - A filter; click for Preview; right-click to open in VS Code, ask Claude about the file, or copy
    the path.
  - The picker chooses the folder it follows, and the eye button shows others next to it (kept per
    project).
  - It updates by itself when files change.
- **Workspaces** (Settings → Workspaces, or the folder button in the Projects view): the folders Jig
  knows. A repos folder lists the repositories inside (three levels deep, set on the same page).
  - The Git view lists the project's repository, picked at its top; All repositories lists every one,
    changed first, each with its branch, commit box and changes.
  - The eye button shows other repositories next to it for a while (kept per project and
    repository), and the hide button on a row takes them away. Clicking a repository in the full
    list focuses it (status bar, Tools → Git actions).
  - Chats start in the project's default workspace, or anywhere you pick. Repos lists every
    workspace's repositories, whatever the project.
- **Jig's logo:** the amber corner jig (an L-shaped fence holding a square), with no tile behind it (D-157), is the app icon (installer, taskbar, window) and appears in
  the top bar's Jig menu and on the What Jig can do page, in the theme's colours.
- **Claude's terminals:** when Claude starts a dev server or watcher it runs in a Jig terminal you can
  see ("Claude: …") and stop. Claude can read any terminal of the project, including yours, to check a
  server's output. When a command Claude started ends by itself, Jig tells the chat at once (exit
  code and last lines, a "Terminal … finished" line in the transcript), so Claude carries on without
  polling (D-281).
- **The chat does what Claude Code does** (`docs/reference/chat.md`):
  - **Input:**
    - `/` for Claude Code's commands and skills, `@` for files and folders, `!` for shell commands,
      `#` to remember something in CLAUDE.md;
    - ↑ for earlier messages, Shift+Tab for modes, Ctrl+Enter to send into a running turn.
  - **What Claude does:**
    - its todo list as a checklist, and plans with Approve / Keep planning;
    - diffs on edits, subagent progress, and background tasks with Stop;
    - Edit and send again / Rewind on your messages.
  - **Chat settings:**
    - the model menu with Claude Code's own models and an Effort submenu;
    - chat ⋯ → MCP servers…, Folders for this chat…, Export as Markdown…;
    - Ctrl+F finds in the chat.
  - **With the fake engine, try:** "/usage", "make a todo list", "make a plan", "use a subagent",
    "start a background job", "edit README.md", "! ls".
- **Easier to reach (UI/UX sweep, D-094):**
  - **Starting and finding chats:**
    - **Home:** with no tab open, a project shows a New chat button, starter prompts, recent
      chats with their status, and "Next steps" tiles. It is also the project dashboard.
    - **New chat** is a button in the top bar.
    - **Ctrl+K** focuses the top-bar search field.
    - **Tabs** show a dot when their chat works, needs you, failed, or finished while you looked
      elsewhere.
  - **In a chat:**
    - **Empty chats** show starter prompts and the message box's shortcuts.
    - **Hovering a message** shows Edit (your messages) and Copy without opening a menu.
    - **Whole-chat file changes** stay fixed above the composer: a clickable file count and +/−
      totals beside Walk me through and Undo. The modal lists full paths and per-file
      edit/line counts. Undo restores to the first message's checkpoint after confirmation (D-204).
  - **Wording:** "chat" everywhere you see it, instead of a mix of "session" and "chat".
- **Icons for add-ons:** add-ons use Jig's own icon set, Lucide:
  - names in `addon.json`, imports from `lucide-react`, and `<Icon name>` for icons chosen at runtime;
  - Settings → Add-ons warns about icon names Lucide doesn't have.
- **Routines** (Tools → Routines): your Claude Code routines, the prompts Claude Code runs on a
  schedule on the web.
  - The list shows each one's schedule in words, its last run and an on/off switch.
  - For the selected routine: **Run now**, its runs, and each run's messages.
  - **New routine…** and **Change with Claude…** open a chat; in any chat you can also ask Claude to
    make one.
  - Jig asks Claude Code for them, a small model call each time, so the tab loads on demand.
- **Artifacts:** when Claude publishes a page in a chat, its card has **Open in Jig** (Preview) and
  **Open on claude.ai**. Tools → Artifacts lists those, and on request every artifact on your claude.ai
  account; Claude Code reads one back to open it in Jig.
- **Browser:** Claude opens your dev server (or any http/https/file page) in a real headless
  browser inside Jig, reads it, clicks and types, takes screenshots that show in the chat (the whole
  page, or phone/tablet/desktop sizes in one go), and reads the console. The view opens by itself
  (turn off Settings → Claude Code → Show Browser when it's used to keep it closed); its size
  never limits Claude. The **Browser** view
  (right sidebar, or Tools → Open Browser) shows the
  page live with an address bar, back/forward/reload, desktop/tablet/phone sizes and the console; click
  and type on it to take over. Try it with the fake engine: `browse file:///path/to/page.html`.
- **Testing on a small model** (D-124): chats hand page testing to the `jig-tester` subagent, which
  uses Browser on Haiku (Settings → Claude Code → Tester model) and reports PASS/FAIL per
  check with screenshots. Tools → Test something… or the flask in the browser view starts a
  test chat on that model. Try it with the fake engine: Tools → Test something… → anything.
- **Images from tools:** screenshots and charts that a tool returns (an MCP browser, a plotting tool)
  show as thumbnails in the chat instead of "[image]".
- **Guided tours of changes:** Git → ✨ → Walk me through the changes (also a workspace repo's menu
  and the chat's ⋯). Claude orders the uncommitted changes for understanding and explains each step
  next to its highlighted diff; ←/→ to move.
- **Check before committing:** Git → ✨ → Check before committing. Claude lists secrets, debug output,
  unfinished code or likely bugs in the changes, under the commit box.
- **Turn a chat into a tool:** the chat's ⋯ → Turn this chat into a tool…. The builder gets what you did
  (requests, commands, changed files) to make something you can run with one click.
- **Write my standup:** Tools → Write my standup…. Done / Next / Blockers from your commits in every
  repository, uncommitted work and the chats you had since the last working day (or a week), with Copy.
- **Try several ways:** the split button in the message box (or Tools → Try a task several ways…)
  starts 2–4 chats on the same task. Each works in its own git worktree from your last commit, from a
  different angle (simplest, cleanest, most thorough, unconventional; all editable). The Attempts tab
  shows their progress and changes with diffs. **Let Claude judge** recommends one with strengths and
  weaknesses per attempt. **Keep this one** applies it to your working copy and removes the rest.
- **File previews:** right-click a file in Git → Preview, the eye on a chat tool card, an attachment, or
  Tools → Preview a file…. Markdown is rendered with Mermaid diagrams, relative images and links between
  files. HTML runs in a sandbox, with scripts off unless you turn them on. PDFs open in a viewer.
  CSV/TSV and Excel show as filterable tables, JSON as a tree, and notebooks with their outputs.
  Images, audio, video, Word/PowerPoint text, .mmd diagrams, patches and highlighted code also work.
  The preview follows the file while it changes, and Ask Claude opens a chat about it. Chats draw
  Mermaid blocks as diagrams too.
- **Ask Claude about a failed script:** when a script exits with an error, a toast offers **Ask Claude**:
  a new chat opens in the script's folder with the command, exit code and the end of the output typed
  in. Failed terminals also get a ✨ button in the list, and any terminal's menu has "Ask Claude about
  this output".
- **Desktop notifications:** while Jig is in the background, a system notification tells you a chat
  needs you, finished or failed (click it to go there; the taskbar button flashes when it needs you).
  Settings → Claude Code → Desktop notifications.
- **Claude in Git:** the commit box's **Write** button asks Claude for the commit message (from the
  diff, in the style of the repo's recent commits). Right-click a changed file → **Explain this change
  with Claude**, or a workspace repository → **Review changes with Claude**: a new chat opens with the
  request typed in, ready to send. Add-ons can do the same with `ctx.ai.ask` (permission `ai`); the
  builder knows about it.
- **Restore files and fork:** hover one of your messages → ⋯ → **Rewind to before this message** →
  **Only the files** shows which files Claude changed since then and puts them back (Claude Code's file
  checkpoints; Settings → Claude Code → File checkpoints). The same submenu rewinds the chat, or the
  chat and the files; **Edit and send again** rewinds and puts your message back in the box. The chat's ⋯ menu → **Fork chat** continues
  the conversation in a new chat, so you can try another approach and keep the original.
- **Next-message suggestions:** after a turn Claude Code proposes what you might send next. It shows
  as a chip above the message box (click to edit it, the arrow sends it) and as the box's placeholder
  (Tab takes it). Settings → Claude Code → Suggest the next message.
- **Context window and Compact:** each chat header shows how full the context window is (a small bar
  and %); hover for what fills it (messages, tools, system prompt, …), click for **Compact
  conversation** or **Compact with instructions…** (Claude Code's own `/compact`). From 70% a
  **Compact** button shows next to it; the chat's ⋯ menu has the same entries.
- **What Jig can do** (the "Jig" menu at the top left, the `?` in the top bar, Tools → What Jig can do,
  Settings → About; it is also what the main area shows when no tab is open): a page with screenshots of each part, a live grid of the 17 extension slots (which of your
  add-ons use each, an `addon.json` example, "Build something here"), your add-ons, the tools Claude
  gets to configure Jig with "Try in a chat" examples, your Claude Code skills (`~/.claude/skills` and
  the project's), build examples that open the Build dialog, and every keyboard shortcut.
- **File icon themes:** files and folders (Git, tabs, chat tool cards, builds, add-ons via `FileIcon`) use
  the icon theme your VS Code uses — e.g. Material Icon Theme — or any VS Code icon theme you pick in
  Settings → Appearance → File icons (or install from Open VSX); "Jig" keeps Jig's own icons.
- **Phase 11 (done): packaging & Windows.**
  - `npm run dist` packages Jig with electron-builder; on Windows it makes `Jig-Setup-<version>.exe`
    (per-user NSIS installer with Start menu shortcut and Jig's icon). Guide: `docs/guides/packaging.md`.
  - **Get started** (opens on an installed Jig's first start; Tools → Check your setup…): Claude Code,
    git, gh, az + Azure DevOps extension, VS Code `code`, with install links and Sign in to Claude Code…;
    optionally ChatGPT (Codex) with its own Sign in… (D-294).
  - **Check for updates…**: from a git clone, pull + build + restart; installed, the latest GitHub release.

## How to try it

```bash
npm install
npm run dev          # opens Jig
```

- Add a project: **Add project…** in the middle of the empty window, or the project switcher.
- Try themes: the gear (top right) → Appearance. Drop a VS Code theme `.json` into `~/.jig/themes`
  and it appears; edit it and Jig recolours as you save.
- Move a view: `⋯` in the sidebar header → Move to right sidebar.
- Try a proposal without Claude: `JIG_ENGINE=fake npm run dev`, Tools → Build something… → "change Jig
  itself: …" → the build shows the proposed extension point.
- Everything the fake engine can play (todo lists, plans, subagents, edits, the browser…):
  `docs/guides/testing.md` → The fake engine.

## Needs testing on your machine

Things the cloud build environment couldn't verify:

- **Azure tenants (phase 24, D-282–D-286)**, only tried with a fake `az`. With a real second tenant
  (another account, or another Entra tenant of yours):
  - Add it from the avatar's Add tenant…: the browser opens, the modal shows progress, and it lands
    named after the tenant with your user and domain. Cancel one sign-in halfway; Sign in again and
    Remove from Manage tenants…; `~/.jig/azure/<key>/` appears and goes with Remove, and your own
    `az account show` in a normal terminal still says what it said before.
  - Switch: Pipelines shows the other tenant's pipelines (and its own organisations setting), Boards
    reloads, a board followed in the other tenant shows its "In tenant X" card and Switch works,
    Project links → Add from Azure lists that tenant's subscriptions.
  - A Releases pipeline run and a Workflows pipeline step with the added tenant active.
  - `az account show` in a new chat (ask Claude), a new Jig terminal and a script shows the added
    tenant; switch back, and the old chat and terminal keep theirs and show its initials.
  - Pin it to a project and switch projects: the avatar follows, its tooltip says "Pinned by…".
  - An expired sign-in (wait for one, or revoke the session in the Microsoft account page): the
    avatar's warning dot, ⚠ in the menu, Pipelines' "Couldn't list pipelines", Sign in again fixes it.

- **Speech (D-208):** Hugging Face was unreachable from the cloud environment, so the real model
  download is untested (the serving path is unit-tested; real Whisper inference was checked in the
  built app with whisper-tiny: about 5 s for loading + a short sentence). Try: the first download
  and its progress, a real microphone (Windows: Settings → Privacy → Microphone → desktop apps;
  macOS: the permission prompt, packaged app), accuracy and speed of `base` and `small` in your
  language, Read aloud voices. No GPU: if `small` is too slow, use `base` or `tiny`. On Windows,
  Win+H (system voice typing) also works in the composer.
- **Real time and talking (D-209):** no GPU nor microphone in the cloud environment, so WebGPU
  Whisper (the `encoder_model.onnx` + `decoder_model_merged_q4.onnx` download) and real voice
  activity detection are untested; the conversation itself is covered by e2e with scripted speech.
  Try: Settings → Speech shows "Use the graphics card" working; dictate a long paragraph (live
  words, corrections); talk with Claude with headphones, then with speakers (the system voice may
  be heard as you: raise `speech.pause` or use headphones); say "yes, go ahead" on a plan.
- **Microphone and speaker (D-276):** e2e uses Chromium's fake devices; untested with a real
  headset. Try: pick a USB/Bluetooth headset as microphone and speaker, talk (Claude's voice and the
  working sound come from it), switch microphone in the talking window mid-conversation, unplug it.
- **Ignoring background noise (D-275):** the detector was checked on recorded speech (voice ≈ 1.0,
  silence and noise ≤ 0.16 per 128 ms frame), not yet with a live microphone. Try: talk with Claude
  while running water, typing or clapping (no turn starts, Claude isn't interrupted), then speak
  normally and quietly (turns still start and end as before), with Strongly and A little.
- **Natural voice (D-243):** checked on Jon's Windows machine in the built app (English and Spanish,
  ~1.5 s for 3 s of speech after ~7 s loading). Try: the first download from Read aloud (the dialog,
  then the "ready" toast), talking with Claude (no gaps between sentences, speaking over it stops it,
  the waves follow the real voice), each Spanish voice, Remove in Settings, and memory once the voice
  process stops after 10 minutes unused. Packaged app: `voice-host.mjs` and `phonemizer` must ship.
- **Talking window (D-210):** untested with a real microphone and voice: whether the waves follow
  your voice smoothly (128 ms batches played back in 16 ms steps), whether your system voice gives
  word boundaries (else Claude's wave is a gentle pulse per sentence), the loudness of the working
  note and chimes, and whether "go ahead" is heard reliably. Try: plan a small change by voice, ask
  Claude to look at something in the code, then press or say "go ahead": the work is quiet (no
  ticking once talking ends) and a chime plays at the end. D-218: plan something bigger ("one task per screen")
  and check Claude proposes a task queue, that the card lists the tasks, and that "go ahead"
  queues and starts them; check the louder, faster working note isn't too much.
- **Checked on Windows 11 (Oct 29, first local run):**
  - `npm install` works (Node 24, Electron download, node-pty, the Agent SDK's win32 package).
  - A fresh clone used to fail `npm run check`: Git for Windows checks files out with CRLF
    (`core.autocrlf=true`), which Biome rejects. `.gitattributes` now keeps LF (D-121).
  - `npm run build` and `npm run dev` failed on Windows: the main-process build marked its own
    entry points (`C:\…`) as external npm packages. Fixed in `apps/desktop/scripts/build-config.mjs`.
  - Add-on UIs didn't bundle at all on Windows: the bundler took the entry `C:\…\ui.tsx` for a
    package import and refused it. Fixed in `main/addons/bundle.ts`.
  - The add-on file list Claude reads is sorted, so it's the same on NTFS and ext4.
  - `npm run e2e` passes on Windows: 95 passed, 6 skipped (screenshots and Linux-only ones), with the
    windows hidden.
  - Email to developers opened Office's "install Outlook" stub on a machine with only the new
    Outlook (`OUTLOOK.EXE` is registered even when classic Outlook isn't installed). It now saves the
    zip in Downloads and opens a plain `mailto:` email in your default mail app (D-123). Checked
    with the new Outlook: the email opens and Explorer shows the zip.
  - A submenu near the window's right edge (the bottom panel's ⋯ → Show below…) was pushed back
    over its parent menu and looked like it replaced it; it now opens on the parent's left.
  - The taskbar showed Electron's icon when Jig runs from a clone: Jig now has its own app id
    (`dev.jig.workbench`, as in the installer), so the taskbar shows Jig's icon.
  - A Jig with its own `JIG_HOME` (tests, a throwaway home) quit at once while your usual Jig was
    open: the one-instance lock was per Windows user. With `JIG_HOME`, Electron's data folder (and the
    lock) now lives in that home, so both run side by side.
  - `.cmd` programs in a folder with spaces didn't run at all (`az` in `C:\Program Files\…`, VS
    Code's `code`, `npm`): the program's path was quoted with `^"`, which cmd takes literally. It's
    now escaped with `^` the way cross-spawn does (`escapeProgramForCmd`). This broke Pipelines,
    Releases, Project links from Azure and Open in VS Code on Windows; Check your setup said az and
    code weren't installed. It also ignores az's "WARNING: updates available" line now.
  - VS Code's own themes (Dark Modern, Dark+, Light+…) were missing: newer VS Code keeps its
    built-in extensions in a folder named after the build (`Microsoft VS Coded62b1d5da
esources\…`),
    which Jig now finds (`builtinExtensionsDir`).
  - **Measured on Jon's machine** (built app, throwaway `JIG_HOME`, real profile, `E:
epos` as the
    workspace with 52 repositories):
    - Git view: all 52 repositories listed; **0** git processes from Jig in 60 s of idle (other
      tools on the machine ran ~120 in 30 s); a new file showed in ~0.7 s and left ~0.7 s after
      deletion.
    - Files view on `E:
epos`: a new file showed in ~1.5 s and left ~1.6 s after deletion.
    - Scripts: 3,088 scripts in 1,033 folders, found in 4–7 s; 2,551 of them came from git worktrees
      of one repository, which Scripts now leaves out (D-127).
    - Check your setup: Claude Code (bundled), git, gh, az + azure-devops, VS Code `code` all found.
    - Themes: Jig's 2, VS Code's built-in ones and the extensions' (25); file icons follow VS Code's
      Material Icon Theme.
    - `npm run dist` builds `Jig-Setup-0.1.0.exe` (247 MB, unsigned); the packaged app
      (`win-unpacked\Jig.exe`) starts, opens Get started and loads the built-in add-ons with its
      bundled esbuild (`e2e/packaged.spec.ts`). The installer itself wasn't run.
  - When a watched folder is deleted (a removed worktree, a renamed folder), Node on Windows reports
    the folder's own path over and over instead of an error, which kept Git's and Files' watchers
    busy for good. Those watches now close, and the views fall back to checking by themselves
    (`watchLost`), as they also do when a watch fails.
  - The theme could flip back to the previous one when a theme file and the theme setting changed
    together: two refreshes overlapped and the slower one, which had read the old setting, won. Only
    the latest refresh applies now.
  - e2e runs filled the desktop with "Claude finished: …" notifications from "Electron": the hidden
    test windows count as in the background. A hidden Jig (`JIG_HIDDEN`) now never notifies, and
    notifications carry Jig's logo. (Restarting Jig never notified about old chats: only a chat
    that stops working does.)
  - Signing in left you in an interactive Claude Code (first-run theme picker, then a chat) with
    nothing saying Jig was signed in too: it now runs `claude auth login`, which only signs in, and
    Jig confirms it and closes the terminal.
  - Examples and tests used real project names ("Podium" as the New project placeholder); they're
    neutral now, and AGENTS.md says so.
  - Unit tests wrote log lines into the real `~/.jig/logs/main.log`; `vitest.config.ts` now gives
    every test a temporary `JIG_HOME` unless it sets its own.
  - Workflow command steps lost their quotes in `cmd.exe` (`echo "a b"` printed `\"a b\"`): an
    add-on's `exec("cmd.exe", ["/d", "/s", "/c", line])` now passes the line as written
    (`resolveCommand` in `main/addons/winCommand.ts`). Scripts and terminals were already right.
  - The window controls (minimise, maximise, close) hung below the top bar: they were 40 px and the
    bar 2.5rem, which is 32.5 px at the default 13 px UI font. The bar now takes the controls' height
    (`env(titlebar-area-height)`), now 36 px, at any font size; an e2e test checks it.
  - A failed script always said "Exit code 1" on Windows (PowerShell's `-Command` replaces the
    program's code): scripts run in PowerShell now exit with the program's own code.
  - Saving in Preview failed while another program had the file open (Windows can't rename over
    it): it now writes into the file instead. CRLF is kept.

- **Phase 18 on Windows:**
  - Files: the watcher on a large repository (live refresh), Open in VS Code.
  - Editing in Preview: saving CRLF files, a file changed by Claude while you edit.
  - Releases: `az pipelines runs list` for production environments; tagging and pushing to Azure
    DevOps; a `Directory.Build.props` / `.csproj` version bump.
  - Workflows: command steps run in `cmd.exe` (`/d /s /c`); a schedule that fires while Jig is open.
  - Commands with quotes in `cmd.exe` (Scripts, Workflows, Claude's terminals): Jig now passes one
    command line (`/d /s /c "…"`) so `echo "a b"` keeps its quotes.
  - Saving a file in Preview while an antivirus scanner holds it (the save retries a few times).
  - Learning review (D-213): the quality of practice, add-on and feature suggestions with real Claude.
  - Coaching (D-214): whether real Claude's coaching and rewritten prompts are specific and useful, and
    whether the habit-hint thresholds fit real chats.
  - Add-on extras (D-215): system notifications from add-ons on Windows (only while Jig isn't in
    front), git events for commits made in another tool (watching `.git` on NTFS and network drives),
    and `api.spawn` with `.cmd` programs (`npm`, `az`).
  - Learning 2: "How you worked" on a real week of commits; the check-in chat with real Claude
    (`jig_read_profile`, `jig_update_profile`); Claude saving notes on its own (`jig_note_evidence`)
    with the real model.
  - Browser network log on a real dev server (bodies of the first page's requests).

- **Real Claude Code sessions with your login** (phase 4): start a session, check streaming, tool
  cards, permission prompts, Always allow, interrupt, model switch, resume after restarting Jig, and that
  the header shows no "API key billing" badge. If Claude Code isn't signed in, check the banner.
  Note: in the cloud container one smoke test ran the real Claude Code with an empty HOME and no
  credentials in its environment, yet the container itself supplied a login, so one tiny request
  (~$0.02) was made. Jig read no credentials; this was not repeated and tests use the fake engine.
- **Themes from your real VS Code install**: open Settings → Appearance and check your installed themes
  appear (labels, dark/light) and look right. On Windows Jig reads `%USERPROFILE%\.vscode\extensions`
  and `%LOCALAPPDATA%\Programs\Microsoft VS Code\[<build>\]resources\app\extensions` (built-in themes).
- **Open VSX** search and install (open-vsx.org is blocked in the cloud container; tested with a mock).
- The top bar under the Windows window controls (the right padding comes from the Window Controls
  Overlay `titlebar-area-*` CSS variables) and the window-control colours following the theme.
- The native folder picker when adding a project.
- **Terminals on Windows**: PowerShell starts in the project folder, colours/fonts look right, resizing
  works, and **Stop** on a script really ends the dev server (node/dotnet child processes).
- **Script discovery** in your real repos (npm/pnpm, `.csproj`, Azure Functions folders).
- **Sign in to Claude Code…** with a real account: `claude auth login` in the terminal, then the
  "Signed in" toast, the terminal closing by itself, and Get started saying "Signed in with your
  Claude subscription".
- **Routines and artifacts with your real account:** the Routines tab lists your routines (check the
  schedule words and prompts), on/off and Run now work, runs and their logs show, and a routine Claude
  makes in a chat appears after the reload. Artifacts: Claude's Artifact tool exists in your Claude
  Code, Open in Jig shows the page, Load from claude.ai lists yours and opens one. If the tools are
  missing, the tabs should say so clearly.
- **The chat with a real Claude Code:**
  - the `/` list shows your skills and plugin commands;
  - `/usage` and custom commands print their output;
  - a plan in plan mode shows as a plan card;
  - subagent progress updates;
  - Edit and send again continues correctly (the rewind point);
  - MCP servers show their real status;
  - the Effort submenu matches your model;
  - `!` commands run in PowerShell on Windows.
- **Git live refresh on Windows:** in a workspace with many repositories, edit a file in one of them
  outside Jig; it should show in the Git view within about a second. Task Manager should show no steady
  `git` processes while nothing changes. (Linux, where the tests run, uses the polling fallback.)
- **Browser with a real chat:** ask Claude to start your dev server and check a page. Check
  that the view follows, that clicks and typing on the picture reach the page (also on a HiDPI
  screen), that screenshots show in the chat, and that the browser window doesn't keep Jig running
  after you close it.
- **A real pattern run**: after a few days of use, press Look for patterns now and check the
  suggestions make sense (and that "Never" sticks). The weekly run on Monday 10:00 (or at the next
  launch after it).
- **A real build with Claude Code**: Tools → Build something… → e.g. "a status bar button that runs
  npm test in the active project". Check that the builder reads the catalog, prefers changing an
  existing add-on when you name one, passes validation, that the preview works, and Accept/Discard.
  Open the Builder chat to see what it did.
- **Add from Azure across tenants** (tested with a fake `az` only): check that every subscription you
  have shows with its resource groups, and which ones it says it couldn't read (a tenant may need
  `az login --tenant <id>` once).
- **Open a Claude Code chat** (tested with the fake engine only): check that your real Claude Code
  chats are listed (the desktop app's Code tab and terminal ones), that the history reads right
  (long chats with subagents and tools), and that sending a message continues it while the original
  stays as it was in the desktop app.
- **Pipelines with your Azure DevOps** (tested with a fake `az` only): check that your repositories'
  pipelines show with their newest run and stages, that the Run form's branch list and parameter
  pickers match the YAML, that Queue run starts the run you picked (try a harmless pipeline or
  "Deploy to: none") and that its notification comes; "More pipelines" for the rest. Needs `az login` and
  `az extension add --name azure-devops`.
- **Git on your real repos**: large histories (scrolling, filter), Windows paths with spaces, line
  endings in diffs, push with your credential manager (a sign-in window may appear — that is git's,
  not Jig's), Open in VS Code (needs the `code` command on PATH).
- **Add-ons on Windows**: the add-on host process (utilityProcess) starts, `api.exec("git", …)` works
  without a console window flashing, and file watching picks up saves in `%USERPROFILE%\.jig\addons`.

- **Updates from your clone with the launcher**: break the build on purpose in a throwaway commit (e.g.
  throw in `main/index.ts`), push it, then Tools → Check for updates… → Pull, build and restart: the
  launcher should start the previous build with the banner. Revert the commit and update again.
- **The Windows installer** (phase 11; only the Linux package could be built and run here): on
  Windows run `npm install` and `npm run dist`, install `apps/desktop/release/Jig-Setup-0.1.0.exe`
  (SmartScreen: More info → Run anyway), start Jig from the Start menu, check the icon, that Get started
  opens and finds Claude Code (the bundled `claude.exe`), git, az + the DevOps extension and `code`;
  start a session, open a terminal (PowerShell; try `cmd.exe` and Git Bash in Settings → Terminal), and
  check the built-in add-ons load (they are bundled with the packaged esbuild). Uninstall from Windows
  Settings → Apps.
- **Updates**: Check for updates… in your clone after a new commit on GitHub (Pull, build and restart),
  and in the installed app once there is a GitHub release (a private repository can't be checked
  without a login, so it says "Couldn't check").

- **Pasting a screenshot with real Claude Code**: Win+Shift+S, then Ctrl+V in a chat, ask "what's in this
  image?" — Claude should describe it (the image goes as an image block; only the fake engine was used
  here). Then attach a real PDF and a Word/Excel/PowerPoint file you use at work and ask for a summary;
  also try copying a file in Explorer and pasting it into the message box.
- **Try several ways with your real Claude Code**: three attempts on a small task in one of your repos;
  check the worktrees appear under `~/.jig/attempts`, the judge's verdict makes sense, and Keep applies
  cleanly and removes the worktrees (`git worktree list`).
- **Previews on Windows**: a PDF, a video (seeking) and an HTML page with scripts from your own repos;
  Markdown with images in a sibling folder.
- **Desktop notifications on Windows**: put Jig in the background during a long turn; a Windows
  notification should appear when it finishes (and the taskbar button flash on a permission prompt), and clicking it should bring Jig to the front and open that chat (`focusJig`: restores,
  shows, briefly sets always-on-top because Windows refuses focus to a background process; the
  notification is kept referenced, as Electron drops clicks on a collected one). Not yet tried on Windows.
- **Restore files and fork with your real Claude Code**: let Claude edit a file, then Restore files to
  before that message (the preview should list it); fork a chat and check the fork remembers the
  conversation while the original doesn't see the fork's messages.
- **Context meter with your real Claude Code**: after a few turns the % in the chat header should match
  `/context` in the CLI for the same session; Compact should shrink it and show "Conversation compacted
  (… → … tokens)".
- **The What Jig can do page**: open it with the `?` in the top bar; check your skills from
  `~/.claude/skills` are listed and that the screenshots look right on your screen.
- **Configuring from a real chat**: ask Claude Code (real login) to "switch to a light theme and make it
  compact" and "move the terminals to the right"; check the permission prompts, the change cards and
  Undo, and that "allow API keys" is refused.
- **Plan usage with your real login** (only the fake engine ran here): the status bar numbers and the
  card should match `/usage` in Claude Code; check the reset times, the per-model weekly windows of your
  plan, and that it updates after a chat. If it says "usage n/a" while you're signed in with a
  subscription, look at the card's message and Jig's log.
- **Your real repos folder as a workspace**: check that every repository is found (Projects shows the
  count; if one is missing tell me how deep it is), that the Git view stays fast with all of them, that
  file watching keeps it up to date on Windows, and that the scripts list isn't too long.
- **File icons with your VS Code**: Settings → Appearance → File icons should say "Same as VS Code
  (Material Icon Theme)" and the samples, Git list and tabs should match VS Code. Also try VS Code's
  default Seti (a font-based theme: only tested with unit tests) and a light colour theme (Material's
  light variants).

## Known gaps / notes

- In the cloud container Electron's binary download fails through the proxy; it was installed by
  hand. On a normal machine `npm install` downloads it.
- `docs/plan/01-app-skeleton.md` lists the bridge as `window.jig.invoke` + renderer `call()` (the
  envelope design); see its notes.

## Model defaults and desktop polish (2026-10-29)

- New chats default to native Opus planning / Sonnet execution and Plan mode. Settings → Claude Code exposes the chat, subagent fallback, helper and tester models; Use recommended defaults applies the preset to existing installations. Existing saved choices remain.
- Subagent fallback is Sonnet, add-on questions use Sonnet, tester/reflection stay Haiku. Explicit specialist choices remain available; this is not a quality guarantee or cost cap.
- Top-bar action groups each have a menu; the all-tools icon and Ctrl+K still search everything. Theme cards apply only on selection, with no hover preview. Menu/button text and toolbar icons increase one token step.
- Pipelines → Arrange hides/restores whole DevOps projects. Settings checks/save show progress/errors.
- Extra usage formats cents as currency (4000 EUR = €40.00).
- Windows builds include an explicit ICO and shell relaunch metadata. Needs testing after reinstalling; existing taskbar pins may need repinning.

- Markdown Preview renders safe embedded README HTML (headings, centered blocks and sized local images), instead of printing tags. Scripts and handlers are removed; chat HTML stays escaped.

Validation: `npm run check` passes (454 tests; 8 skipped). Focused fake-engine Electron regressions pass for model settings/action groups, pipeline gear navigation/project hiding, theme selection and Markdown HTML/local images. Screenshots regenerated. The packaged Windows app starts and loads its built-in add-ons, and the executable contains Jig’s icon. The pipeline gear failure was not reproduced in current source; verify the fresh installed build. Actual installed taskbar/pinned-shortcut appearance still needs reinstall verification.

Markdown table follow-up: preserve HTML spans, column widths and cell alignment; README screenshot galleries no longer lose their spanning rows. Ordinary GFM table alignment is retained too.

UI follow-up: larger panel view tabs and slightly smaller top-bar group labels. Open top-bar menus switch groups on hover; closed menus stay closed. Add from Azure gives Filter and Group matching label/input stacks so their inputs align.

Taskbar investigation: the installed executable, running-window icon handles and Start-menu shortcut all contain Jig’s logo, and there is no Jig taskbar pin. The reported Electron taskbar icon therefore remains a shell/grouping issue rather than a missing asset. Follow-up defers taskbar registration until window branding is ready, uses the executable icon for relaunch metadata and excludes browser helpers. Actual visible taskbar result still needs verification after installing this follow-up.

Menus remain open while a screenshot overlay takes focus. Git history from a project resolves its focused/only inner repository or offers a repository picker; it displays that repository’s current-branch commits. Git Settings keeps Every visible beside the interval select. Shared regular Button text returns to text-sm with centered icons, while panel tabs and toolbar icon buttons retain their separate sizes.

Settings follow-up: Claude Code model choices are dropdowns discovered without an AI prompt; the recommended preset is a primary button and subagent precedence lives in expandable help. Font fields offer bundled/system/custom choices and individual Reset buttons. Open VSX search runs after a 500 ms typing pause (at least two characters), with stale results ignored; Enter/Search remains available.

Repos hover actions now reserve their layout space; revealing fetch/pull/push/more no longer shifts repository text or changes row height.

The main Jig logo/name menu now includes the registered Jig actions (setup, updates, reload, settings, developer tools, all tools and About), replacing the duplicate top-bar Jig group. Development also sets explicit window-level taskbar icon/relaunch metadata, using its own identity.

Latest validation: `npm run check` passes with 459 tests (8 skipped). Additional fake-engine Electron regressions pass for merged/hovering menus, screenshot blur, workspace history, model pickers, font reset and automatic Open VSX search. The user requested a local development launch instead of another installer; use the existing Jig home and close the installed copy first. Taskbar visual verification remains open.

Live validation (2026-10-29): closed the installed copy and launched `npm run dev` from this checkout. The dev server is at http://localhost:5199/ and the app uses the existing `~/.jig` home; the visible local Electron window was verified. No follow-up installer was built.

Panel-tab refinement: labels (Chats, Files, Pipelines, etc.) use text-sm, one step smaller; icon and button dimensions remain unchanged. Applied to the live dev build through hot reload.

Dropdown/menu hover is clearer: an accent-tinted fill and inset accent outline identify the hovered or keyboard-selected row, also in the all-tools picker. Disabled rows stay unhighlighted.

Dropdown item labels use text-sm (matching the all-tools picker); icon sizes, row heights and the stronger hover highlight are unchanged.
