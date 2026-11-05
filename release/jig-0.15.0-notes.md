## New

- **Train Hey Jig on your voice.** Turning Hey Jig on for the first time asks you to say "Hey Jig" five times, with a live level meter and a check per take. Jig learns how you say it, so it hears you more reliably, especially with an accent. Nothing of your audio is kept.
- **Hey Jig in the status bar.** Always in the same place (dimmed while off): click to turn listening on or off, right-click for training, voice commands and speech settings.
- **Default reasoning effort for Claude chats.** Settings → Chats → Claude chats lets you pick the effort new Claude chats start with, when their project sets none.

## Improved

- **Mark as done for more tasks.** Partly done, Failed and Blocked tasks in the queue can now be marked done by hand when the rest of the work happened elsewhere; the chat's own report stays visible under your note.
- **Tidier chat box.** Permission, provider and model sit side by side at their natural width, without the gap before the model.
- **Tidier chat header.** Tokens and cost moved to the chat overview, where the This chat card now shows a Cost row next to Tokens.
- **Hey Jig icons** now mean one thing each: listening, not listening, and Jig's voice muted (Mute/Unmute also in Settings).

## Fixed

- New chats in a project that sets only a model (or a ChatGPT project without an effort) now get Jig's default effort instead of none.
- Teams phone setup no longer fails after creating the Function app with newer Azure CLI versions.
- Jig on your phone through Teams sends one notification per permission request instead of two.
- Pipelines finds a newly added repository's pipelines right away instead of a few minutes later.
- Signing in to an Azure tenant again right after cancelling a sign-in no longer says another sign-in is still running.
- The task queue's progress line is back along the bottom of the Queue header.
- The Send button's corners next to its menu arrow are square again.
