import {
  Archive,
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  MessageSquareShare,
  MoreHorizontal,
  Pin,
  PinOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SessionMeta } from "../../../shared/engine";
import { call } from "../../lib/host";
import { cn, contextMenu, Empty, IconButton, ListRow, openMenuAt } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { formatShortcut } from "../../workbench/shortcuts";
import { useWorkbench, workbench } from "../../workbench/store";
import { projectDotClass } from "../projects/colors";
import { newSession } from "./actions";
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

/** Pinned first, then the most recent. */
const order = (a: SessionMeta, b: SessionMeta) =>
  Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt);

/**
 * Every chat, grouped by project (D-102): the active project first and open, the other projects below
 * (collapsed until you open them), then "No project". Drag a chat onto a group to move it there; pinned
 * chats stay at the top of their group.
 */
export function SessionsView() {
  const metas = Object.values(useSessions((s) => s.metas)).filter((m) => m.kind !== "builder");
  const { projects, activeId } = useProjects();
  const activeTab = useWorkbench((s) => s.layout?.main.tabs.find((t) => t.id === s.layout?.main.active));
  const [showArchived, setShowArchived] = useState(false);
  // Groups opened or closed by hand; by default only the active project and "No project" are open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [dropOn, setDropOn] = useState<string>();
  // Re-render every 30 s so "3 min" stays true.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const visible = metas.filter((m) => showArchived || !m.archived);
  const groups = [...projects].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));
  const open = (m: SessionMeta) => {
    workbench.openTab("jig.chat", { sessionId: m.id });
    // Also when its tab is already in front: choosing a chat here means working in its project.
    showProjectOf(m.projectId);
  };
  const row = (m: SessionMeta) => (
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
      }}
      leading={<StatusDot status={m.status} />}
      className={cn("ml-4", m.archived && "opacity-60")}
      trailing={
        <>
          {m.pinned && <Pin className="size-3 shrink-0 text-hint group-hover:hidden" aria-label="Pinned" />}
          {m.status === "needs_you" || m.status === "error" ? (
            <span
              className={cn("group-hover:hidden", m.status === "needs_you" ? "text-warning" : "text-danger")}
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
  /** A group: header (click to open/close, drop target) and its chats. */
  const group = (key: string, title: string, dot: string, list: SessionMeta[], projectId?: string) => {
    const isOpen = toggled[key] ?? (key === "none" || projectId === activeId);
    const target = projectId ?? "";
    return (
      <div
        key={key}
        className={cn("mb-1 rounded-md", dropOn === key && "bg-accent-soft")}
        data-testid={`chat-group-${title}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropOn(key);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(undefined);
        }}
        onDrop={(e) => {
          setDropOn(undefined);
          const id = e.dataTransfer.getData(DRAG_TYPE);
          if (!id) return;
          e.preventDefault();
          if ((useSessions.getState().metas[id]?.projectId ?? "") === target) return;
          void call("sessions.setProject", { id, ...(projectId ? { projectId } : {}) });
          setToggled((t) => ({ ...t, [key]: true }));
        }}
      >
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
            <span className={cn("size-2.5 shrink-0 rounded-xs", dot)} />
            <span className="min-w-0 truncate">{title}</span>
            {!isOpen && list.length > 0 && <span className="font-normal text-hint">{list.length}</span>}
          </button>
          {projectId && (
            <IconButton
              icon={MessageSquarePlus}
              label={`New chat in ${title}`}
              size="sm"
              data-testid={`new-session-${title}`}
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={() => void newSession(projectId)}
            />
          )}
        </div>
        {isOpen && list.length === 0 && (
          <div className="px-6 pb-1 text-xs text-hint">
            {projectId ? "No chats — drag one here or start a new one" : "Chats you take out of a project"}
          </div>
        )}
        {isOpen && list.map(row)}
      </div>
    );
  };
  const loose = visible
    .filter((m) => !m.projectId || !projects.some((p) => p.id === m.projectId))
    .sort(order);
  if (projects.length === 0 && loose.length === 0)
    return <Empty title="No chats yet">Create a project, or start a chat in a folder.</Empty>;
  return (
    <div className="flex h-full flex-col" data-testid="sessions-view">
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.map((project) =>
          group(
            project.id,
            project.name,
            projectDotClass(project.color),
            visible.filter((m) => m.projectId === project.id).sort(order),
            project.id,
          ),
        )}
        {(loose.length > 0 || dropOn === "none" || projects.length > 0) &&
          group("none", "No project", "bg-hint", loose)}
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
  return (
    <>
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
