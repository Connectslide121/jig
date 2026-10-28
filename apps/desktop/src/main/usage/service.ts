import type { EngineEvent } from "../../shared/engine";
import { EMPTY_USAGE, type PlanUsage, planUsageFrom, type RawUsage } from "../../shared/usage";
import { logger } from "../log";

const log = logger("usage");

export interface UsageServiceOptions {
  /** Asks Claude Code for the data behind `/usage`. */
  fetch: () => Promise<RawUsage>;
  onChange: (usage: PlanUsage) => void;
  /** Background refresh interval (default 5 min). */
  intervalMs?: number;
  now?: () => Date;
}

/**
 * Keeps your plan usage current: asks Claude Code every few minutes, after chats (at most once a minute)
 * and soon after Claude Code reports a rate-limit warning. One question at a time.
 */
export class UsageService {
  private usage: PlanUsage = EMPTY_USAGE;
  private inflight: Promise<PlanUsage> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private soon: NodeJS.Timeout | undefined;

  constructor(private readonly options: UsageServiceOptions) {}

  current(): PlanUsage {
    return this.usage;
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  private ageMs(): number {
    return this.usage.updatedAt
      ? this.now().getTime() - new Date(this.usage.updatedAt).getTime()
      : Number.POSITIVE_INFINITY;
  }

  async refresh(): Promise<PlanUsage> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const next = planUsageFrom(await this.options.fetch(), this.now());
        this.set({ ...next, warning: this.usage.warning });
      } catch (error) {
        log.warn("Asking Claude Code for usage failed", error);
        // Keep the last numbers; say they couldn't be refreshed.
        this.set({
          ...this.usage,
          state: this.usage.windows.length ? this.usage.state : "error",
          message: `Couldn't ask Claude Code: ${(error as Error).message}`,
        });
      } finally {
        this.inflight = undefined;
      }
      return this.usage;
    })();
    return this.inflight;
  }

  /** Refreshes when the numbers are older than `maxAgeMs`. */
  refreshIfOlder(maxAgeMs: number): void {
    if (this.ageMs() > maxAgeMs) void this.refresh();
  }

  /** Claude Code reported a rate limit during a chat. */
  rateLimit(event: Extract<EngineEvent, { type: "rate_limit" }>): void {
    const warning =
      event.status === "allowed"
        ? undefined
        : { window: event.window ?? "", status: event.status, resetsAt: event.resetsAt };
    if (JSON.stringify(warning) !== JSON.stringify(this.usage.warning)) this.set({ ...this.usage, warning });
    clearTimeout(this.soon);
    this.soon = setTimeout(() => void this.refresh(), 5_000);
  }

  start(): void {
    this.soon = setTimeout(() => void this.refresh(), 3_000);
    this.timer = setInterval(() => void this.refresh(), this.options.intervalMs ?? 5 * 60_000);
  }

  stop(): void {
    clearInterval(this.timer);
    clearTimeout(this.soon);
  }

  private set(usage: PlanUsage) {
    this.usage = usage;
    this.options.onChange(usage);
  }
}
