import type { AddonUiContext, AddonWorkspace } from "@jig/sdk";
import { type Entry, type FileState, type Roots, visibleRoots } from "./lib/tree";

/**
 * The Files view's data, kept for the add-on's lifetime (D-344): one tree per project, outside the
 * view, so switching to another view and back (which unmounts it) shows the tree at once, where it was
 * scrolled. Read at startup for the active project; refreshed in the background on show, on focus
 * and when a watched folder changes, without ever replacing what is shown by a loading row.
 */

/** How often to look again where folders can't be watched (Linux, a lost watch), while visible. */
const POLL_MS = 5000;

/** A folder Jig knows: a workspace, or a repository inside one. */
export interface Folder {
  path: string;
  name: string;
  /** For a folder of repositories: the repositories inside (for git status and the filter). */
  repos: string[];
}

export function knownFolders(workspaces: AddonWorkspace[]): Folder[] {
  return workspaces.flatMap((w) => [
    { path: w.path, name: w.name, repos: w.repos.map((r) => r.path) },
    ...w.repos.map((r) => ({ path: r.path, name: `${w.name}/${r.name}`, repos: [] })),
  ]);
}

/** The folders a project shows: the chosen one first, then the ones shown next to it. */
export function shownFolders(roots: Roots, projectPath: string, folders: Folder[]): Folder[] {
  return visibleRoots(
    roots,
    projectPath,
    folders.map((f) => f.path),
  ).map((p) => folders.find((f) => f.path === p) ?? { path: p, name: p, repos: [] });
}

export interface Tree {
  /** Which folders it shows (add-on storage `roots:<projectId>`); undefined until first read. */
  roots?: Roots;
  /** Folder listings read so far. */
  entries: Record<string, Entry[] | "error">;
  /** Opened (true) or closed (false) folders; shown folders are open unless closed. */
  open: Record<string, boolean>;
  /** Git state per shown folder. */
  states: Record<string, Record<string, FileState>>;
  query: string;
  /** The filter's file list, of the shown folders `allKey`; `allStale` after a change. */
  all?: Record<string, string[]>;
  allKey?: string;
  allStale?: boolean;
  /** Where the tree was scrolled (not rendered from, so changing it notifies nobody). */
  scrollTop: number;
}

const trees = new Map<string, Tree>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Set<string>();

export function snapshot(projectId: string): Tree {
  let t = trees.get(projectId);
  if (!t) {
    t = { entries: {}, open: {}, states: {}, query: "", scrollTop: 0 };
    trees.set(projectId, t);
  }
  return t;
}

export function subscribe(projectId: string, listener: () => void): () => void {
  const set = listeners.get(projectId) ?? new Set();
  listeners.set(projectId, set);
  set.add(listener);
  return () => set.delete(listener);
}

export function update(projectId: string, change: (t: Tree) => Partial<Tree>) {
  trees.set(projectId, { ...snapshot(projectId), ...change(snapshot(projectId)) });
  for (const l of listeners.get(projectId) ?? []) l();
}

export function rememberScroll(projectId: string, top: number) {
  snapshot(projectId).scrollTop = top;
}

/**
 * One call at a time per key. Asked again while it runs, it runs once more afterwards (the files may
 * have changed after the running read looked), however many times it was asked.
 */
