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

/**
 * Where to make a tour of a turn's changes: the folder of the first file Claude changed (its
 * repository is the one the tour covers), else the chat's folder. A chat in a folder of
 * repositories works in one of them; its own folder is no repository.
 */
export function tourFolder(cwd: string, changed: string[]): string {
  const first = changed[0];
  if (!first) return cwd;
  const absolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(first);
  const path = absolute ? first : `${cwd.replace(/[\\/]+$/, "")}/${first}`;
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : cwd;
}
