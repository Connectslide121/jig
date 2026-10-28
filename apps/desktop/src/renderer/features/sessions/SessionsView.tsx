import { Archive, MessageSquarePlus, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type { SessionMeta } from "../../../shared/engine";
import { cn, contextMenu, Empty, IconButton, ListRow, openMenuAt } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { useWorkbench, workbench } from "../../workbench/store";
import { projectDotClass } from "../projects/colors";
import { newSession } from "./actions";
import { sessionMenu } from "./menus";
import { STATUS_LABEL, StatusDot } from "./status";
import { useSessions } from "./store";

function relative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

/** Every session across projects, grouped by project, with live status. */
export function SessionsView() {
  const metas = Object.values(useSessions((s) => s.metas));
  const { projects, activeId } = useProjects();
  const activeTab = useWorkbench((s) => s.layout?.main.tabs.find((t) => t.id === s.layout?.main.active));
  const [showArchived, setShowArchived] = useState(false);
  // Re-render every 30 s so "3 min" stays true.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const visible = metas.filter((m) => showArchived || !m.archived);
  const groups = [...projects].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));
  const open = (m: SessionMeta) => workbench.openTab("jig.chat", { sessionId: m.id });
  const row = (m: SessionMeta) => (
    <ListRow
      key={m.id}
      data-testid={`session-${m.title}`}
      selected={activeTab?.type === "jig.chat" && activeTab.params.sessionId === m.id}
      onClick={() => open(m)}
      onContextMenu={contextMenu(() => sessionMenu(m))}
      leading={<StatusDot status={m.status} />}
      className={cn("pl-4", m.archived && "opacity-60")}
      trailing={
        <>
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
            icon={MoreHorizontal}
            label="Chat options"
            size="sm"
            className="hidden group-hover:inline-flex"
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
  // Chats of projects that were removed: still listed so they can be opened, stopped or deleted.
  const orphans = visible
    .filter((m) => m.kind !== "builder" && !projects.some((p) => p.id === m.projectId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (projects.length === 0 && orphans.length === 0)
    return <Empty title="No projects yet">Add a project to start a chat.</Empty>;
  return (
    <div className="flex h-full flex-col" data-testid="sessions-view">
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.map((project) => {
          const list = visible
            .filter((m) => m.projectId === project.id)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          return (
            <div key={project.id} className="mb-2">
              <div className="group flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted">
                <span className={cn("size-2 rounded-full", projectDotClass(project.color))} />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <IconButton
                  icon={MessageSquarePlus}
                  label={`New chat in ${project.name}`}
                  size="sm"
                  data-testid={`new-session-${project.name}`}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => void newSession(project.id)}
                />
              </div>
              {list.length === 0 && <div className="px-6 pb-1 text-xs text-hint">No sessions</div>}
              {list.map(row)}
            </div>
          );
        })}
        {orphans.length > 0 && (
          <div className="mb-2" data-testid="sessions-orphans">
            <div className="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted">
              <span className="size-2 rounded-full bg-hint" />
              <span className="min-w-0 flex-1 truncate">Removed projects</span>
            </div>
            {orphans.map(row)}
          </div>
        )}
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
    <IconButton
      icon={MessageSquarePlus}
      label="New chat (Ctrl+N)"
      size="sm"
      data-testid="new-session"
      disabled={!activeId}
      onClick={() => activeId && void newSession(activeId)}
    />
  );
}
