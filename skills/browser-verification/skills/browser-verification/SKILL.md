---
name: browser-verification
description: Verify changed UI flows in a browser with interaction, layout and accessibility checks and evidence.
---

# Browser verification

Use after meaningful UI/interaction changes, or for an explicit browser regression/debugging task.
Choose the browser tools or test framework already available in the project. In Jig chats, use
Jig's browser/tester when available; do not assume a separate Playwright install or dev server.

- Read the real app URL, start/run instructions and existing test setup. Reuse a running server
  where appropriate. Do not launch conflicting servers or expose services publicly.
- Follow the user's flow using accessible labels/roles or existing stable test ids. Prefer
  observable behavior to assertions about component names or implementation details.
- Check the success outcome and the relevant loading/empty/error path. Exercise keyboard focus,
  a realistic narrow viewport and the themes affected by the change.
- For layout changes, compare the affected element's position before/after opening a picker,
  loading content or toggling an option. Scroll the transcript/list to verify fixed controls.
- Inspect a screenshot of the final state. Wait for the relevant transition/data condition,
  not an arbitrary long sleep. Check browser console errors connected to the changed behavior.
- Avoid destructive/live-account actions unless the user authorized them. Use test data and
  temporary state for isolated regression checks; do not use real credentials in tests.
- Report what was actually exercised, what passed/failed and what remains unverified. A screenshot
  alone does not prove an interactive flow, and code inspection is not a browser test.

Reference: https://playwright.dev/docs/best-practices
