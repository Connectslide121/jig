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
import { CHATGPT_COST_NOTE, CHATGPT_NO_PRICE_NOTE } from "../../apps/desktop/src/shared/openaiPrices";
import { type CountKey, progressParts, type QueueCounts } from "./lib/counts";
import type { Task, TaskStatus } from "./lib/tasks";

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

/** A cost, $0.00 included; a dash when there's none (yet, or a ChatGPT model without an API price). */
export function money(usd?: number) {
  return usd === undefined ? "—" : `$${usd.toFixed(2)}`;
}

/**
 * The tooltip of a cost cell (D-414): ChatGPT tasks' costs are estimates at OpenAI API prices, and one
 * that finished on a model without a known price has none.
 */
export function costTitle(tasks: readonly Task[]): string | undefined {
  const chatgpt = tasks.filter((t) => t.ranOn === "chatgpt");
  if (!chatgpt.length) return undefined;
  const only = tasks.length === 1 ? tasks[0]! : undefined;
  return only?.finishedAt && only.costUsd === undefined ? CHATGPT_NO_PRICE_NOTE : CHATGPT_COST_NOTE;
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

/** A count's colour: its status's, and neutral for up next and after the stop line. */
export const countTone = (key: CountKey): Tone =>
  key === "upNext" || key === "later" ? "neutral" : STATUS_TONE[key];

/** A count's text colour in a sentence: only what needs an eye (running, needs you, failed) is coloured. */
export function countTextClass(key: CountKey): string {
  if (key === "running") return "text-info";
  if (key === "needs_you") return "text-warning";
  if (key === "failed" || key === "error") return "text-danger";
  return "text-muted";
}

/**
 * How far the tasks that will run are (D-352): done, the rest that ran, then the running ones, each as
 * its share of them; the track that's left is up next, and left-out tasks aren't drawn. The track's
 * colour and size come from `className`.
 */
export function ProgressParts({
  counts,
  className,
  testId,
}: {
  counts: QueueCounts;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("flex overflow-hidden", className)} data-testid={testId}>
      {progressParts(counts).map(({ key, share }) => {
        const tone = countTone(key);
        return (
          <div
            key={key}
            className={tone === "neutral" ? "bg-hint" : BAR[tone]}
            style={{ width: `${share * 100}%` }}
          />
        );
      })}
    </div>
  );
}
