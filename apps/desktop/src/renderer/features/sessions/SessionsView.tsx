import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  ListFilter,
  MessageSquarePlus,
  MessageSquareShare,
  MoreHorizontal,
  Pin,
  PinOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SessionMeta } from "../../../shared/engine";
import { call } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { cn, contextMenu, Empty, IconButton, ListRow, type MenuEntry, openMenuAt } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { formatShortcut } from "../../workbench/shortcuts";
import { useWorkbench, workbench } from "../../workbench/store";
import { ProjectSwatch, projectDotClass } from "../projects/colors";
import { newSession } from "./actions";
import { CHAT_LIST_VIEWS, type ChatGroup, type GroupMark, groupChats, movePinned } from "./grouping";
import { sessionMenu } from "./menus";
import { showProjectOf } from "./project";
import { openSavedChatsDialog } from "./SavedChatsDialog";
import { STATUS_LABEL, StatusDot } from "./status";
import { useSessions } from "./store";

function relative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

const DRAG_TYPE = "application/x-jig-chat";

/** The mark in front of a group's name: a project's square, or an icon for the other groupings. */
function GroupMarkView({ mark }: { mark: GroupMark }) {
  const { projects } = useProjects();
  if (mark.kind === "project") {
    const color = projects.find((p) => p.id === mark.projectId)?.color;
    return (
      <span className={cn("size-2.5 shrink-0 rounded-xs", color ? projectDotClass(color) : "bg-hint")} />
    );
  }
  if (mark.kind === "none") return <span className="size-2.5 shrink-0 rounded-xs bg-hint" />;
  if (mark.kind === "pinned") return <Pin className="size-3 shrink-0" />;
  if (mark.kind === "status") return <StatusDot status={mark.status} className="mx-0.5" />;
  return <Clock className="size-3 shrink-0" />;
}

/**
 * Every chat, in the grouping you chose (D-102): by project (the default: the active project first
 * and open, the other projects collapsed, then "No project"), by status, by day, or as one list. Drag a
 * chat onto a project to move it there; drag a pinned chat onto another pinned chat to reorder them.
 */
