import { cn } from "@jig/sdk/ui";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleX,
  LoaderCircle,
  SkipForward,
} from "lucide-react";
import type { TaskStatus } from "./lib/tasks";

/** What the queue view and the all-queues dashboard share: status marks, colours, money. */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const STATUS_TONE: Record<TaskStatus, Tone> = {
  queued: "neutral",
  running: "info",
  needs_you: "warning",
  done: "success",
  partial: "warning",
  failed: "danger",
  blocked: "warning",
  no_report: "neutral",
  error: "danger",
  skipped: "neutral",
};

export function StatusIcon({ status }: { status: TaskStatus }) {
  const c = "size-4 shrink-0";
  if (status === "running") return <LoaderCircle className={cn(c, "animate-spin text-info")} />;
  if (status === "needs_you") return <CircleAlert className={cn(c, "text-warning")} />;
  if (status === "done") return <CircleCheck className={cn(c, "text-success")} />;
  if (status === "partial") return <CircleDot className={cn(c, "text-warning")} />;
  if (status === "failed" || status === "error") return <CircleX className={cn(c, "text-danger")} />;
  if (status === "blocked") return <CircleMinus className={cn(c, "text-warning")} />;
  if (status === "no_report") return <CircleHelp className={cn(c, "text-muted")} />;
  if (status === "skipped") return <SkipForward className={cn(c, "text-hint")} />;
  return <CircleDashed className={cn(c, "text-hint")} />;
}

/** A cost, $0.00 included; a dash when there's none yet (a task that hasn't finished). */
export function money(usd?: number) {
  return usd === undefined ? "—" : `$${usd.toFixed(2)}`;
}

/** A progress bar's segment colour per tone. */
export const BAR: Record<Tone, string> = {
  neutral: "bg-line",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/**
 * Which project's queue the Tasks view should show next (the dashboard's "Open queue"): the view takes
 * it when it mounts or, already open, when it changes.
 */
let shownQueue: string | undefined;
const queueListeners = new Set<(projectId: string) => void>();

export function requestQueue(projectId: string): void {
  shownQueue = projectId;
  for (const listener of queueListeners) listener(projectId);
}

/** The project asked for (once), and a subscription to later asks. */
export function takeRequestedQueue(): string | undefined {
  const id = shownQueue;
  shownQueue = undefined;
  return id;
}

export function onQueueRequest(listener: (projectId: string) => void): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}
