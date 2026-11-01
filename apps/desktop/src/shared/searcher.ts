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