const again = new Set<string>();
async function once(key: string, run: () => Promise<void>): Promise<void> {
  if (inflight.has(key)) {
    again.add(key);
    return;
  }
  inflight.add(key);
  try {
    await run();
  } finally {
    inflight.delete(key);
    if (again.delete(key)) void once(key, run);
  }
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Reads (or rereads) a folder; the tree keeps showing the old listing until the new one is in. */
export function loadDir(ctx: AddonUiContext, projectId: string, dir: string) {
  void once(`list:${projectId}:${dir}`, () =>
    ctx.host.call<Entry[]>("list", { dir }).then(
      (list) => {
        if (!same(snapshot(projectId).entries[dir], list))
          update(projectId, (t) => ({ entries: { ...t.entries, [dir]: list } }));
      },
      () => {
        if (snapshot(projectId).entries[dir] !== "error")
          update(projectId, (t) => ({ entries: { ...t.entries, [dir]: "error" } }));
      },
    ),
  );
}

function loadStatus(ctx: AddonUiContext, projectId: string, folder: Folder) {
  void once(`status:${projectId}:${folder.path}`, () =>
    ctx.host
      .call<Record<string, FileState>>("status", { root: folder.path, repos: folder.repos })
      .then((s) => {
        if (!same(snapshot(projectId).states[folder.path], s))
          update(projectId, (t) => ({ states: { ...t.states, [folder.path]: s } }));
      })
      .catch(() => {}),
  );
}

const under = (dir: string, root: string) =>
  dir === root || dir.startsWith(`${root}/`) || dir.startsWith(`${root}\\`);

/** Looks at a shown folder again: its read folders, its git state, and marks the filter's list old. */
export function refresh(ctx: AddonUiContext, projectId: string, root: string) {
  const t = snapshot(projectId);
  loadDir(ctx, projectId, root);
  for (const dir of Object.keys(t.entries))
    if (dir !== root && under(dir, root)) loadDir(ctx, projectId, dir);
  const folder = knownFolders(ctx.workspaces.list()).find((f) => f.path === root) ?? {
    path: root,
    name: root,
    repos: [],
  };
  loadStatus(ctx, projectId, folder);
  if (t.all && !t.allStale && t.allKey?.split("\n").includes(root))
    update(projectId, () => ({ allStale: true }));
}

/** The filter's list of every file in the shown folders; the old one stays until it's in. */
export function loadFiles(ctx: AddonUiContext, projectId: string, folders: Folder[]) {
  const key = folders.map((f) => f.path).join("\n");
  void once(`files:${projectId}`, () =>
    Promise.all(
      folders.map(
        async (f) =>
          [f.path, await ctx.host.call<string[]>("files", { root: f.path, repos: f.repos })] as const,
      ),
    )
      .then((list) =>
        update(projectId, () => ({ all: Object.fromEntries(list), allKey: key, allStale: false })),
      )
      .catch(() => {}),
  );
}

async function loadRoots(ctx: AddonUiContext, projectId: string): Promise<Roots> {
  const cached = snapshot(projectId).roots;
  if (cached) return cached;
  const stored = await ctx.storage.get<Roots>(`roots:${projectId}`).catch(() => undefined);
  // Chosen meanwhile (the picker) wins over what was stored.
  const roots = snapshot(projectId).roots ?? stored ?? { extras: {} };
  if (!snapshot(projectId).roots) update(projectId, () => ({ roots }));
  return roots;
}

export function setRoots(ctx: AddonUiContext, projectId: string, change: (r: Roots) => Roots) {
  const next = change(snapshot(projectId).roots ?? { extras: {} });
  update(projectId, () => ({ roots: next }));
  void ctx.storage.set(`roots:${projectId}`, next);
}

// ------------------------------------------------------------------------------------------------
// Watching: the active project's shown folders stay watched while it is active, whether the view
// is shown or not (the host counts the watches), so changes made meanwhile are already in.

let active: { id: string; path: string } | undefined;
const watched = new Set<string>();
let poll: ReturnType<typeof setInterval> | undefined;

function startPoll(ctx: AddonUiContext) {
  if (poll) return;
  poll = setInterval(() => {
    if (document.visibilityState !== "visible" || !active) return;
    for (const root of watched) refresh(ctx, active.id, root);
  }, POLL_MS);
}

function watchOnly(ctx: AddonUiContext, roots: string[]) {
  const want = new Set(roots);
  for (const root of [...watched])
    if (!want.has(root)) {
      watched.delete(root);
      void ctx.host.call("unwatchFolder", { root }).catch(() => {});
    }
  if (!roots.length) {
    clearInterval(poll);
    poll = undefined;
  }
  for (const root of roots)
    if (!watched.has(root)) {
      watched.add(root);
      void ctx.host.call<{ live: boolean }>("watchFolder", { root }).then(
        (r) => r.live || startPoll(ctx),
        () => startPoll(ctx),
      );
    }
}

/**
 * Makes `project` the one kept up to date: reads its folders (or rereads them in the background
 * when they are already shown) and watches them. Called at startup, when the active project
 * changes, when the view is shown and when its folders change.
 */
export async function sync(ctx: AddonUiContext, project: { id: string; path: string }) {
  active = { id: project.id, path: project.path };
  const roots = await loadRoots(ctx, project.id);
  if (active.id !== project.id) return;
  const shown = shownFolders(roots, project.path, knownFolders(ctx.workspaces.list()));
  for (const folder of shown) refresh(ctx, project.id, folder.path);
  watchOnly(
    ctx,
    shown.map((f) => f.path),
  );
}

/** The add-on's `activate`: keeps the active project's tree loaded and watched from startup. */
export function keepActiveProject(ctx: AddonUiContext): () => void {
  const follow = (payload?: { projectId?: string }) => {
    const id = payload ? payload.projectId : ctx.projects.active()?.id;
    const project = id ? ctx.projects.list().find((p) => p.id === id) : undefined;
    if (project) void sync(ctx, project);
    else {
      active = undefined;
      watchOnly(ctx, []);
    }
  };
  follow();
  const offProject = ctx.onJigEvent("project.active", follow);
  const offChanged = ctx.on("changed", (payload) => {
    const root = (payload as { root?: string })?.root;
    if (active && root && watched.has(root)) refresh(ctx, active.id, root);
  });
  const offLost = ctx.on("watchLost", (payload) => {
    const root = (payload as { root?: string })?.root;
    if (root && watched.has(root)) startPoll(ctx);
  });
  const onFocus = () => {
    if (active) for (const root of watched) refresh(ctx, active.id, root);
  };
  window.addEventListener("focus", onFocus);
  return () => {
    offProject();
    offChanged();
    offLost();
    window.removeEventListener("focus", onFocus);
    active = undefined;
    watchOnly(ctx, []);
  };
}
