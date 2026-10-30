import { Gauge, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatResetIn,
  formatResetShort,
  formatUsageAmount,
  type PlanUsage,
  type UsageWindow,
  usageTone,
} from "../../../shared/usage";
import { timeAgo } from "../../lib/time";
import { refreshUsage, useUsage } from "../../stores/usage";
import { Badge, cn, IconButton, Tooltip } from "../../ui";

const TONE_TEXT = { ok: "text-muted", warning: "text-warning", danger: "text-danger" } as const;
/** Green while there is room, amber from 60 %, red from 85 %, like the usage plugin's footer. */
const TONE_BAR = { ok: "bg-success", warning: "bg-warning", danger: "bg-danger" } as const;

/** Re-renders every 30 s so "resets in …" and "updated … ago" stay true. */
function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
}

const percentText = (p: number | null) => (p === null ? "—" : `${Math.round(p)}%`);

function resetText(resetsAt: string | undefined): string {
  if (!resetsAt) return "";
  const d = new Date(resetsAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Resets ${formatResetIn(resetsAt)} · ${sameDay ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`}`;
}

function WindowRow({ w }: { w: UsageWindow }) {
  const tone = usageTone(w.percent);
  return (
    <div className="flex flex-col gap-1" data-testid={`usage-window-${w.id}`}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-fg">{w.label}</span>
        <span className={cn("font-medium tabular-nums", tone === "ok" ? "text-fg" : TONE_TEXT[tone])}>
          {percentText(w.percent)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-active">
        <div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${w.percent ?? 0}%` }} />
      </div>
      {w.resetsAt && <div className="text-2xs text-hint">{resetText(w.resetsAt)}</div>}
    </div>
  );
}

/** The card shown on hover: every window with a bar, when it resets, and where the numbers come from. */
export function UsageCard({ usage }: { usage: PlanUsage }) {
  const warning = usage.warning;
  const refreshing = useUsage((s) => s.refreshing);
  return (
    <div className="flex w-72 flex-col gap-3 p-1" data-testid="usage-card">
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-accent" />
        <span className="flex-1 font-medium">Claude plan usage</span>
        {usage.subscription && (
          <Badge>{usage.subscription.charAt(0).toUpperCase() + usage.subscription.slice(1)}</Badge>
        )}
      </div>
      {usage.state === "unknown" && <div className="text-muted">Asking Claude Code…</div>}
      {(usage.state === "unavailable" || (usage.state === "error" && usage.windows.length === 0)) && (
        <div className="text-muted">{usage.message}</div>
      )}
      {usage.windows.map((w) => (
        <WindowRow key={w.id} w={w} />
      ))}
      {warning && (
        <div
          className={cn(
            "flex items-start gap-1.5",
            warning.status === "rejected" ? "text-danger" : "text-warning",
          )}
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {warning.status === "rejected" ? "Limit reached" : "Close to the limit"}
            {warning.resetsAt ? ` · resets ${formatResetIn(warning.resetsAt)}` : ""}
          </span>
        </div>
      )}
      {usage.extra?.enabled && (
        <div className="text-2xs text-muted">
          Extra usage: {percentText(usage.extra.percent)}
          {usage.extra.monthlyLimit !== null && usage.extra.usedCredits !== null
            ? ` (${formatUsageAmount(usage.extra.usedCredits, usage.extra.currency)} of ${formatUsageAmount(usage.extra.monthlyLimit, usage.extra.currency)})`
            : ""}
        </div>
      )}
      <div className="flex items-center gap-1 border-t border-line pt-2 text-2xs text-hint">
        <span className="flex-1">
          From Claude Code{usage.updatedAt ? ` · updated ${timeAgo(usage.updatedAt)}` : ""}
          {usage.state === "error" && usage.windows.length > 0 ? " · couldn't refresh" : ""}
        </span>
        <IconButton
          icon={RefreshCw}
          size="sm"
          label="Refresh"
          data-testid="usage-refresh"
          className={refreshing ? "animate-spin" : undefined}
          onClick={() => void refreshUsage()}
        />
      </div>
    </div>
  );
}

/** The highest share used across the windows, for the compact meters. */
function worst(usage: PlanUsage): number | null {
  const values = usage.windows.map((w) => w.percent).filter((p): p is number => p !== null);
  return values.length ? Math.max(...values) : null;
}

const _pick = (usage: PlanUsage, id: string) => usage.windows.find((w) => w.id === id)?.percent ?? null;

/** One window in the status bar: its name, a bar, the share used and the time left. */
function MiniWindow({ label, w }: { label: string; w: UsageWindow | undefined }) {
  const tone = usageTone(w?.percent);
  const left = formatResetShort(w?.resetsAt);
  return (
    <span className="flex items-center gap-1.5" data-testid={`usage-mini-${w?.id ?? label}`}>
      <span className="text-hint">{label}</span>
      <span className="relative h-2 w-14 overflow-hidden rounded-full bg-active">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BAR[tone])}
          style={{ width: `${Math.min(100, Math.max(0, w?.percent ?? 0))}%` }}
        />
      </span>
      <span className={cn("font-medium", tone === "ok" ? "text-fg" : TONE_TEXT[tone])}>
        {percentText(w?.percent ?? null)}
      </span>
      {left && <span className="text-hint">{left}</span>}
    </span>
  );
}

/** Status bar: a bar per window (5-hour, week) with the share used and time left; hover for the card, click to refresh. */
export function UsageStatusItem() {
  useTick();
  const usage = useUsage((s) => s.usage);
  const refreshing = useUsage((s) => s.refreshing);
  const window = (id: string) => usage.windows.find((w) => w.id === id);
  const tone = usage.warning?.status === "rejected" ? "danger" : usageTone(worst(usage));
  return (
    <Tooltip
      content={<UsageCard usage={usage} />}
      side="above"
      delay={150}
      interactive
      className="max-w-none p-2"
    >
      <button
        type="button"
        onClick={() => void refreshUsage()}
        className={cn(
          "flex items-center gap-3 tabular-nums hover:text-fg",
          tone === "danger" ? TONE_TEXT.danger : "text-muted",
        )}
        data-testid="usage-status"
        aria-label="Claude plan usage"
      >
        <Gauge className={cn("size-3", refreshing && "animate-pulse")} />
        {usage.state === "ok" ? (
          <>
            <MiniWindow label="5h" w={window("five_hour")} />
            <MiniWindow label="wk" w={window("seven_day")} />
          </>
        ) : (
          <span>{usage.state === "unknown" ? "usage…" : "usage n/a"}</span>
        )}
      </button>
    </Tooltip>
  );
}
