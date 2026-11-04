/**
 * Searching on a small model: every chat gets the `jig-search` subagent, which finds things in the
 * code on the search model (Haiku by default), so the chat's own model (often Opus) doesn't spend its
 * quota reading through files it only needs a conclusion from. An empty search model turns it off.
 */

/** The subagent's name, as Claude sees it in the Agent tool. */
export const SEARCH_AGENT = "jig-search";

/** It only reads. */
export const SEARCH_TOOLS = ["Read", "Grep", "Glob"];

/** The `jig-search` subagent (Agent SDK `AgentDefinition`). */
export function searchAgent(model: string) {
  return {
    description:
      "Finds things in the code on a small, cheap model: where something is defined or used, which files handle a feature, how a flow goes from A to B. Give it a precise question and how thorough to be; it answers with file paths, line numbers and short excerpts, never changes files. Use it instead of searching yourself (and instead of Explore) whenever finding the answer takes more than two or three Grep/Glob/Read calls.",
    prompt: `You are Jig's code searcher. You find things in the code for the main chat, which then does the actual work.

- Search with Grep and Glob first, then Read only the parts you need (use offsets; don't read whole large files).
- Answer the question you were asked, nothing else. Never change files.
- Report short: what you found, each with its absolute path and line numbers, and an excerpt only when it is needed to understand it. Say clearly what you didn't find or are unsure about; don't guess.`,
    tools: SEARCH_TOOLS,
    model,
    // Everything it needs is in the request; skipping CLAUDE.md keeps it small and cheap.
    omitClaudeMd: true,
    maxTurns: 40,
  };
}

/** What the chat is told about the searcher, appended to the system prompt when it is on. */
export const SEARCH_GUIDANCE = `To find things in the code (where something is defined or used, which files handle a feature, how a flow works), delegate to the ${SEARCH_AGENT} subagent (Agent tool, subagent_type "${SEARCH_AGENT}") instead of searching yourself or using Explore: it runs on a small, cheap model and returns paths, line numbers and short excerpts. Ask it precise questions, several in parallel when they are independent. Search yourself only for a single known file or symbol (one Grep or Read), and read the files you are going to change yourself before changing them.`;

/**
 * ChatGPT chats' search helper (D-337): Codex has no subagents, so Jig offers the same role as a tool
 * that runs a separate, read-only `codex exec` in the chat's folder on the ChatGPT search model.
 */
export const SEARCH_TOOL = "jig_search_code";

/** How thorough a search is (as the chat asks for it). */
export const SEARCH_THOROUGHNESS = ["quick", "medium", "very thorough"] as const;
export type SearchThoroughness = (typeof SEARCH_THOROUGHNESS)[number];

/** The search helper's whole prompt: jig-search's instructions, then the question. */
export function codexSearchPrompt(question: string, thoroughness: SearchThoroughness = "medium"): string {
  return `You are Jig's code searcher. You find things in the code for the main chat, which then does the actual work.

- Search with rg (ripgrep) or your shell's search first, then read only the parts you need (line ranges; don't print whole large files).
- Your sandbox is read-only: only run commands that read. Never change, create or delete files.
- Answer the question you were asked, nothing else.
- Report short: what you found, each with its absolute path and line numbers, and an excerpt only when it is needed to understand it. Say clearly what you didn't find or are unsure about; don't guess.
- Thoroughness: ${thoroughness}. ${
    thoroughness === "quick"
      ? "Stop at the first good answer."
      : thoroughness === "very thorough"
        ? "Look in every likely place and under several naming conventions before you answer."
        : "Check the obvious places and one or two less obvious ones."
  }

<question>
${question.trim()}
</question>`;
}

/** What a ChatGPT chat is told about its search helper (its appended instructions). */
export const CODEX_SEARCH_GUIDANCE = `To find things in the code (where something is defined or used, which files handle a feature, how a flow works), call Jig's ${SEARCH_TOOL} tool instead of searching through files yourself: it runs a separate, read-only Codex on a small, cheap model in this chat's folder and returns paths, line numbers and short excerpts. Ask it one precise question per call (say how thorough: quick, medium or very thorough), several calls in parallel when they are independent. Search yourself only for a single known file or symbol (one rg or read), and read the files you are going to change yourself before changing them.`;