export function SessionsView() {
  const metas = Object.values(useSessions((s) => s.metas)).filter((m) => m.kind !== "builder");
  const { projects, activeId } = useProjects();
  const view = useConfig((s) => s.config?.chatList.view) ?? "project";
  const pinnedOrder = useConfig((s) => s.config?.chatList.pinnedOrder) ?? [];
  const activeTab = useWorkbench((s) => s.layout?.main.tabs.find((t) => t.id === s.layout?.main.active));
  const [showArchived, setShowArchived] = useState(false);
  // Groups opened or closed by hand; by default only the active project and "No project" are open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [dropOn, setDropOn] = useState<string>();
  const [dragId, setDragId] = useState<string>();
  const [dropBefore, setDropBefore] = useState<string>();
  // Re-render every 30 s so "3 min" stays true.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const visible = metas.filter((m) => showArchived || !m.archived);
  const groups = groupChats(view, visible, projects, activeId, pinnedOrder);
  const open = (m: SessionMeta) => {
    workbench.openTab("jig.chat", { sessionId: m.id });
    // Also when its tab is already in front: choosing a chat here means working in its project.
    showProjectOf(m.projectId);
  };
  const dragged = dragId ? useSessions.getState().metas[dragId] : undefined;
  const row = (m: SessionMeta, indent: boolean) => {
    const project = view === "project" ? undefined : projects.find((p) => p.id === m.projectId);
    // A pinned chat dropped on another pinned chat takes its place.
    const reorder = Boolean(dragged?.pinned && m.pinned && dragged.id !== m.id);
    return (
      <ListRow
        key={m.id}
        data-testid={`session-${m.title}`}
        selected={activeTab?.type === "jig.chat" && activeTab.params.sessionId === m.id}
        onClick={() => open(m)}
        onContextMenu={contextMenu(() => sessionMenu(m))}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, m.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(m.id);
        }}
        onDragEnd={() => {
          setDragId(undefined);
          setDropBefore(undefined);
        }}
        onDragOver={(e) => {
          if (!reorder) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setDropBefore(m.id);
        }}
        onDrop={(e) => {
          if (!reorder || !dragged) return;
          e.preventDefault();
          e.stopPropagation();
          setDropBefore(undefined);
          setDropOn(undefined);
          const next = movePinned(metas, pinnedOrder, dragged.id, m.id);
          if (next) void updateConfig({ chatList: { pinnedOrder: next } });
        }}
        leading={<StatusDot status={m.status} />}
        className={cn(
          indent && "ml-7",
          m.archived && "opacity-60",
          dropBefore === m.id && reorder && "bg-accent-soft ring-1 ring-accent",
        )}
        trailing={
          <>
            {project && (
              <span title={project.name} className="group-hover:hidden">
                <ProjectSwatch color={project.color} />
              </span>
            )}
            {m.pinned && <Pin className="size-3 shrink-0 text-hint group-hover:hidden" aria-label="Pinned" />}
            {m.status === "needs_you" || m.status === "error" ? (
              <span
                className={cn(
                  "group-hover:hidden",
                  m.status === "needs_you" ? "text-warning" : "text-danger",
                )}
              >
                {STATUS_LABEL[m.status]}
              </span>
            ) : (
              <span className="group-hover:hidden">{relative(m.updatedAt)}</span>
            )}
            <IconButton
              icon={m.pinned ? PinOff : Pin}
              label={m.pinned ? "Unpin" : "Pin to the top"}
              size="sm"
              data-testid={`session-pin-${m.title}`}
              className="hidden group-hover:inline-flex group-focus-within:inline-flex"
              onClick={(e) => {
                e.stopPropagation();
                void call("sessions.setPinned", { id: m.id, pinned: !m.pinned });
              }}
            />
            <IconButton
              icon={MoreHorizontal}
              label="Chat options"
              size="sm"
              className="hidden group-hover:inline-flex group-focus-within:inline-flex"
              onClick={(e) => {
                e.stopPropagation();
                openMenuAt(e.currentTarget, sessionMenu(m), true);
              }}
            />
          </>
        }
      >
        {m.title}
      </ListRow>
    );
  };
  /** A group: header (click to open/close; a project's is also a drop target) and its chats. */
  const group = (g: ChatGroup) => {
    const key = `${view}:${g.key}`;
    const isOpen = toggled[key] ?? (view !== "project" || g.key === "none" || g.projectId === activeId);
    const projectId = g.projectId || undefined;
    return (
      <div
        key={key}
        className={cn("mb-1 rounded-md", dropOn === key && "bg-accent-soft")}
        data-testid={`chat-group-${g.title}`}
        onDragOver={(e) => {
          if (g.projectId === undefined || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropOn(key);
          setDropBefore(undefined);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(undefined);
        }}
        onDrop={(e) => {
          setDropOn(undefined);
          if (g.projectId === undefined) return;
          const id = e.dataTransfer.getData(DRAG_TYPE);
          if (!id) return;
          e.preventDefault();
          if ((useSessions.getState().metas[id]?.projectId ?? "") === g.projectId) return;
          void call("sessions.setProject", { id, ...(projectId ? { projectId } : {}) });
          setToggled((t) => ({ ...t, [key]: true }));
        }}
      >
        {!g.headerless && (
          <div className="group flex h-7 items-center gap-1 px-1 text-xs font-medium text-muted">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-fg"
              aria-expanded={isOpen}
              onClick={() => setToggled((t) => ({ ...t, [key]: !isOpen }))}
            >
              {isOpen ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              <GroupMarkView mark={g.mark} />
              <span className="min-w-0 truncate">{g.title}</span>
              {!isOpen && g.chats.length > 0 && (
                <span className="font-normal text-hint">{g.chats.length}</span>
              )}
            </button>
            {projectId && (
              <IconButton
                icon={MessageSquarePlus}
                label={`New chat in ${g.title}`}
                size="sm"
                data-testid={`new-session-${g.title}`}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={() => void newSession(projectId)}
              />
            )}
          </div>
        )}
        {isOpen && g.chats.length === 0 && (
          <div className="ml-7 px-2 pb-1 text-xs text-hint">
            {projectId ? "No chats — drag one here or start a new one" : "Chats you take out of a project"}
          </div>
        )}
        {isOpen && g.chats.map((m) => row(m, !g.headerless))}
      </div>
    );
  };
  if (projects.length === 0 && visible.length === 0)
    return <Empty title="No chats yet">Create a project, or start a chat in a folder.</Empty>;
  return (
    <div className="flex h-full flex-col" data-testid="sessions-view">
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups
          // "No project" only shows when it has chats, when there are projects, or while a chat is dragged over.
          .filter((g) => g.key !== "none" || g.chats.length > 0 || projects.length > 0 || dropOn)
          .map(group)}
      </div>
      {metas.some((m) => m.archived) && (
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className="flex h-7 items-center gap-1.5 border-t border-line px-3 text-xs text-muted hover:text-fg"
        >
          <Archive className="size-3.5" /> {showArchived ? "Hide archived" : "Show archived"}
        </button>
      )}
    </div>
  );
}

export function SessionsHeaderActions() {
  const activeId = useProjects((s) => s.activeId);
  const view = useConfig((s) => s.config?.chatList.view) ?? "project";
  const viewMenu = (): MenuEntry[] => [
    { heading: "Group chats" },
    ...CHAT_LIST_VIEWS.map((v) => ({
      label: v.label,
      checked: v.value === view,
      testId: `chat-view-${v.value}`,
      onSelect: () => void updateConfig({ chatList: { view: v.value } }),
    })),
  ];
  return (
    <>
      <IconButton
        icon={ListFilter}
        label="Group chats…"
        size="sm"
        data-testid="chat-list-view"
        onClick={(e) => openMenuAt(e.currentTarget, viewMenu(), true)}
      />
      <IconButton
        icon={MessageSquareShare}
        label="Open a Claude Code chat…"
        size="sm"
        data-testid="open-saved-chat"
        onClick={openSavedChatsDialog}
      />
      <IconButton
        icon={MessageSquarePlus}
        label={`New chat (${formatShortcut("Mod+N")})`}
        size="sm"
        data-testid="new-session"
        disabled={!activeId}
        onClick={() => activeId && void newSession(activeId)}
      />
    </>
  );
}
