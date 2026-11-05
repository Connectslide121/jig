import type { EngineEvent } from "../../shared/engine";
import { EMPTY_USAGE, type PlanUsage } from "../../shared/usage";
import { logger } from "../log";

const log = logger("usage");

export interface UsageServiceOptions {
  /** Asks the provider's program (Claude Code's `/usage`, Codex's rate limits) and maps the answer. */
  read: () => Promise<PlanUsage>;
  /** Who is asked, for messages: "Claude Code", "Codex". */
  source?: string;
  onChange: (usage: PlanUsage) => void;
  /** Background refresh interval (default 5 min). */
  intervalMs?: number;
  now?: () => Date;
}

/**
 * Keeps one plan's usage current (one service per provider, D-298): asks every few minutes, after use
 * (chats for Claude, each ChatGPT call; at most once a minute) and soon after a rate-limit warning.
 * One question at a time.
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

  private source() {
    return this.options.source ?? "Claude Code";
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
        const next = await this.options.read();
        // Claude's warnings come from chats (rateLimit), not from the read: keep them unless the read
        // reports its own (Codex's answer always says, even "none").
        this.set({ ...next, warning: "warning" in next ? next.warning : this.usage.warning });
      } catch (error) {
        log.warn(`Asking ${this.source()} for usage failed`, error);
        // Keep the last numbers; say they couldn't be refreshed.
        this.set({
          ...this.usage,
          state: this.usage.windows.length ? this.usage.state : "error",
          message: `Couldn't ask ${this.source()}: ${(error as Error).message}`,
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

  /** The numbers, asked again first when older than `maxAgeMs` (or while a question is out). */
  async fresh(maxAgeMs: number): Promise<PlanUsage> {
    return this.inflight || this.ageMs() > maxAgeMs ? this.refresh() : this.usage;
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

  start(firstAfterMs = 3_000): void {
    this.soon = setTimeout(() => void this.refresh(), firstAfterMs);
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
