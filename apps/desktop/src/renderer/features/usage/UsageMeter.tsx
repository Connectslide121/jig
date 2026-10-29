import { Gauge, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatResetIn,
  formatUsageAmount,
  type PlanUsage,
  type UsageWindow,
  usageTone,
} from "../../../shared/usage";
import { timeAgo } from "../../lib/time";
import { refreshUsage, useUsage } from "../../stores/usage";
import { Badge, cn, Tooltip } from "../../ui";

const TONE_TEXT = { ok: "text-muted", warning: "text-warning", danger: "text-danger" } as const;
const TONE_BAR = { ok: "bg-accent", warning: "bg-warning", danger: "bg-danger" } as const;

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
        <RefreshCw className="size-3" /> click to refresh
      </div>
    </div>
  );
}

/** The highest share used across the windows, for the compact meters. */
function worst(usage: PlanUsage): number | null {
  const values = usage.windows.map((w) => w.percent).filter((p): p is number => p !== null);
  return values.length ? Math.max(...values) : null;
}

const pick = (usage: PlanUsage, id: string) => usage.windows.find((w) => w.id === id)?.percent ?? null;

/** Status bar: "5h 42% · wk 18%", always visible; hover for the card, click to refresh. */
export function UsageStatusItem() {
  useTick();
  const usage = useUsage((s) => s.usage);
  const refreshing = useUsage((s) => s.refreshing);
  const five = pick(usage, "five_hour");
  const week = pick(usage, "seven_day");
  const tone = usage.warning?.status === "rejected" ? "danger" : usageTone(worst(usage));
  return (
    <Tooltip content={<UsageCard usage={usage} />} side="above" delay={150} className="max-w-none p-2">
      <button
        type="button"
        onClick={() => void refreshUsage()}
        className={cn("flex items-center gap-1 tabular-nums hover:text-fg", TONE_TEXT[tone])}
        data-testid="usage-status"
        aria-label="Claude plan usage"
      >
        <Gauge className={cn("size-3", refreshing && "animate-pulse")} />
        {usage.state === "ok" ? (
          <span>
            5h {percentText(five)} · wk {percentText(week)}
          </span>
        ) : (
          <span>{usage.state === "unknown" ? "usage…" : "usage n/a"}</span>
        )}
      </button>
    </Tooltip>
  );
}

/** Chat header: a ring that fills with the 5-hour window; hover for the card, click to refresh. */
export function UsageRing() {
  useTick();
  const usage = useUsage((s) => s.usage);
  const five = pick(usage, "five_hour") ?? worst(usage);
  const tone = usage.warning?.status === "rejected" ? "danger" : usageTone(worst(usage));
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <Tooltip content={<UsageCard usage={usage} />} delay={150} className="max-w-none p-2">
      <button
        type="button"
        onClick={() => void refreshUsage()}
        className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-hover hover:text-fg"
        data-testid="usage-ring"
        aria-label="Claude plan usage"
      >
        <svg
          viewBox="0 0 16 16"
          className={cn("size-4 -rotate-90", tone === "ok" ? "text-accent" : TONE_TEXT[tone])}
          aria-hidden
        >
          <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" className="stroke-active" />
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            strokeWidth="2.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={`${(c * (five ?? 0)) / 100} ${c}`}
          />
        </svg>
        <span className="tabular-nums">{usage.state === "ok" ? percentText(five) : "—"}</span>
      </button>
    </Tooltip>
  );
}
