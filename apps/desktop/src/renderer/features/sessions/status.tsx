import { MessageSquare } from "lucide-react";
import type { SessionMeta, SessionStatus } from "../../../shared/engine";
import { cn, type MarkStatus, StatusMark } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { projectFillClass } from "../projects/colors";
import { useSeenTurns, useSessions } from "./store";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "Idle",
  starting: "Starting",
  working: "Working",
  needs_you: "Needs you",
  error: "Error",
};

const MARK: Partial<Record<SessionStatus, MarkStatus>> = {
  starting: "working",
  working: "working",
  needs_you: "attention",
  error: "error",
};

/** A chat finished a turn since you last had it in front of you (its tab showing). */
export function useUnread(meta: Pick<SessionMeta, "id" | "turns"> | undefined): boolean {
  const seen = useSeenTurns((s) => (meta ? s[meta.id] : undefined));
  return meta !== undefined && seen !== undefined && meta.turns > seen;
}

/**
 * A chat's mark, the same in its tab, the Chats list and everywhere chats are listed (D-416): its
 * speech bubble filled in its project's colour; in that slot three bouncing dots while it works, a
 * ringing bell when it needs you, an alert after an error; an accent dot poking out of the bubble's
 * top-right corner when it finished a turn you haven't seen.
 */
export function ChatIcon({
  meta,
  className,
}: {
  meta: Pick<SessionMeta, "id" | "turns" | "status" | "projectId">;
  className?: string;
}) {
  const color = useProjects((s) => s.projects.find((p) => p.id === meta.projectId)?.color);
  const unread = useUnread(meta);
  const fill = color ? projectFillClass(color) : undefined;
  const mark = MARK[meta.status];
  if (mark) return <StatusMark status={mark} className={cn(fill, className)} />;
  if (unread)
    return (
      <span
        title="Finished, not seen yet"
        data-testid="status-mark"
        data-status="unread"
        className="relative flex shrink-0"
      >
        <MessageSquare className={cn("size-3.5", fill, className)} />
        <span className="-top-1 -right-1 absolute size-2 rounded-full bg-accent" />
      </span>
    );
  return <MessageSquare className={cn("size-3.5 shrink-0", fill, className)} />;
}

/** `ChatIcon` for a chat by its id (a tab's params). */
export function ChatIconById({ params }: { params: Record<string, unknown> }) {
  const meta = useSessions((s) => s.metas[String(params.sessionId)]);
  return meta ? <ChatIcon meta={meta} /> : <MessageSquare className="size-3.5" />;
}

/** A status alone (the Chats list grouped by status): its mark, or the plain bubble when idle. */
export function StatusIcon({ status, className }: { status: SessionStatus; className?: string }) {
  const mark = MARK[status];
  return mark ? (
    <StatusMark status={mark} className={className} />
  ) : (
    <MessageSquare className={cn("size-3.5 shrink-0", className)} />
  );
}
