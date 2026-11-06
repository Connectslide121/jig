/**
 * Testing on a small model (D-124): every chat gets the `jig-tester` subagent, which tests UI in
 * Jig's browser on the tester model (Haiku by default), so the chat's own model (often Opus)
 * doesn't spend its quota clicking through pages. Tools → Test something… starts a chat on the
 * tester model with the same instructions.
 */

/** The subagent's name, as Claude sees it in the Agent tool. */
export const TESTER_AGENT = "jig-tester";

/** Jig's browser tools on the `jig` MCP server; the tester gets all of them. */
export const BROWSER_TOOLS = [
  "jig_browser_open",
  "jig_browser_navigate",
  "jig_browser_read",
  "jig_browser_click",
  "jig_browser_type",
  "jig_browser_press",
  "jig_browser_screenshot",
  "jig_browser_resize",
  "jig_browser_console",
  "jig_browser_network",
  "jig_browser_eval",
];

/** What the tester may use: the browser, and reading files (it tests; it never changes code). */
export const TESTER_TOOLS = [...BROWSER_TOOLS.map((t) => `mcp__jig__${t}`), "Read", "Grep", "Glob"];

/** How a test is done and reported, for the subagent and for a test chat. */
export const TEST_PROTOCOL = `How to test:
1. Open the page with jig_browser_open (the URL you were given; ask for it if there is none — never start servers yourself).
2. Do each step as a user would: jig_browser_read to find elements, then click, type and press. Check what the page shows after each step with jig_browser_read.
3. Look at jig_browser_console for errors, and at jig_browser_network when something doesn't load or save.
4. Take a jig_browser_screenshot of each result that matters (sizes "phone", "tablet", "desktop" when layout is part of the test).
5. Don't change any code or files, and don't guess: if you can't do a step, say where it stopped and why.

Report at the end, short:
- One line per check: PASS or FAIL, what you did and what you saw (quote the page's text).
- Console errors and failed requests, if any.
- For a FAIL: the steps to reproduce it.`;

/** The `jig-tester` subagent (Agent SDK `AgentDefinition`). */
export function testerAgent(model: string) {
  return {
    description:
      "Tests web UI in Jig's browser on a small, cheap model: give it the URL (the dev server must already run) and exactly what to check, step by step. It reports PASS/FAIL per check with screenshots and never changes code. Use it for checking pages after a change, instead of clicking through them yourself.",
    prompt: `You are Jig's tester. You test web pages in Jig's browser for the main chat and report what you find.\n\n${TEST_PROTOCOL}`,
    tools: TESTER_TOOLS,
    model: model || "haiku",
    // Everything it needs is in the request; skipping CLAUDE.md keeps it small and cheap.
    omitClaudeMd: true,
    maxTurns: 80,
  };
}

/** The first message of a Tools → Test something… chat. */
export function testChatMessage(what: string, url?: string): string {
  return [
    `Test this in Jig's browser${url?.trim() ? ` at ${url.trim()}` : ""}:`,
    "",
    what.trim(),
    "",
    TEST_PROTOCOL,
  ].join("\n");
}

/**
 * ChatGPT chats' tester helper (D-337): Codex has no subagents, so Jig offers the same role as a tool
 * that runs a separate `codex exec` with only Jig's browser tools, on the ChatGPT tester model.
 */
export const TEST_TOOL = "jig_test_page";

/** The tester helper's whole prompt: jig-tester's instructions, then the page and the steps. */
export function codexTesterPrompt(url: string, steps: string): string {
  return `You are Jig's tester. You test web pages in Jig's browser (the jig_browser_* tools of Jig's MCP server, your only tools) for the main chat and report what you find.

${TEST_PROTOCOL}

<page>${url.trim()}</page>

<steps>
${steps.trim()}
</steps>`;
}

/** What a ChatGPT chat is told about its tester helper (instead of the jig-tester subagent). */
export const CODEX_TESTER_GUIDANCE = `To test a page after a change (click through it, check it works, look for errors), call Jig's ${TEST_TOOL} tool instead of doing it yourself: it runs a separate Codex on a small, cheap model with only Jig's browser tools, in this chat's page. Start the dev server first (jig_terminal_run), then give it the URL and exact steps and checks; it answers PASS/FAIL per check with screenshots. Do it yourself only for a quick look or when the user asks you to.`;
