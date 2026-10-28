/** A guided tour of changes: Claude orders them for understanding and explains each step. */
export interface TourStep {
  title: string;
  file: string;
  /** A line in the new version of the file the step is about (its hunk is highlighted). */
  line?: number;
  explanation: string;
}

export interface Tour {
  id: string;
  /** The repository the changes are in. */
  cwd: string;
  title: string;
  overview: string;
  steps: TourStep[];
  /** Each changed file's diff (against HEAD; new files in full). */
  diffs: Record<string, string>;
  createdAt: string;
}
