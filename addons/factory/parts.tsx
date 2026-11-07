import type { AddonUiContext } from "@jig/sdk";
import { Badge, cn, useAddonEvent, useHostCall } from "@jig/sdk/ui";
import { useEffect, useState } from "react";
import type { InboxItem } from "./lib/gates";
import { isMine } from "./lib/gates";
import type { Level, OutputStatus, Run } from "./lib/run";

/**
 * Small pieces the factory's views share: the run lists from the host, the level badge, the progress
 * ring and the status pills. Each keeps a fixed size, so a row never moves when its state changes.
 */

/** A project's runs; reloads when the host says they changed. */
export function useRuns(projectId: string | undefined) {
  const call = useHostCall<Run[]>("runs", { projectId }, { skip: !projectId });
  useAddonEvent("changed", () => void call.reload());
  return call;
}

/** Every project's runs (the inbox and the top bar's count). */
export function useAllRuns() {
  const call = useHostCall<Run[]>("allRuns");
  useAddonEvent("changed", () => void call.reload());
  return call;
}

/** Re-renders every half minute, for "waiting 25 m" and the like. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Opens a run's page. */
/** Opens a run: its Interview tab while it is in its interview, else its Run tab. */
export function openRun(
  ctx: AddonUiContext,
  run: Pick<Run, "id" | "projectId" | "title"> & { state?: Run["state"] },
) {
  if (run.state === "interview") openInterview(ctx, run);
  else ctx.openTab("run", { projectId: run.projectId, runId: run.id, title: run.title });
}

export function openInterview(ctx: AddonUiContext, run: Pick<Run, "id" | "projectId" | "title">) {
  ctx.openTab("interview", { projectId: run.projectId, runId: run.id, title: `${run.title} · Interview` });
}

/** Opens the run's Demo review tab (D-462). */
export function openReview(ctx: AddonUiContext, run: Pick<Run, "id" | "projectId" | "title">) {
  ctx.openTab("review", { projectId: run.projectId, runId: run.id, title: `${run.title} · Demo review` });
}

/** The level's badge in a fixed slot (empty while the interview hasn't picked one). */
export function LevelBadge({ level }: { level?: Level }) {
  return (
    <span className="inline-flex w-6 shrink-0">
      {level && (
        <Badge tone="info" className="tabular-nums">
          {level}
        </Badge>
      )}
    </span>
  );
}

/** A small progress ring (0…1), drawn with the theme's line and accent colours. */
export function Ring({ value, className }: { value: number; className?: string }) {
  const r = 5;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0 -rotate-90", className)} aria-hidden="true">
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-line" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeDasharray={`${v * c} ${c}`}
        strokeLinecap="round"
        className="stroke-accent"
      />
    </svg>
  );
}

const OUTPUT_PILL: Record<
  OutputStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" | "info" | "accent" }
> = {
  draft: { label: "Draft", tone: "warning" },
  reviewed: { label: "Reviewed", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  published: { label: "Published", tone: "accent" },
  rejected: { label: "Rejected", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export function OutputPill({ status }: { status: OutputStatus }) {
  const p = OUTPUT_PILL[status];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

const INBOX_PILL: Record<InboxItem["status"], { label: string; tone: "warning" | "info" | "danger" }> = {
  waiting: { label: "Waiting", tone: "warning" },
  draft: { label: "Draft", tone: "warning" },
  reviewed: { label: "Reviewed", tone: "info" },
  "needs-you": { label: "Question", tone: "warning" },
  stuck: { label: "Stuck", tone: "danger" },
};

/** An inbox row's pill: "you" when it is yours, else what it waits for. */
export function InboxPill({ item }: { item: InboxItem }) {
  if (isMine(item.owner)) return <Badge tone="accent">you</Badge>;
  const p = INBOX_PILL[item.status];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

/** A run's right-edge mark in lists: "you" when a gate waits for you, Done/Stopped, else nothing. */
export function RunMark({ run, mine }: { run: Run; mine: boolean }) {
  if (mine) return <Badge tone="accent">you</Badge>;
  if (run.state === "done") return <Badge tone="success">Done</Badge>;
  if (run.state === "stopped") return <Badge tone="neutral">Stopped</Badge>;
  if (run.state === "stuck") return <Badge tone="danger">Stuck</Badge>;
  return null;
}

/** A time of day ("11:40") today, else a short date ("3 Nov"). */
export function clock(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now).toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
