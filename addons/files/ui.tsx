import type { AddonComponentProps, AddonProject, AddonUiContext, AddonWorkspace } from "@jig/sdk";
import {
  cn,
  Empty,
  FileIcon,
  IconButton,
  Input,
  useActiveProject,
  useAddonEvent,
  useWorkspaceList,
  VirtualList,
} from "@jig/sdk/ui";
import { ChevronDown, ChevronRight, Eye, Files, FolderTree, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Entry,
  type FileState,
  filterPaths,
  folderChanged,
  type Roots,
  toggleRoot,
  visibleRoots,
} from "./lib/tree";

/** How often the view looks again where folders can't be watched (Linux), while visible. */
const POLL_MS = 5000;
const ROW = 24;

const STATE_CLASS: Record<FileState, string> = {
  modified: "text-warning",
  renamed: "text-info",
  added: "text-success",
  untracked: "text-success",
  deleted: "text-danger line-through",
  conflict: "text-danger",
};
const STATE_LETTER: Record<FileState, string> = {
  modified: "M",
  renamed: "R",
  added: "A",
  untracked: "U",
  deleted: "D",
  conflict: "!",
};

/** A folder Jig knows: a workspace, or a repository inside one. */
interface Folder {
  path: string;
  name: string;
  /** For a folder of repositories: the repositories inside (for git status and the filter). */
  repos: string[];
}

function knownFolders(workspaces: AddonWorkspace[]): Folder[] {
  return workspaces.flatMap((w) => [
    { path: w.path, name: w.name, repos: w.repos.map((r) => r.path) },
    ...w.repos.map((r) => ({ path: r.path, name: `${w.name}/${r.name}`, repos: [] })),
  ]);
}

/** Which folders the view shows, per project (add-on storage `roots:<projectId>`). */
function useRoots(ctx: AddonUiContext, projectId: string) {
  const key = `roots:${projectId}`;
  const [roots, setRoots] = useState<Roots>();
  useEffect(() => {
    let gone = false;
    setRoots(undefined);
    void ctx.storage.get<Roots>(key).then(
      (v) => !gone && setRoots(v ?? { extras: {} }),
      () => !gone && setRoots({ extras: {} }),
    );
    return () => {
      gone = true;
    };
  }, [ctx, key]);
  const update = (change: (r: Roots) => Roots) =>
    setRoots((r) => {
      const next = change(r ?? { extras: {} });
      void ctx.storage.set(key, next);
      return next;
    });
  return [roots, update] as const;
}

/**
 * The project's files (D-101, D-102: it follows the active project). By default its default workspace;
 * the picker chooses another folder and the eye button shows more next to it.
 */
export function FilesView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  if (!project)
    return (
      <Empty icon={Files} title="No project">
        Choose or create a project to see its files.
      </Empty>
    );
  return <ProjectFiles key={project.id} ctx={ctx} project={project} />;
}

type Row =
  | { kind: "root"; folder: Folder; open: boolean }
  | { kind: "entry"; entry: Entry; depth: number; open: boolean; root: string }
  | { kind: "empty"; depth: number; text: string };

