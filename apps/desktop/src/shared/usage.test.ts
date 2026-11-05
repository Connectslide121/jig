import { describe, expect, it } from "vitest";
import {
  codexUsageFrom,
  EMPTY_USAGE,
  formatResetIn,
  formatResetShort,
  formatUsageAmount,
  planHasRoom,
  planName,
  planResetsAt,
  planUsageFrom,
  usageReport,
  usageTone,
  windowShort,
} from "./usage";

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
        {
          id: "five_hour",
          label: "Current session (5 h)",
          percent: 42.4,
          resetsAt: "2026-10-28T12:13:00Z",
          minutes: 300,
        },
        {
          id: "seven_day",
          label: "This week (all models)",
          percent: 100,
          resetsAt: "2026-11-02T09:00:00Z",
          minutes: 10080,
        },
        {
          id: "model:Fable",
          label: "This week (Fable)",
          percent: 7,
          resetsAt: "2026-11-02T09:00:00Z",
          minutes: 10080,
        },
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
    expect(formatResetShort("2026-10-28T12:13:00Z", now)).toBe("2h 13m");
    expect(formatResetShort("2026-10-28T10:45:00Z", now)).toBe("45m");
    expect(formatResetShort("2026-11-03T10:00:00Z", now)).toBe("6d");
    expect(formatResetShort("2026-11-02T08:00:00Z", now)).toBe("4d 22h");
    expect(formatResetShort(undefined, now)).toBe("");
    expect(formatResetIn("2026-10-28T10:45:00Z", now)).toBe("in 45 min");
    expect(formatResetIn("2026-10-28T12:00:00Z", now)).toBe("in 2 h");
    expect(formatResetIn("2026-11-02T09:00:00Z", now)).toBe("in 5 days");
    expect(formatResetIn("2026-10-28T09:00:00Z", now)).toBe("now");
    expect(formatResetIn(undefined, now)).toBe("");
  });

  it("rates percentages", () => {
    expect([usageTone(26), usageTone(69), usageTone(85), usageTone(null)]).toEqual([
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

describe("codexUsageFrom", () => {
  it("maps Codex's primary and secondary windows onto Jig's usage shape", () => {
    // As `codex app-server` answers account/rateLimits/read (Codex 0.166).
    const u = codexUsageFrom(
      {
        planType: "plus",
        primary: { usedPercent: 13, windowDurationMins: 300, resetsAt: 1793756480 },
        secondary: { usedPercent: 92, windowDurationMins: 10080, resetsAt: 1794089243 },
        rateLimitReachedType: null,
      },
      now,
    );
    expect(u).toEqual({
      state: "ok",
      subscription: "plus",
      windows: [
        {
          id: "primary",
          label: "Current session (5 h)",
          percent: 13,
          resetsAt: new Date(1793756480 * 1000).toISOString(),
          minutes: 300,
        },
        {
          id: "secondary",
          label: "This week",
          percent: 92,
          resetsAt: new Date(1794089243 * 1000).toISOString(),
          minutes: 10080,
        },
      ],
      warning: undefined,
      updatedAt: now.toISOString(),
      message: undefined,
    });
    // The same helpers as Claude's windows.
    expect(usageTone(u.windows[1]?.percent)).toBe("danger");
    expect(windowShort(u.windows[0])).toBe("5h");
    expect(windowShort(u.windows[1])).toBe("wk");
  });

  it("clamps percentages, skips empty windows and names other lengths", () => {
    const u = codexUsageFrom(
      {
        primary: { usedPercent: 140, windowDurationMins: 180, resetsAt: null },
        secondary: null,
        planType: "unknown",
      },
      now,
    );
    expect(u.windows).toEqual([
      { id: "primary", label: "3-hour window", percent: 100, resetsAt: undefined, minutes: 180 },
    ]);
    expect(u.subscription).toBeUndefined();
    expect(windowShort(u.windows[0])).toBe("3h");
  });

  it("warns when a limit is reached, and says so when Codex isn't signed in or reports nothing", () => {
    const reached = codexUsageFrom(
      {
        primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: null },
        rateLimitReachedType: "rate_limit_reached",
      },
      now,
    );
    expect(reached.warning).toEqual({ window: "rate_limit_reached", status: "rejected" });
    expect(codexUsageFrom(undefined, now)).toMatchObject({ state: "unavailable", windows: [] });
    expect(codexUsageFrom({ primary: null, secondary: null }, now).state).toBe("unavailable");
  });
});

describe("planName and windowShort", () => {
  it("names plans for their badge", () => {
    expect(planName("max")).toBe("Max");
    expect(planName("plus")).toBe("Plus");
    expect(planName("promax")).toBe("Pro Max");
    expect(planName("self_serve_business_usage_based")).toBe("Self Serve Business Usage Based");
    expect(planName(undefined)).toBeUndefined();
  });

  it("gives Claude's windows the same short names", () => {
    const u = planUsageFrom(
      {
        subscription_type: "max",
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 1, resets_at: null },
          seven_day: { utilization: 2, resets_at: null },
        },
      },
      now,
    );
    expect(u.windows.map((w) => windowShort(w))).toEqual(["5h", "wk"]);
    expect(windowShort(undefined, "5h")).toBe("5h");
    expect(windowShort({ id: "x", label: "x", percent: 1, minutes: 1440 })).toBe("day");
  });
});

describe("planHasRoom and planResetsAt (D-338)", () => {
  const ok = (percent: number, resetsAt = "2026-11-04T14:00:00.000Z") => ({
    state: "ok" as const,
    windows: [{ id: "five_hour", label: "5 h", percent, resetsAt }],
  });
  it("has room when known, signed in and not used up", () => {
    expect(planHasRoom(ok(40), "ChatGPT")).toEqual({ ok: true });
    expect(planHasRoom(ok(100), "ChatGPT")).toEqual({ ok: false, reason: "ChatGPT's limit is reached too" });
    expect(planHasRoom({ ...ok(10), warning: { window: "x", status: "rejected" } }, "Claude").ok).toBe(false);
    expect(planHasRoom({ state: "unavailable", windows: [] }, "ChatGPT").reason).toBe(
      "ChatGPT isn't signed in with a plan",
    );
    expect(planHasRoom(undefined, "Claude").ok).toBe(false);
  });
  it("resets when its latest full window does", () => {
    expect(planResetsAt(ok(100))).toBe("2026-11-04T14:00:00.000Z");
    expect(planResetsAt(ok(50))).toBeUndefined();
    expect(
      planResetsAt({
        state: "ok",
        windows: [],
        warning: { window: "w", status: "rejected", resetsAt: "2026-11-05T00:00:00Z" },
      }),
    ).toBe("2026-11-05T00:00:00Z");
  });
});

describe("usageReport", () => {
  it("tells each window's use, what is left and its reset, for both providers", () => {
    const claude = planUsageFrom(
      {
        subscription_type: "max",
        rate_limits: {
          five_hour: { utilization: 42, resets_at: "2026-10-28T12:00:00Z" },
          seven_day: { utilization: null, resets_at: null },
        },
      },
      now,
    );
    const chatgpt = codexUsageFrom(
      { planType: "plus", primary: { usedPercent: 27, windowDurationMins: 300, resetsAt: null } },
      now,
    );
    const text = usageReport({ claude, chatgpt }, now);
    expect(text).toContain("Claude (Max plan):");
    expect(text).toContain(
      "- Current session (5 h): 42 % used, 58 % left, resets in 2 h (2026-10-28T12:00:00.000Z)",
    );
    expect(text).not.toContain("This week (all models)");
    expect(text).toContain("ChatGPT (Plus plan):");
    expect(text).toContain("- Current session (5 h): 27 % used, 73 % left, reset time not reported");
  });

  it("says plainly when a provider has no limit data", () => {
    const text = usageReport(
      { claude: planUsageFrom({ rate_limits_available: false }, now), chatgpt: EMPTY_USAGE },
      now,
    );
    expect(text).toContain("Claude: no limit data. Plan limits apply to a Claude subscription.");
    expect(text).toContain("ChatGPT: Jig hasn't heard from ChatGPT about its limits yet.");
  });

  it("keeps the last numbers when asking failed, and tells a reached limit", () => {
    const claude = {
      ...planUsageFrom({ rate_limits: { five_hour: { utilization: 100, resets_at: null } } }, now),
      state: "error" as const,
      message: "Couldn't ask Claude Code: timed out",
      warning: { window: "five_hour", status: "rejected" as const, resetsAt: "2026-10-28T10:30:00Z" },
    };
    const text = usageReport({ claude, chatgpt: EMPTY_USAGE }, now);
    expect(text).toContain("100 % used, 0 % left");
    expect(text).toContain("- Limit reached (five_hour), resets in 30 min");
    expect(text).toContain("last known numbers: Couldn't ask Claude Code: timed out");
  });
});
