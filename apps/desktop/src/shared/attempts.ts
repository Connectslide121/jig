/** "Try several ways": the same task run by several Claude Code chats, each in its own git worktree. */
export interface Attempt {
  index: number;
  /** The angle this attempt takes ("Simplest change that works", …). */
  hint: string;
  sessionId: string;
  worktree: string;
  branch: string;
}

export interface AttemptVerdict {
  /** The attempt Claude recommends (1-based), if any works. */
  winner?: number;
  summary: string;
  notes: Array<{ attempt: number; strengths: string; weaknesses: string }>;
  at: string;
}

export interface AttemptRun {
  id: string;
  projectId: string;
  /** The repository the attempts start from (its HEAD commit `base`). */
  repo: string;
  base: string;
  task: string;
  createdAt: string;
  status: "running" | "kept" | "discarded";
  /** The attempt applied to the repository. */
  kept?: number;
  attempts: Attempt[];
  verdict?: AttemptVerdict;
}

export interface AttemptFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  insertions: number;
  deletions: number;
}

export interface AttemptChanges {
  index: number;
  files: AttemptFile[];
  insertions: number;
  deletions: number;
}

/** Angles offered for 2–4 attempts; you can edit them. */
export const ATTEMPT_ANGLES = [
  "Take the simplest, smallest change that works.",
  "Go for the cleanest design: refactor if it makes the result clearer.",
  "Be thorough: handle edge cases and add or update tests.",
  "Try an unconventional approach you would not pick first.",
];