function ProjectFiles({ ctx, project }: { ctx: AddonUiContext; project: AddonProject }) {
  const [roots, setRoots] = useRoots(ctx, project.id);
  const workspaces = useWorkspaceList();
  const folders = useMemo(() => knownFolders(workspaces), [workspaces]);
  const shown = roots
    ? visibleRoots(
        roots,
        project.path,
        folders.map((f) => f.path),
      )
    : [];
  const shownFolders = shown.map((p) => folders.find((f) => f.path === p) ?? { path: p, name: p, repos: [] });
  const main = shown[0];
  const shownKey = shown.join("\n");

  // Loaded folder listings, opened folders, git states.
  const [entries, setEntries] = useState<Record<string, Entry[] | "error">>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [states, setStates] = useState<Record<string, Record<string, FileState>>>({});
  const loaded = useRef(new Set<string>());

  const loadDir = useCallback(
    (dir: string) => {
      loaded.current.add(dir);
      void ctx.host.call<Entry[]>("list", { dir }).then(
        (list) => setEntries((e) => ({ ...e, [dir]: list })),
        () => setEntries((e) => ({ ...e, [dir]: "error" })),
      );
    },
    [ctx],
  );
  const loadStatus = useCallback(
    (folder: Folder) =>
      void ctx.host
        .call<Record<string, FileState>>("status", { root: folder.path, repos: folder.repos })
        .then((s) => setStates((all) => ({ ...all, [folder.path]: s })))
        .catch(() => {}),
    [ctx],
  );
  /** Looks at a shown folder again: its opened folders and its git state. */
  const refresh = useCallback(
    (root: string) => {
      for (const dir of loaded.current)
        if (dir === root || dir.startsWith(`${root}/`) || dir.startsWith(`${root}\\`)) loadDir(dir);
      const folder = folders.find((f) => f.path === root);
      if (folder) loadStatus(folder);
    },
    [folders, loadDir, loadStatus],
  );

  useEffect(() => {
    if (!roots) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let gone = false;
    for (const folder of shownFolders) {
      loadDir(folder.path);
      loadStatus(folder);
    }
    void Promise.all(
      shown.map((root) =>
        ctx.host.call<{ live: boolean }>("watchFolder", { root }).then(
          (r) => r.live,
          () => false,
        ),
      ),
    ).then((live) => {
      if (gone || live.every(Boolean)) return;
      timer = setInterval(() => document.visibilityState === "visible" && shown.forEach(refresh), POLL_MS);
    });
    const onFocus = () => shown.forEach(refresh);
    window.addEventListener("focus", onFocus);
    return () => {
      gone = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      for (const root of shown) void ctx.host.call("unwatchFolder", { root }).catch(() => {});
    };
  }, [shownKey, roots === undefined, ctx]);
  useAddonEvent("changed", (payload) => {
    const root = (payload as { root?: string })?.root;
    if (root && shown.includes(root)) refresh(root);
  });

  // The filter: every file of the shown folders, loaded when you start typing.
  const [query, setQuery] = useState("");
  const [all, setAll] = useState<Record<string, string[]>>();
  const listing = useRef<string>(undefined);
  useEffect(() => {
    // Once per set of folders (not on every render while the first answer is on its way).
    if (!query.trim() || all || listing.current === shownKey) return;
    const key = shownKey;
    listing.current = key;
    void Promise.all(
      shownFolders.map(
        async (f) =>
          [f.path, await ctx.host.call<string[]>("files", { root: f.path, repos: f.repos })] as const,
      ),
    )
      .then((list) => {
        // Folders changed meanwhile: this list is of the old ones.
        if (listing.current === key) setAll(Object.fromEntries(list));
      })
      .catch(() => {
        if (listing.current === key) listing.current = undefined;
      });
  }, [query, all, shownKey, ctx]);
  useEffect(() => {
    setAll(undefined);
    listing.current = undefined;
  }, [shownKey]);

  if (!roots || !main) return null;
  const stateOf = (root: string, path: string) => states[root]?.[path];
  const isOpen = (path: string, root: boolean) => open[path] ?? root;
  const toggle = (path: string, root: boolean) => {
    const next = !isOpen(path, root);
    setOpen((o) => ({ ...o, [path]: next }));
    if (next && !entries[path]) loadDir(path);
  };

  // The tree, flattened into rows for the virtual list.
  const rows: Row[] = [];
  const walk = (dir: string, depth: number, root: string) => {
    const list = entries[dir];
    if (list === undefined) return rows.push({ kind: "empty", depth, text: "Loading…" });
    if (list === "error") return rows.push({ kind: "empty", depth, text: "Can't read this folder" });
    if (!list.length) return rows.push({ kind: "empty", depth, text: "Empty" });
    for (const entry of list) {
      const o = entry.dir && isOpen(entry.path, false);
      rows.push({ kind: "entry", entry, depth, open: o, root });
      if (o) walk(entry.path, depth + 1, root);
    }
  };
  for (const folder of shownFolders) {
    const o = isOpen(folder.path, true);
    rows.push({ kind: "root", folder, open: o });
    if (o) walk(folder.path, 1, folder.path);
  }

  const fileMenu = (path: string, dir: boolean, at: MouseEvent | HTMLElement) =>
    ctx.menu(
      [
        ...(dir ? [] : [{ label: "Preview", icon: "eye", onSelect: () => ctx.openPreview(path) }]),
        {
          label: "Open in VS Code",
          icon: "code",
          onSelect: () =>
            void ctx.host
              .call("openInCode", { path })
              .catch((e: Error) =>
                ctx.notify({ title: "Couldn't open VS Code", message: e.message, tone: "warning" }),
              ),
        },
        {
          label: "Show in the file manager",
          icon: "folder-open",
          onSelect: () => ctx.openPath(dir ? path : parent(path)),
        },
        {
          label: dir ? "New chat in this folder" : "Ask Claude about this file",
          icon: "message-square-plus",
          onSelect: () =>
            void ctx.openChat(
              dir
                ? { projectId: project.id, cwd: path }
                : { projectId: project.id, cwd: main, draft: `@${path} ` },
            ),
        },
        { separator: true },
        { label: "Copy path", icon: "copy", onSelect: () => ctx.copy(path) },
        { label: "Copy name", icon: "copy", onSelect: () => ctx.copy(path.split(/[\\/]/).pop() ?? path) },
      ],
      at,
      { slot: "context.file", project, path },
    );

  const pick = (at: HTMLElement) =>
    ctx.menu(
      folders.map((f) => ({
        label: f.name,
        checked: f.path === main,
        onSelect: () => setRoots((r) => ({ ...r, main: f.path === project.path ? undefined : f.path })),
      })),
      at,
    );
  const chooseShown = (at: HTMLElement) =>
    ctx.menu(
      [
        { label: `Show next to ${shownFolders[0]?.name ?? "this folder"}`, disabled: true },
        ...folders
          .filter((f) => f.path !== main)
          .map((f) => ({
            label: f.name,
            checked: shown.includes(f.path),
            onSelect: () => setRoots((r) => toggleRoot(r, main, f.path)),
          })),
      ],
      at,
    );

  const matches =
    query.trim() && all
      ? shownFolders.flatMap((f) =>
          filterPaths(all[f.path] ?? [], query).map((rel) => ({ root: f, rel, path: joinPath(f.path, rel) })),
        )
      : [];

  return (
    <div className="flex h-full flex-col" data-testid="files-view">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-1.5">
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-sm hover:bg-hover"
          title="Choose the folder this view follows"
          data-testid="files-picker"
          onClick={(e) => pick(e.currentTarget)}
        >
          <FolderTree className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium">{shownFolders[0]?.name}</span>
          {shown.length > 1 && <span className="shrink-0 text-xs text-muted">+{shown.length - 1}</span>}
          <ChevronDown className="size-3 shrink-0 text-hint" />
        </button>
        <span className="flex-1" />
        <IconButton
          icon={Eye}
          size="sm"
          label="Show other folders next to this one"
          data-testid="files-shown-menu"
          onClick={(e) => chooseShown(e.currentTarget)}
        />
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={() => shown.forEach(refresh)} />
      </div>
      <div className="relative shrink-0 border-b border-line p-1.5">
        <Search className="pointer-events-none absolute top-3 left-3.5 size-3.5 text-hint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files"
          className="h-7 pl-7 text-xs"
          data-testid="files-filter"
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "Enter" && matches[0]) ctx.openPreview(matches[0].path);
          }}
        />
        {query && (
          <IconButton
            icon={X}
            size="sm"
            label="Clear the filter"
            className="absolute top-2 right-2"
            onClick={() => setQuery("")}
          />
        )}
      </div>
      {query.trim() ? (
        <div className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="files-matches">
          {!all && <div className="px-3 py-1 text-xs text-hint">Looking…</div>}
          {all && matches.length === 0 && <div className="px-3 py-1 text-xs text-hint">No file matches</div>}
          {matches.map((m) => {
            const state = stateOf(m.root.path, m.path);
            return (
              <button
                key={m.path}
                type="button"
                className="flex h-6 w-full min-w-0 items-center gap-1.5 px-3 text-left text-xs hover:bg-hover"
                title={m.path}
                onClick={() => ctx.openPreview(m.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  fileMenu(m.path, false, e.nativeEvent);
                }}
              >
                <FileIcon path={m.path} className="size-3.5 shrink-0" />
                <span className={cn("shrink-0", state ? STATE_CLASS[state] : "text-fg")}>
                  {m.rel.split("/").pop()}
                </span>
                <span className="min-w-0 truncate text-hint">
                  {shown.length > 1 ? `${m.root.name}/` : ""}
                  {m.rel.split("/").slice(0, -1).join("/")}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <VirtualList
          className="min-h-0 flex-1 py-1"
          items={rows}
          rowHeight={ROW}
          renderRow={(row) => {
            if (row.kind === "empty")
              return (
                <div
                  className="flex h-6 items-center text-xs text-hint"
                  style={{ paddingLeft: 8 + row.depth * 12 + 18 }}
                >
                  {row.text}
                </div>
              );
            if (row.kind === "root")
              return (
                <button
                  type="button"
                  className="flex h-6 w-full min-w-0 items-center gap-1 px-1.5 text-left text-2xs font-semibold tracking-wide text-muted uppercase hover:bg-hover"
                  title={row.folder.path}
                  aria-expanded={row.open}
                  data-testid={`files-root-${row.folder.name}`}
                  onClick={() => toggle(row.folder.path, true)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    fileMenu(row.folder.path, true, e.nativeEvent);
                  }}
                >
                  {row.open ? (
                    <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{row.folder.name}</span>
                </button>
              );
            const { entry, depth, root } = row;
            const state = entry.dir ? undefined : stateOf(root, entry.path);
            const changedInside = entry.dir && states[root] ? folderChanged(entry.path, states[root]) : false;
            return (
              <button
                type="button"
                className={cn(
                  "group flex h-6 w-full min-w-0 items-center gap-1 pr-2 text-left text-xs hover:bg-hover",
                  entry.ignored && "opacity-60",
                )}
                style={{ paddingLeft: 8 + depth * 12 }}
                title={entry.path}
                aria-expanded={entry.dir ? row.open : undefined}
                data-testid={`files-entry-${entry.name}`}
                onClick={() => (entry.dir ? toggle(entry.path, false) : ctx.openPreview(entry.path))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  fileMenu(entry.path, entry.dir, e.nativeEvent);
                }}
              >
                {entry.dir ? (
                  row.open ? (
                    <ChevronDown className="size-3.5 shrink-0 text-hint" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-hint" />
                  )
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <FileIcon
                  path={entry.path}
                  folder={entry.dir}
                  expanded={row.open}
                  className="size-3.5 shrink-0"
                />
                <span className={cn("min-w-0 flex-1 truncate", state ? STATE_CLASS[state] : "text-fg")}>
                  {entry.name}
                </span>
                {state && (
                  <span className={cn("shrink-0 text-2xs font-semibold", STATE_CLASS[state])}>
                    {STATE_LETTER[state]}
                  </span>
                )}
                {changedInside && (
                  <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Changes inside" />
                )}
              </button>
            );
          }}
        />
      )}
    </div>
  );
}

function parent(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, "");
}

function joinPath(root: string, rel: string): string {
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${rel.split("/").join(sep)}`;
}

/** Tools → Show files. */
export function showFiles(ctx: AddonUiContext) {
  ctx.showView("files");
}
