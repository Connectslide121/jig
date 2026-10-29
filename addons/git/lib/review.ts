/**
 * Review comments anchored to diff lines (pure, tested): you comment on lines of a diff, then send them
 * all to a chat as one message, ThinkRail style.
 */
export interface ReviewComment {
  id: string;
  /** The file, relative to the repository. */
  path: string;
  /** "new": a line of the current version (added or unchanged); "old": a removed line. */
  side: "old" | "new";
  line: number;
  /** The line's code when the comment was made (it may move later). */
  code: string;
  text: string;
  at: string;
}

export function sortComments(list: ReviewComment[]): ReviewComment[] {
  return [...list].sort(
    (a, b) =>
      a.path.localeCompare(b.path) || a.line - b.line || (a.side === b.side ? 0 : a.side === "old" ? -1 : 1),
  );
}

/** The chat message: each comment with its file, line and code, grouped per file. */
export function reviewPrompt(comments: ReviewComment[], where?: string): string {
  const out = [
    `Review comments on my changes${where ? ` (${where})` : ""}. Address each one in the code; if you disagree with one, say why instead.`,
  ];
  let file = "";
  for (const c of sortComments(comments)) {
    if (c.path !== file) {
      file = c.path;
      out.push("", `**${file}**`);
    }
    const code = c.code.trim() ? ` \`${c.code.trim().slice(0, 160).replace(/`/g, "'")}\`` : "";
    out.push(`- line ${c.line}${c.side === "old" ? " (removed)" : ""}${code}: ${c.text.trim()}`);
  }
  return out.join("\n");
}
