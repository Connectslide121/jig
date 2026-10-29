import { describe, expect, it } from "vitest";
import { formatResetIn, formatUsageAmount, planUsageFrom, usageTone } from "./usage";

const now = new Date("2026-10-28T10:00:00Z");

describe("planUsageFrom", () => {
  it("maps the session and weekly windows, model windows and extra usage", () => {
    const usage = planUsageFrom(
      {
        subscription_type: "max",
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 42.4, resets_at: "2026-10-28T12:13:00Z" },
          seven_day: { utilization: 118, resets_at: "2026-11-02T09:00:00Z" },
          seven_day_opus: null,
          seven_day_sonnet: { utilization: null, resets_at: null },
          model_scoped: [{ display_name: "Fable", utilization: 7, resets_at: "2026-11-02T09:00:00Z" }],
          extra_usage: {
            is_enabled: true,
            monthly_limit: 50,
            used_credits: 12.5,
            utilization: 25,
            currency: "USD",
          },
        },
      },
      now,
    );
    expect(usage).toEqual({
      state: "ok",
      subscription: "max",
      windows: [
        { id: "five_hour", label: "Current session (5 h)", percent: 42.4, resetsAt: "2026-10-28T12:13:00Z" },
        { id: "seven_day", label: "This week (all models)", percent: 100, resetsAt: "2026-11-02T09:00:00Z" },
        { id: "model:Fable", label: "This week (Fable)", percent: 7, resetsAt: "2026-11-02T09:00:00Z" },
      ],
      extra: { enabled: true, percent: 25, usedCredits: 12.5, monthlyLimit: 50, currency: "USD" },
      updatedAt: now.toISOString(),
    });
  });

  it("says when plan limits don't apply", () => {
    expect(
      planUsageFrom({ subscription_type: null, rate_limits_available: false, rate_limits: null }, now),
    ).toMatchObject({
      state: "unavailable",
      windows: [],
    });
    expect(planUsageFrom(undefined, now).state).toBe("unavailable");
  });
});

describe("formatResetIn and usageTone", () => {
  it("formats time until reset", () => {
    expect(formatResetIn("2026-10-28T12:13:00Z", now)).toBe("in 2 h 13 min");
    expect(formatResetIn("2026-10-28T10:45:00Z", now)).toBe("in 45 min");
    expect(formatResetIn("2026-10-28T12:00:00Z", now)).toBe("in 2 h");
    expect(formatResetIn("2026-11-02T09:00:00Z", now)).toBe("in 5 days");
    expect(formatResetIn("2026-10-28T09:00:00Z", now)).toBe("now");
    expect(formatResetIn(undefined, now)).toBe("");
  });

  it("rates percentages", () => {
    expect([usageTone(10), usageTone(75), usageTone(92), usageTone(null)]).toEqual([
      "ok",
      "warning",
      "danger",
      "ok",
    ]);
  });
});

describe("formatUsageAmount", () => {
  it("converts minor units using the currency's decimal places", () => {
    expect(formatUsageAmount(4000, "EUR")).toBe("€40.00");
    expect(formatUsageAmount(4003, "EUR")).toBe("€40.03");
    expect(formatUsageAmount(1250, "USD")).toBe("US$12.50");
    expect(formatUsageAmount(4000, "JPY")).toContain("4,000");
    expect(formatUsageAmount(1234, "KWD")).toContain("1.234");
    expect(formatUsageAmount(4000, "invalid")).toBe("40.00 invalid");
  });
});
