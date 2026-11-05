## Fixes

- **Meetings: joining works again after connecting.** Jig was dropping a fresh Microsoft sign-in before its first silent token request. As a result, Connect opened two "connected" browser tabs, and Join closed back to the lobby with "Reconnect your Microsoft account from Meetings". The sign-in now stays in use, and a failed silent request logs Microsoft's error code (never tokens) to help diagnose it.
- **Meetings: a rejected join link shows its error in the Join dialog again,** instead of leaving the dialog open with no explanation.
- **Chat input:** the permission mode line above the input box is gone. The picker inside the box already shows the mode, and switching modes no longer moves the box.

## Known gaps

- A real Teams join with a real Microsoft account has not been tested on a real machine yet.
- The installer is not code-signed, so Windows SmartScreen may warn on first install.
