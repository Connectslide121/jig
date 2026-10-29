/**
 * Live refresh rules for the Git view (pure, tested). The host watches each repository's working
 * folder (where the system watches a whole tree cheaply) and its git folder; these decide which
 * changes matter and how often the view still checks by itself.
 */

/**
 * Whether a watch event says the watched folder itself is gone: Node on Windows then reports the
 * folder's own absolute path (`\\?\C:\…`), over and over, instead of an error; normal events carry
 * a path relative to the folder.
 */
export function watchedFolderGone(file: string): boolean {
  return /^(\\\\\?\\|[a-zA-Z]:[\\/]|\/)/.test(file);
}

/** A change under the working folder that can change `git status` (paths relative to the repo). */
export function treeChangeMatters(file: string): boolean {
  const parts = file.split(/[\\/]/);
  // The git folder has its own watcher; dependencies are almost always ignored and change in bulk.
  if (parts[0] === ".git") return false;
  return !parts.includes("node_modules");
}

/** A change in the git folder that can change the view: HEAD, the index, refs, merges/rebases. */
export function gitDirChangeMatters(file: string): boolean {
  return /^(HEAD|index|FETCH_HEAD|ORIG_HEAD|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|packed-refs)$/.test(file);
}

/** Whether the system watches a whole folder tree with one cheap handle (Windows, macOS). */
export function canWatchTree(platform: string): boolean {
  return platform === "win32" || platform === "darwin";
}

/**
 * How often the view looks again by itself, as a safety net. With the working folders watched,
 * rarely; without (Linux), often enough for edits to show, and less often the more repositories
 * a workspace has (a `git status` each).
 */
export function pollInterval(watchingTree: boolean, repos: number): number {
  if (watchingTree) return 60_000;
  return Math.min(30_000, Math.max(5_000, repos * 1_000));
}

/** Coalesces bursts: runs `fn` `waitMs` after the last call, but at least every `maxMs` during one. */
export function throttleDebounce(fn: () => void, waitMs = 300, maxMs = 1_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = 0;
  const run = () => {
    timer = undefined;
    first = 0;
    fn();
  };
  return {
    call() {
      const now = Date.now();
      if (!first) first = now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, Math.min(waitMs, first + maxMs - now)));
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      first = 0;
    },
  };
}

export type SingleFlight<T> = () => Promise<T>;

/**
 * At most one run of `fn` at a time. A call while it runs gets the result of one more run that starts
 * when it ends (shared by every such call), so the answer is never older than the call.
 */
export function singleFlight<T>(fn: () => Promise<T>): SingleFlight<T> {
  let running: Promise<T> | undefined;
  let queued: Promise<T> | undefined;
  const start = (): Promise<T> => {
    const p = fn().finally(() => {
      if (running === p) running = undefined;
    });
    running = p;
    return p;
  };
  return () => {
    if (!running) return start();
    if (!queued) {
      const settled = running.then(
        () => undefined,
        () => undefined,
      );
      queued = settled.then(() => {
        queued = undefined;
        return start();
      });
    }
    return queued;
  };
}

export interface AutoFetchSettings {
  enabled: boolean;
  /** Minutes between fetches of one repository. */
  minutes: number;
}

export const DEFAULT_AUTO_FETCH: AutoFetchSettings = { enabled: true, minutes: 5 };

/** The repositories whose last fetch is at least `everyMs` ago (never fetched first), oldest first. */
export function dueForFetch(
  repos: string[],
  last: Map<string, number>,
  everyMs: number,
  now: number,
): string[] {
  return repos
    .filter((r) => now - (last.get(r) ?? 0) >= everyMs)
    .sort((a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0));
}
