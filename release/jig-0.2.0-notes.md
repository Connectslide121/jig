## New

- **Tests add-on:** every repository's test suites (npm test scripts with Vitest, Jest, Playwright, Karma or Cypress, and .NET test projects) in one view. Run one with a click, see failing tests and live output, keep a history of the last runs and ask Claude to fix a failure.
- **A natural voice:** Read aloud and talking now use Kokoro, a natural-sounding voice that runs on this computer, with 19 voices in American and British English and Spanish. The voice model (about 330 MB) downloads once after you agree; until then, and whenever you choose, the system's voices keep working (Settings → Speech).
- **Edit queued messages:** click a message under "Sends after this turn" to change its text before it's sent; it keeps its place and its attachments.
- **Choose the terminal shell:** Settings → Terminal lists the shells installed on this computer (or a custom path), and the Terminals header opens a new terminal in any of them.

## Improved

- **Updates on your terms:** Jig now tells you when an update is available and downloads it only when you ask; Install and restart shows the installer instead of running it silently.
- **Workflows:** workflows appear as cards in a grid that fits the panel, each step is readable without opening the editor, and the box for a message to Claude is taller.
- **Releases:** the unreleased commit count is always complete, and the age shown is the time since the last release.
- **Scripts:** the list follows script files as they change, without a restart, and `.sh` scripts run through Git Bash on Windows.
- **Talking:** the working sound plays only while you're talking, not after you've handed work over.
- Icons now line up precisely with the text beside them.

## Fixed

- Copy buttons copy again, and say Copied only when the text really is in the clipboard.
- A new workflow's tab now takes the workflow's name when you save it.
- A dialog opened a second time could ignore Escape; shortcuts right after closing a dialog now work.
