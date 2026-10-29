/** A chat that works in its own git worktree (`~/.jig/worktree-chats.json`). */
export interface WorktreeChat {
  sessionId: string;
  projectId?: string;
  /** The repository it came from. */
  repo: string;
  /** The worktree folder (`~/.jig/worktrees/<id>`). */
  path: string;
  branch: string;
  /** The commit it started from; "Apply to my working copy" brings everything since. */
  base: string;
  createdAt: string;
}

/** `jig/<words>-<id>`: a branch name from what the chat is for. */
export function worktreeBranch(name: string, id: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 5)
    .join("-");
  return `jig/${words ? `${words}-` : ""}${id}`;
}
