import { AppWindow, MessageSquare, Search, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { call } from "../../lib/host";
import { cn, FileIcon, Kbd, SearchInput } from "../../ui";
import { useActiveProject, useProjects } from "../../workbench/projects";
import { type QuickItem, quickGroups } from "../../workbench/quickOpen";
import { registerAction, runAction, useRegistry } from "../../workbench/registry";
import { formatShortcut } from "../../workbench/shortcuts";
import { workbench } from "../../workbench/store";
import { openPreview } from "../preview/actions";
import { useSessions } from "../sessions/store";

/**
 * Go to… (Ctrl+P, D-176): chats, views, actions and the active project's files in one list. A menu
 * you see (the magnifier in the top bar), not a command line: typing only filters.
 */
const useGoTo = create<{ open: boolean }>(() => ({ open: false }));
export const openGoTo = () => useGoTo.setState({ open: true });
const closeGoTo = () => useGoTo.setState({ open: false });

const ICON = { chat: MessageSquare, view: AppWindow, action: Wrench } as const;

export function registerGoTo(): void {
  registerAction({
    id: "jig.goTo",
    title: "Go to a chat, file, view or action…",
    group: "Jig",
    icon: Search,
    shortcut: "Mod+P",
    keywords: ["quick open", "find", "search", "jump"],
    run: openGoTo,
  });
}

function joinPath(root: string, rel: string) {
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${rel.split("/").join(sep)}`;
}

/** The project's files matching the query (debounced; none for an empty query). */
function useFileMatches(root: string | undefined, query: string): QuickItem[] {
  const [files, setFiles] = useState<QuickItem[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!root || !q) {
      setFiles([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      call("files.search", { root, query: q, limit: 30 })
        .then((list) => {
          if (!live) return;
          setFiles(
            list
              .filter((rel) => !rel.endsWith("/"))
              .map((rel) => {
                const parts = rel.split("/");
                return {
                  kind: "file" as const,
                  id: joinPath(root, rel),
                  label: parts[parts.length - 1]!,
                  detail: parts.slice(0, -1).join("/") || undefined,
                };
              }),
          );
        })
        .catch(() => live && setFiles([]));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [root, query]);
  return files;
}

export function GoToHost() {
  const open = useGoTo((s) => s.open);
  if (!open) return null;
  return <GoTo />;
}

function GoTo() {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const project = useActiveProject();
  const projects = useProjects((s) => s.projects);
  const metas = useSessions((s) => s.metas);
  const views = useRegistry((s) => s.views);
  const actions = useRegistry((s) => s.actions);
  const files = useFileMatches(project?.path, query);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo<QuickItem[]>(() => {
    const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? "No project";
    return [
      ...Object.values(metas)
        .filter((m) => m.kind !== "builder" && !m.archived)
        .map((m) => ({
          kind: "chat" as const,
          id: m.id,
          label: m.title || "New chat",
          detail: projectName(m.projectId),
          recency: m.updatedAt,
        })),
      ...Object.values(views).map((v) => ({
        kind: "view" as const,
        id: v.id,
        label: v.title,
        detail: "View",
      })),
      ...Object.values(actions)
        .filter((a) => a.id !== "jig.goTo" && a.visible?.() !== false)
        .map((a) => ({ kind: "action" as const, id: a.id, label: a.title, detail: a.group })),
      ...files,
    ];
  }, [metas, views, actions, files, projects]);

  const groups = useMemo(() => quickGroups(items, query, query ? 8 : 5), [items, query]);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeGoTo();
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, []);

  const go = (item: QuickItem | undefined) => {
    if (!item) return;
    closeGoTo();
    if (item.kind === "chat") workbench.openTab("jig.chat", { sessionId: item.id });
    else if (item.kind === "view") workbench.showView(item.id);
    else if (item.kind === "action") runAction(item.id);
    else openPreview(item.id);
  };

  let n = -1;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Go to"
      data-testid="goto"
      className="no-drag fixed top-12 left-1/2 z-50 flex h-112 w-xl -translate-x-1/2 flex-col rounded-lg border border-line bg-elevated text-sm text-fg shadow-popover"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") setIndex((i) => Math.min(flat.length - 1, i + 1));
        else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
        else if (e.key === "Enter") go(flat[index]);
        else if (e.key === "Escape") closeGoTo();
        else return;
        e.preventDefault();
      }}
    >
      <div className="border-b border-line p-2">
        <SearchInput
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onClear={() => setQuery("")}
          placeholder={
            project ? `Chats, views, actions, files in ${project.name}…` : "Chats, views, actions…"
          }
          data-testid="goto-input"
          aria-label="Go to"
        />
      </div>
      <div role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
        {flat.length === 0 && (
          <div className="px-3 py-4 text-center text-muted">Nothing matches “{query}”.</div>
        )}
        {groups.map((group) => (
          <div key={group.kind}>
            <div className="px-2 pt-2 pb-1 text-2xs font-semibold tracking-wide text-hint uppercase">
              {group.title}
            </div>
            {group.items.map((item) => {
              n++;
              const i = n;
              const Icon = item.kind === "file" ? undefined : ICON[item.kind];
              const action = item.kind === "action" ? actions[item.id] : undefined;
              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  role="option"
                  aria-selected={i === index}
                  tabIndex={-1}
                  data-testid={`goto-${item.kind}-${item.id}`}
                  onMouseEnter={() => setIndex(i)}
                  ref={i === index ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onClick={() => go(item)}
                  className={cn(
                    "flex h-7 cursor-default items-center gap-2 rounded-md px-2",
                    i === index && "bg-accent-soft ring-1 ring-inset ring-accent/60",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center text-muted">
                    {Icon ? <Icon className="size-4" /> : <FileIcon path={item.id} />}
                  </span>
                  <span className="min-w-0 shrink truncate">{item.label}</span>
                  <span className="min-w-0 flex-1 truncate text-hint">{item.detail}</span>
                  <span className="flex w-20 shrink-0 justify-end">
                    {action?.shortcut && <Kbd>{formatShortcut(action.shortcut)}</Kbd>}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
