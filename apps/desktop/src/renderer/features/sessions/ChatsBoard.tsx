import { useEffect, useMemo, useState } from "react";
import type { SessionMeta } from "../../../shared/engine";
import { timeAgo } from "../../lib/time";
import { cn } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { ProjectSwatch } from "../projects/colors";
import { boardColumns, boardSummary } from "./board";
import { StatusDot } from "./status";
import { useSeenTurns, useSessions } from "./store";

/**
 * The chats board (D-178): every chat of every project in a column by what it needs from you. The
 * columns are always there (an empty one says so), so nothing moves when a chat changes column.
 */
export function ChatsBoard() {
  const metas = useSessions((s) => s.metas);
  const seen = useSeenTurns();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const list = useMemo(() => Object.values(metas), [metas]);
  const columns = useMemo(() => boardColumns(list, seen, now), [list, seen, now]);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chats-board">
      <div className="flex h-9 shrink-0 items-center border-b border-line px-3 text-sm text-muted">
        <span className="truncate" data-testid="chats-board-summary">
          {boardSummary(columns, list, now)}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {columns.map((column) => (
          <section
            key={column.key}
            className="flex min-w-56 flex-1 basis-0 flex-col rounded-lg border border-line bg-raised"
            data-testid={`chats-board-${column.key}`}
          >
            <header
              className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3"
              title={column.hint}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{column.title}</span>
              <span className="w-8 shrink-0 text-right text-xs text-muted tabular-nums">
                {column.chats.length}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {column.chats.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-hint">{column.hint}</div>
              ) : (
                column.chats.map((meta) => <BoardCard key={meta.id} meta={meta} now={now} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardCard({ meta, now }: { meta: SessionMeta; now: number }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === meta.projectId));
  return (
    <button
      type="button"
      data-testid={`chats-board-card-${meta.id}`}
      title={meta.lastError ? `${meta.title}\n${meta.lastError}` : meta.title}
      onClick={() => workbench.openTab("jig.chat", { sessionId: meta.id })}
      className={cn(
        "mb-1 flex h-14 w-full flex-col justify-center gap-1 rounded-md border border-transparent px-2 text-left",
        "hover:border-line hover:bg-hover",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{meta.title || "New chat"}</span>
        <StatusDot status={meta.status} />
      </span>
      <span className="flex w-full items-center gap-2 text-xs text-muted">
        <span className="flex size-3 shrink-0 items-center justify-center">
          {project && <ProjectSwatch color={project.color} />}
        </span>
        <span className="min-w-0 flex-1 truncate">{project?.name ?? "No project"}</span>
        <span className="w-14 shrink-0 text-right tabular-nums">
          {meta.costUsd > 0 ? `$${meta.costUsd.toFixed(2)}` : ""}
        </span>
        <span className="w-16 shrink-0 text-right tabular-nums">{timeAgo(meta.updatedAt, now)}</span>
      </span>
    </button>
  );
}
