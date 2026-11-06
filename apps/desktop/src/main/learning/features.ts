/**
 * Jig's own features, for the weekly review (D-213): so Claude can say "Jig already does this, here's
 * where" instead of suggesting a new tool. `action` is a Jig action id the suggestion card runs for
 * "Show me" (`use-feature`). Keep it in step with the "What Jig can do" page (features/about).
 */
export const JIG_FEATURES: Array<{ name: string; what: string; where: string; action?: string }> = [
  {
    name: "Search",
    what: "find any chat, file, view or action",
    where: "Ctrl+P / Ctrl+K",
    action: "jig.tools",
  },
  {
    name: "Chats board",
    what: "every chat across projects in columns: needs you, working, unread, errors",
    where: "Chats menu",
    action: "jig.chatsBoard",
  },
  {
    name: "Try several ways",
    what: "2–4 chats do the same task in their own worktrees; compare and keep the best",
    where: "split button in the message box",
    action: "jig.attempts",
  },
  {
    name: "Chat in a worktree",
    what: "a chat on its own branch and folder, so parallel work doesn't collide",
    where: "Chats menu",
    action: "jig.newWorktreeChat",
  },
  {
    name: "Rewind and fork",
    what: "edit an earlier message and send again; files go back too; fork to try another approach",
    where: "hover a message in a chat",
  },
  {
    name: "Plan mode and permission modes",
    what: "let Jig plan first and approve the plan; per-chat permission mode",
    where: "Shift+Tab in the message box",
  },
  {
    name: "Remember in CLAUDE.md",
    what: "start a message with # to save an instruction for every chat",
    where: "message box",
  },
  {
    name: "Project instructions and starter prompts",
    what: "instructions added to every chat of a project, and prompts to start from",
    where: "project settings",
  },
  {
    name: "Attach files and screenshots",
    what: "paste screenshots, drop PDFs and Office files instead of pasting text",
    where: "message box",
  },
  {
    name: "Dictation",
    what: "talk instead of typing (local Whisper)",
    where: "mic button, Ctrl+Shift+Space",
  },
  {
    name: "Jig’s browser",
    what: "Jig is already instructed to verify web UI changes using its browser/tester; the user does not need to enable this or request it every time. Tool permissions still follow the chat's mode",
    where: "opens automatically when Jig uses it; Show when used changes only its visibility",
    action: "jig.openClaudeBrowser",
  },
  {
    name: "Browser",
    what: "the user's native browser for personal browsing, separate from Jig's verification tools",
    where: "top-right globe button",
    action: "jig.openBrowser",
  },
  {
    name: "Test something",
    what: "a test chat on a small model that checks a flow in the browser",
    where: "Search → Test something…",
    action: "jig.testSomething",
  },
  {
    name: "Check before committing",
    what: "Jig checks staged changes for secrets, debug output and unfinished code",
    where: "Git view",
  },
  {
    name: "Write commit message",
    what: "a commit message in the repository's style",
    where: "Git view → Write",
  },
  {
    name: "Walk me through the changes",
    what: "a guided tour of a chat's or repository's changes",
    where: "chat file totals, Git view",
  },
  {
    name: "Review comments",
    what: "comment on diff lines and send them all to a chat",
    where: "Git view diffs",
  },
  {
    name: "Write my standup",
    what: "Done / Next / Blockers from commits and chats",
    where: "Search",
    action: "jig.standup",
  },
  {
    name: "Scripts",
    what: "run, restart and stop every repo's scripts from one place; Ask Jig when one fails",
    where: "bottom panel",
    action: "jig.runningScripts",
  },
  {
    name: "Project links",
    what: "Azure resources, sites and DevOps links per project, grouped by environment",
    where: "Projects menu",
    action: "jig.links.show",
  },
  {
    name: "Routines",
    what: "Claude Code routines on a schedule, with runs and logs",
    where: "Search → Routines",
    action: "jig.routines",
  },
  {
    name: "Skills library",
    what: "built-in skills (design, React, backend, security…) per project",
    where: "Chats → Skills library",
    action: "jig.skills",
  },
  {
    name: "Named layouts",
    what: "save how the views are arranged and switch between them",
    where: "View → Layout",
    action: "jig.saveLayout",
  },
  {
    name: "Preview",
    what: "Markdown, PDFs, spreadsheets, notebooks, images, Office files, editable code",
    where: "click a file",
    action: "jig.preview",
  },
  {
    name: "Turn this chat into a tool",
    what: "the builder makes a one-click tool from what a chat did by hand",
    where: "chat ⋯ menu",
  },
  {
    name: "Add-on gallery",
    what: "install add-ons a team shares",
    where: "Jig menu",
    action: "jig.addonGallery",
  },
  {
    name: "Jig configures itself",
    what: "ask any chat to change theme, layout, settings or switch add-ons on and off",
    where: "any chat",
  },
];

export function featuresText(): string {
  return JIG_FEATURES.map(
    (f) => `- ${f.name}: ${f.what} (${f.where})${f.action ? ` [actionId: ${f.action}]` : ""}`,
  ).join("\n");
}
