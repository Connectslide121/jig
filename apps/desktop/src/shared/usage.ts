/**
 * Your Claude subscription usage: the 5-hour session window and the weekly windows, as Claude Code's
 * `/usage` reports them (docs/reference/usage.md). Jig asks Claude Code; it never reads your login.
 */
export interface UsageWindow {
  /** `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `model:<name>`, … */
  id: string;
  label: string;
  /** Share of the window used, 0–100; null when unknown. */
  percent: number | null;
  /** ISO time when the window resets. */
  resetsAt?: string;
}

export interface PlanUsage {
  /**
   * `ok`: windows known. `unavailable`: plan limits don't apply (API key, Bedrock, Vertex) or Claude Code
   * isn't signed in. `error`: asking Claude Code failed. `unknown`: not asked yet.
   */
  state: "ok" | "unavailable" | "error" | "unknown";
  /** `pro`, `max`, `team`, `enterprise`. */
  subscription?: string;
  windows: UsageWindow[];
  /** Extra usage (paid overage), when the plan has it. */
  extra?: {
    enabled: boolean;
    percent: number | null;
    usedCredits: number | null;
    monthlyLimit: number | null;
    currency?: string;
  };
  /** A limit warning Claude Code reported during a chat. */
  warning?: { window: string; status: "allowed_warning" | "rejected"; resetsAt?: string };
  updatedAt?: string;
  message?: string;
}

export const EMPTY_USAGE: PlanUsage = { state: "unknown", windows: [] };

type RawWindow = { utilization: number | null; resets_at: string | null } | null | undefined;

/** The part of Claude Code's usage answer Jig uses (`usage_EXPERIMENTAL…` in the Agent SDK). */
export interface RawUsage {
  subscription_type?: string | null;
  rate_limits_available?: boolean;
  rate_limits?: {
    five_hour?: RawWindow;
    seven_day?: RawWindow;
    seven_day_opus?: RawWindow;
    seven_day_sonnet?: RawWindow;
    model_scoped?: Array<{ display_name: string; utilization: number | null; resets_at: string | null }>;
    extra_usage?: {
      is_enabled: boolean;
      monthly_limit: number | null;
      used_credits: number | null;
      utilization: number | null;
      currency?: string | null;
    } | null;
  } | null;
}

const WINDOWS: Array<[keyof NonNullable<RawUsage["rate_limits"]>, string]> = [
  ["five_hour", "Current session (5 h)"],
  ["seven_day", "This week (all models)"],
  ["seven_day_opus", "This week (Opus)"],
  ["seven_day_sonnet", "This week (Sonnet)"],
];

const clamp = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;

/** Turns Claude Code's usage answer into what Jig shows. */
export function planUsageFrom(raw: RawUsage | undefined, now = new Date()): PlanUsage {
  const updatedAt = now.toISOString();
  if (!raw || raw.rate_limits_available === false || !raw.rate_limits)
    return {
      state: "unavailable",
      subscription: raw?.subscription_type ?? undefined,
      windows: [],
      updatedAt,
      message: raw?.subscription_type
        ? "Claude Code couldn't get your plan's limits right now."
        : "Plan limits apply to a Claude subscription. Claude Code isn't signed in with one (or uses an API key).",
    };
  const limits = raw.rate_limits;
  const windows: UsageWindow[] = [];
  for (const [id, label] of WINDOWS) {
    const w = limits[id] as RawWindow;
    if (!w || (w.utilization === null && !w.resets_at)) continue;
    windows.push({ id, label, percent: clamp(w.utilization), resetsAt: w.resets_at ?? undefined });
  }
  for (const m of limits.model_scoped ?? []) {
    if (windows.some((w) => w.label === `This week (${m.display_name})`)) continue;
    windows.push({
      id: `model:${m.display_name}`,
      label: `This week (${m.display_name})`,
      percent: clamp(m.utilization),
      resetsAt: m.resets_at ?? undefined,
    });
  }
  const x = limits.extra_usage;
  return {
    state: "ok",
    subscription: raw.subscription_type ?? undefined,
    windows,
    extra: x
      ? {
          enabled: x.is_enabled,
          percent: clamp(x.utilization),
          usedCredits: x.used_credits,
          monthlyLimit: x.monthly_limit,
          currency: x.currency ?? undefined,
        }
      : undefined,
    updatedAt,
  };
}

/** "in 2 h 13 min", "in 45 min", "in 3 days" — until a window resets. */
export function formatResetIn(resetsAt: string | undefined, now = new Date()): string {
  if (!resetsAt) return "";
  const ms = new Date(resetsAt).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "now";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `in ${h} h ${min % 60} min` : `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

/** How alarming a percentage is: calm below 75 %, warning from 75 %, danger from 90 %. */
export function usageTone(percent: number | null | undefined): "ok" | "warning" | "danger" {
  if (percent === null || percent === undefined) return "ok";
  return percent >= 90 ? "danger" : percent >= 75 ? "warning" : "ok";
}
