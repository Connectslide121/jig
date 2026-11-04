import type { AiProvider } from "./providers";

/**
 * Your plans' usage: Claude's 5-hour session window and weekly windows as Claude Code's `/usage`
 * reports them, and ChatGPT's 5-hour and weekly windows as OpenAI's Codex CLI reports them (D-298,
 * docs/reference/usage.md). Jig asks each program; it never reads either login.
 */
export interface UsageWindow {
  /** `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `model:<name>`, … */
  id: string;
  label: string;
  /** Share of the window used, 0–100; null when unknown. */
  percent: number | null;
  /** ISO time when the window resets. */
  resetsAt?: string;
  /** The window's length, when known (300 = 5 hours, 10080 = a week): its short name in the footer. */
  minutes?: number;
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
    /** Currency minor units from Claude Code; format with formatUsageAmount. */
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

/** Each provider's usage (the footer shows Claude, then ChatGPT). */
export type UsageByProvider = Record<AiProvider, PlanUsage>;

export const EMPTY_USAGE_BY_PROVIDER: UsageByProvider = { claude: EMPTY_USAGE, chatgpt: EMPTY_USAGE };

/** The two windows the footer shows for a provider: the session window, then the week. */
export const FOOTER_WINDOWS: Record<AiProvider, [string, string]> = {
  claude: ["five_hour", "seven_day"],
  chatgpt: ["primary", "secondary"],
};

/** A window's short name in the footer: `5h`, `wk`, `day`, `3h`. */
export function windowShort(w: UsageWindow | undefined, fallback = ""): string {
  const m = w?.minutes;
  if (!m) return fallback;
  if (m === 10080) return "wk";
  if (m === 1440) return "day";
  if (m % 1440 === 0) return `${m / 1440}d`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${m}m`;
}

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

const WINDOWS: Array<[keyof NonNullable<RawUsage["rate_limits"]>, string, number?]> = [
  ["five_hour", "Current session (5 h)", 300],
  ["seven_day", "This week (all models)", 10080],
  ["seven_day_opus", "This week (Opus)", 10080],
  ["seven_day_sonnet", "This week (Sonnet)", 10080],
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
  for (const [id, label, minutes] of WINDOWS) {
    const w = limits[id] as RawWindow;
    if (!w || (w.utilization === null && !w.resets_at)) continue;
    windows.push({ id, label, percent: clamp(w.utilization), resetsAt: w.resets_at ?? undefined, minutes });
  }
  for (const m of limits.model_scoped ?? []) {
    if (windows.some((w) => w.label === `This week (${m.display_name})`)) continue;
    windows.push({
      id: `model:${m.display_name}`,
      label: `This week (${m.display_name})`,
      percent: clamp(m.utilization),
      resetsAt: m.resets_at ?? undefined,
      minutes: 10080,
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

/** One window of Codex's rate limits (`account/rateLimits/read`, app-server protocol v2). */
export interface RawCodexWindow {
  usedPercent?: number | null;
  windowDurationMins?: number | null;
  /** Unix seconds. */
  resetsAt?: number | null;
}

/**
 * The part of Codex's `account/rateLimits/read` answer Jig uses: the `rateLimits` snapshot. Nothing
 * else is kept (the answer also names the account; Jig drops it).
 */
export interface RawCodexRateLimits {
  primary?: RawCodexWindow | null;
  secondary?: RawCodexWindow | null;
  planType?: string | null;
  /** Set when a limit is reached (`rate_limit_reached`, …). */
  rateLimitReachedType?: string | null;
}

/** "Current session (5 h)", "This week", "Last 24 h" — from the window's length. */
function codexWindowLabel(minutes: number | null | undefined, which: "primary" | "secondary"): string {
  if (minutes === 300) return "Current session (5 h)";
  if (minutes === 10080) return "This week";
  if (minutes === 1440) return "Today (24 h)";
  if (minutes && minutes % 60 === 0) return `${minutes / 60}-hour window`;
  return which === "primary" ? "Short window" : "Long window";
}

/**
 * Turns Codex's rate limits into what Jig shows, like `planUsageFrom` for Claude. `undefined`: Codex
 * isn't signed in with ChatGPT (or isn't installed), so there is nothing to show.
 */
export function codexUsageFrom(raw: RawCodexRateLimits | undefined, now = new Date()): PlanUsage {
  const updatedAt = now.toISOString();
  if (!raw)
    return {
      state: "unavailable",
      windows: [],
      updatedAt,
      message: "ChatGPT usage shows when OpenAI's Codex CLI is signed in with ChatGPT.",
    };
  const windows: UsageWindow[] = [];
  for (const which of ["primary", "secondary"] as const) {
    const w = raw[which];
    if (!w || (typeof w.usedPercent !== "number" && !w.resetsAt)) continue;
    windows.push({
      id: which,
      label: codexWindowLabel(w.windowDurationMins, which),
      percent: clamp(w.usedPercent),
      resetsAt:
        typeof w.resetsAt === "number" && Number.isFinite(w.resetsAt)
          ? new Date(w.resetsAt * 1000).toISOString()
          : undefined,
      minutes: w.windowDurationMins ?? undefined,
    });
  }
  const plan = raw.planType && raw.planType !== "unknown" ? raw.planType : undefined;
  return {
    state: windows.length ? "ok" : "unavailable",
    subscription: plan,
    windows,
    warning: raw.rateLimitReachedType ? { window: raw.rateLimitReachedType, status: "rejected" } : undefined,
    updatedAt,
    message: windows.length ? undefined : "Codex didn't report any limits for this ChatGPT plan.",
  };
}

/** A plan's name for its badge: `max` → "Max", `promax` → "Pro Max", `plus` → "Plus". */
export function planName(subscription: string | undefined): string | undefined {
  if (!subscription) return undefined;
  const known: Record<string, string> = { promax: "Pro Max", prolite: "Pro Lite", edu_plus: "Edu Plus" };
  return (
    known[subscription] ??
    subscription
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
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

/** Time left until a reset, short for the status bar: `45m`, `2h 13m`, `6d`; '' when unknown or past. */
export function formatResetShort(resetsAt: string | undefined, now = new Date()): string {
  if (!resetsAt) return "";
  const ms = new Date(resetsAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h}h ${min % 60}m` : `${h}h`;
  return h % 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h / 24}d`;
}

/** How alarming a percentage is, like the usage plugin's bars: calm below 60 %, amber from 60 %, red from 85 %. */
export function usageTone(percent: number | null | undefined): "ok" | "warning" | "danger" {
  if (percent === null || percent === undefined) return "ok";
  return percent >= 85 ? "danger" : percent >= 60 ? "warning" : "ok";
}

/** Claude Code reports overage amounts in currency minor units (for example, euro cents). */
export function formatUsageAmount(amount: number, currency = "USD"): string {
  try {
    const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Whether a plan has room for a chat to carry on with it (D-338): its usage is known, no window is
 * used up and it reports no limit. `reason` says why not, for the limit card.
 */
export function planHasRoom(usage: PlanUsage | undefined, name: string): { ok: boolean; reason?: string } {
  if (!usage || usage.state === "unknown") return { ok: false, reason: `Jig hasn't heard from ${name} yet` };
  if (usage.state === "unavailable") return { ok: false, reason: `${name} isn't signed in with a plan` };
  if (usage.state === "error" && !usage.windows.length)
    return { ok: false, reason: `Jig couldn't ask ${name}` };
  if (usage.warning?.status === "rejected" || usage.windows.some((w) => (w.percent ?? 0) >= 100))
    return { ok: false, reason: `${name}'s limit is reached too` };
  return { ok: true };
}

/** When a used-up plan has room again: the latest reset of its full windows, or of its limit warning. */
export function planResetsAt(usage: PlanUsage | undefined): string | undefined {
  const full = (usage?.windows ?? [])
    .filter((w) => (w.percent ?? 0) >= 100 && w.resetsAt)
    .map((w) => w.resetsAt!);
  const warned = usage?.warning?.status === "rejected" ? usage.warning.resetsAt : undefined;
  return [...full, ...(warned ? [warned] : [])].sort().at(-1);
}
