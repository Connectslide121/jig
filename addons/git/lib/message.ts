/** Asking Claude for a commit message (Git add-on, `ctx.ai.ask`). */

/** The question for Claude: the diff plus the repository's recent subjects for its style. */
export function commitMessagePrompt(c: {
  staged: boolean;
  diff: string;
  recent: string;
  truncated: boolean;
}): string {
  return [
    "Write a git commit message for the changes below.",
    "Reply with only the message: a summary line of at most 72 characters in the imperative mood, then, if the change needs it, a blank line and a short body saying what changed and why. No code fences, no quotes, no trailers.",
    c.recent ? `Match the style of this repository's recent commit subjects:\n${c.recent}` : "",
    `${c.staged ? "Staged changes" : "All changes"}${c.truncated ? " (cut short)" : ""}:\n${c.diff}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Claude's answer without code fences or surrounding quotes. */
export function cleanMessage(answer: string): string {
  return answer
    .trim()
    .replace(/^```[\w-]*\n?/, "")
    .replace(/\n?```$/, "")
    .replace(/^["'](.*)["']$/s, "$1")
    .trim();
}
