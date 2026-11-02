import { type FSWatcher, watch } from "node:fs";
import type { ProjectScripts } from "../../shared/terminals";
import { isRelevantScriptChange, pickWatchDirs, scriptsSignature } from "./changes";

/** Folders watched per project; beyond this, a slow poll covers the rest. */
const MAX_DIRS = 500;
const DEBOUNCE_MS = 400;
const POLL_MS = 60_000;

type Loaded = { result: ProjectScripts; dirs: string[] };
type Tracked = {
  watchers: FSWatcher[];
  key: string;
  signature: string;
  timer?: NodeJS.Timeout;
  poll?: NodeJS.Timeout;
  busy: boolean;
};

/**
 * Notices new, removed and renamed scripts without a restart (D-238). For each project whose scripts
 * were listed, it watches (non-recursively, so never `node_modules`) the folders discovery read, waits
 * for the changes to settle, lists again and calls `onChange` only when the list differs. Folders
 * beyond `MAX_DIRS` are covered by a slow poll.
 */
export function createScriptWatcher(
  load: (projectId: string) => Promise<Loaded>,
  onChange: (result: ProjectScripts) => void,
) {
  const tracked = new Map<string, Tracked>();

  function close(t: Tracked) {
    for (const w of t.watchers) w.close();
    t.watchers = [];
    clearTimeout(t.timer);
    clearInterval(t.poll);
  }

  function schedule(projectId: string) {
    const t = tracked.get(projectId);
    if (!t) return;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => void rescan(projectId), DEBOUNCE_MS);
  }

  function arm(projectId: string, t: Tracked, dirs: string[]) {
    const { watch: picked, capped } = pickWatchDirs(dirs, MAX_DIRS);
    const key = picked.join("\n");
    if (key !== t.key) {
      for (const w of t.watchers) w.close();
      t.watchers = [];
      t.key = key;
      for (const dir of picked) {
        try {
          const w = watch(dir, { recursive: false }, (_event, file) => {
            if (isRelevantScriptChange(file ? String(file) : null)) schedule(projectId);
          });
          // A watched folder that disappears reports an error; the rescan re-arms what's left.
          w.on("error", () => schedule(projectId));
          t.watchers.push(w);
        } catch {
          // Folder gone or not watchable: the next rescan drops it.
        }
      }
    }
    if (capped && !t.poll) t.poll = setInterval(() => schedule(projectId), POLL_MS);
    if (!capped && t.poll) {
      clearInterval(t.poll);
      t.poll = undefined;
    }
  }

  async function rescan(projectId: string) {
    const t = tracked.get(projectId);
    if (!t) return;
    if (t.busy) return schedule(projectId);
    t.busy = true;
    try {
      const { result, dirs } = await load(projectId);
      if (tracked.get(projectId) !== t) return;
      arm(projectId, t, dirs);
      const signature = scriptsSignature(result.scripts);
      if (signature !== t.signature) {
        t.signature = signature;
        onChange(result);
      }
    } catch {
      // The project is gone: stop watching it.
      close(t);
      tracked.delete(projectId);
    } finally {
      t.busy = false;
    }
  }

  return {
    /** Starts (or refreshes) watching a project from a listing the view just got. */
    track(projectId: string, loaded: Loaded) {
      let t = tracked.get(projectId);
      if (!t) {
        t = { watchers: [], key: "", signature: "", busy: false };
        tracked.set(projectId, t);
      }
      t.signature = scriptsSignature(loaded.result.scripts);
      arm(projectId, t, loaded.dirs);
    },
    /** Stops every watcher (tests, shutdown). */
    stopAll() {
      for (const t of tracked.values()) close(t);
      tracked.clear();
    },
  };
}
