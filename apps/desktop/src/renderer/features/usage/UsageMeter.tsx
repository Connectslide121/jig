import { LogIn, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { AiProvider } from "../../../shared/providers";
import {
  FOOTER_WINDOWS,
  formatResetIn,
  formatResetShort,
  formatUsageAmount,
  type PlanUsage,
  planName,
  type UsageWindow,
  usageTone,
  windowShort,
} from "../../../shared/usage";
import { timeAgo } from "../../lib/time";
import { refreshUsage, useUsage } from "../../stores/usage";
import { Badge, Button, cn, IconButton, Tooltip } from "../../ui";
import { workbench } from "../../workbench/store";
import { PROVIDER_MARKS, ProviderMark } from "./ProviderMark";

const TONE_TEXT = { ok: "text-muted", warning: "text-warning", danger: "text-danger" } as const;
/** Green while there is room, amber from 60 %, red from 85 %, for every provider. */
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

/** The highest share used across a plan's windows, for the compact meter. */
function worst(usage: PlanUsage): number | null {
  const values = usage.windows.map((w) => w.percent).filter((p): p is number => p !== null);
  return values.length ? Math.max(...values) : null;
}

function Mark({ provider, className }: { provider: AiProvider; className?: string }) {
  return <ProviderMark provider={provider} className={className} />;
}

function WindowRow({ w, testId }: { w: UsageWindow; testId: string }) {
  const tone = usageTone(w.percent);
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
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

/** One provider's part of the card: its mark and plan, every window, warnings and where it comes from. */
function ProviderSection({ provider, usage }: { provider: AiProvider; usage: PlanUsage }) {
  const warning = usage.warning;
  const plan = planName(usage.subscription);
  const source = PROVIDER_MARKS[provider].source;
  const windowId = (w: UsageWindow) =>
    provider === "claude" ? `usage-window-${w.id}` : `usage-window-${provider}-${w.id}`;
  return (
    <section className="flex flex-col gap-3" data-testid={`usage-card-${provider}`}>
      <div className="flex h-5 items-center gap-2">
        <Mark provider={provider} className="flex-1" />
        {plan && <Badge>{plan}</Badge>}
      </div>
      {usage.state === "unknown" && <div className="text-muted">Asking {source}…</div>}
      {(usage.state === "unavailable" || (usage.state === "error" && usage.windows.length === 0)) && (
        <div className="text-muted">{usage.message}</div>
      )}
      {provider === "chatgpt" && usage.state === "unavailable" && (
        <div>
          <Button size="sm" icon={LogIn} onClick={() => void workbench.openTab("jig.setup")}>
            Get started
          </Button>
        </div>
      )}
      {usage.windows.map((w) => (
        <WindowRow key={w.id} w={w} testId={windowId(w)} />
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
      <div className="text-2xs text-hint" data-testid={`usage-source-${provider}`}>
        From {source}
        {usage.updatedAt && usage.state !== "unknown" ? ` · updated ${timeAgo(usage.updatedAt)}` : ""}
        {usage.state === "error" && usage.windows.length > 0 ? " · couldn't refresh" : ""}
      </div>
    </section>
  );
}

/**
 * The card shown on hover: Claude's plan, then ChatGPT's, each with every window, when it resets and
 * where the numbers come from. Both sections always show, so the card is the same whatever you hover.
 */
export function UsageCard() {
  const usage = useUsage((s) => s.usage);
  const refreshing = useUsage((s) => s.refreshing);
  return (
    <div className="flex w-96 flex-col gap-3 p-1" data-testid="usage-card">
      <ProviderSection provider="claude" usage={usage.claude} />
      <div className="border-t border-line" />
      <ProviderSection provider="chatgpt" usage={usage.chatgpt} />
      <div className="flex items-center gap-1 border-t border-line pt-2 text-2xs text-hint">
        <span className="flex-1">Chats and AI features count against these limits</span>
        <IconButton
          icon={RefreshCw}
          size="sm"
          label="Refresh both"
          data-testid="usage-refresh"
          className={refreshing ? "animate-spin" : undefined}
          onClick={() => void refreshUsage()}
        />
      </div>
    </div>
  );
}

/**
 * One window in the status bar: its short name, a bar, the share used and the time left, each in a
 * fixed slot with tabular numbers, so nothing moves when the numbers change. `na`: limits don't apply.
 */
function MiniWindow({
  label,
  w,
  testId,
  na,
}: {
  label: string;
  w: UsageWindow | undefined;
  testId: string;
  na?: boolean;
}) {
  const tone = usageTone(w?.percent);
  const left = formatResetShort(w?.resetsAt);
  return (
    <span className="flex items-center gap-1.5" data-testid={testId}>
      <span className="w-4 whitespace-nowrap text-hint">{windowShort(w, label)}</span>
      <span className="relative h-2 w-12 overflow-hidden rounded-full bg-active">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BAR[tone])}
          style={{ width: `${Math.min(100, Math.max(0, w?.percent ?? 0))}%` }}
        />
      </span>
      <span className={cn("w-8 text-right font-medium", tone === "ok" ? "text-fg" : TONE_TEXT[tone])}>
        {na ? "n/a" : percentText(w?.percent ?? null)}
      </span>
      <span className="w-14 whitespace-nowrap text-hint">{left}</span>
    </span>
  );
}

/**
 * One provider in the status bar. Wide footer: the mark and two windows (session, week). Narrow
 * footer (a container query on the status bar, not the window): the mark and the highest share.
 * The width-dependent display is set only through @max-5xl/@5xl variants (D-297).
 */
function UsageGroup({ provider, usage }: { provider: AiProvider; usage: PlanUsage }) {
  const [first, second] = FOOTER_WINDOWS[provider];
  const window = (id: string) => usage.windows.find((w) => w.id === id);
  const na = usage.state === "unavailable" || (usage.state === "error" && usage.windows.length === 0);
  const prefix = provider === "claude" ? "usage-mini" : `usage-mini-${provider}`;
  const top = worst(usage);
  const tone = usage.warning?.status === "rejected" ? "danger" : usageTone(top);
  return (
    <span className="flex items-center gap-2" data-testid={`usage-group-${provider}`}>
      <Mark provider={provider} />
      <span className="items-center gap-2.5 @max-5xl/statusbar:hidden @5xl/statusbar:flex">
        <MiniWindow label="5h" w={window(first)} testId={`${prefix}-${first}`} na={na} />
        <MiniWindow label="wk" w={window(second)} testId={`${prefix}-${second}`} na={na} />
      </span>
      <span
        className={cn(
          "w-8 text-right font-medium @max-5xl/statusbar:inline @5xl/statusbar:hidden",
          tone === "ok" ? "text-fg" : TONE_TEXT[tone],
        )}
        data-testid={`usage-top-${provider}`}
      >
        {na ? "n/a" : percentText(top)}
      </span>
    </span>
  );
}

/**
 * Status bar: Claude's usage, then ChatGPT's (when Codex is signed in), each behind its mark; hover for
 * the card, click to refresh both.
 */
export function UsageStatusItem() {
  useTick();
  const usage = useUsage((s) => s.usage);
  const refreshing = useUsage((s) => s.refreshing);
  const chatgptShown = useUsage((s) => s.chatgptShown);
  return (
    <Tooltip content={<UsageCard />} side="above" delay={150} interactive className="max-w-none p-2">
      <button
        type="button"
        onClick={() => void refreshUsage()}
        className={cn(
          "flex items-center gap-3 tabular-nums text-muted hover:text-fg",
          refreshing && "opacity-80",
        )}
        data-testid="usage-status"
        aria-label="Plan usage: Claude and ChatGPT"
      >
        <UsageGroup provider="claude" usage={usage.claude} />
        {chatgptShown && (
          <>
            <span className="h-3 w-px bg-line-strong" aria-hidden />
            <UsageGroup provider="chatgpt" usage={usage.chatgpt} />
          </>
        )}
      </button>
    </Tooltip>
  );
}
