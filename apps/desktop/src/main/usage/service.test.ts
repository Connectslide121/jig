import { describe, expect, it, vi } from "vitest";
import type { RawUsage } from "../../shared/usage";
import { UsageService } from "./service";

const raw = (five: number): RawUsage => ({
  subscription_type: "pro",
  rate_limits_available: true,
  rate_limits: { five_hour: { utilization: five, resets_at: "2026-10-28T12:00:00Z" } },
});

describe("UsageService", () => {
  it("asks once at a time, keeps the last numbers on failure, and tracks warnings", async () => {
    let calls = 0;
    let fail = false;
    const changes: number[] = [];
    let now = new Date("2026-10-28T10:00:00Z");
    const service = new UsageService({
      fetch: async () => {
        calls++;
        if (fail) throw new Error("offline");
        return raw(10 * calls);
      },
      onChange: (u) => changes.push(u.windows[0]?.percent ?? -1),
      now: () => now,
    });
    const [a, b] = await Promise.all([service.refresh(), service.refresh()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(a.windows[0]).toMatchObject({ id: "five_hour", percent: 10 });

    service.refreshIfOlder(60_000);
    expect(calls).toBe(1);
    now = new Date("2026-10-28T10:02:00Z");
    service.refreshIfOlder(60_000);
    await service.refresh();
    expect(calls).toBe(2);

    fail = true;
    const failed = await service.refresh();
    expect(failed.state).toBe("ok");
    expect(failed.windows[0]?.percent).toBe(20);
    expect(failed.message).toContain("offline");

    vi.useFakeTimers();
    service.rateLimit({ type: "rate_limit", status: "allowed_warning", window: "five_hour" });
    expect(service.current().warning).toEqual({
      window: "five_hour",
      status: "allowed_warning",
      resetsAt: undefined,
    });
    fail = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toBe(4);
    expect(service.current().warning?.status).toBe("allowed_warning");
    service.rateLimit({ type: "rate_limit", status: "allowed" });
    expect(service.current().warning).toBeUndefined();
    service.stop();
    vi.useRealTimers();
    expect(changes.length).toBeGreaterThan(3);
  });

  it("reports an error state when the first question fails", async () => {
    const service = new UsageService({
      fetch: async () => Promise.reject(new Error("no claude")),
      onChange: () => {},
    });
    expect((await service.refresh()).state).toBe("error");
  });
});
