import { describe, expect, it } from "vitest";
import { describeSchedule, parseRoutines, parseRunLog, parseRuns, remoteTriggerBody } from "./routines";

describe("parseRoutines", () => {
  it("reads routines from a list answer, tolerating shapes", () => {
    const body = {
      data: [
        {
          id: "trig_1",
          name: "Morning",
          cron_expression: "0 8 * * 1-5",
          enabled: true,
          next_run_at: "2026-10-29T08:00:00Z",
          job_config: {
            ccr: { events: [{ data: { message: { content: [{ type: "text", text: "Review PRs" }] } } }] },
          },
          last_run: { status: "SUCCEEDED", fired_at: "2026-10-28T08:00:00Z", session_id: "session_1" },
        },
        { trigger_id: "trig_2", prompt: "Hi", enabled: false },
        { nothing: true },
      ],
    };
    const [a, b] = parseRoutines(body);
    expect(parseRoutines(body)).toHaveLength(2);
    expect(a).toMatchObject({
      id: "trig_1",
      name: "Morning",
      prompt: "Review PRs",
      lastRun: { status: "SUCCEEDED", sessionId: "session_1" },
    });
    expect(b).toMatchObject({ id: "trig_2", name: "trig_2", enabled: false, prompt: "Hi" });
    expect(parseRoutines([{ id: "x" }])[0]?.enabled).toBe(true);
  });
});

describe("parseRuns and parseRunLog", () => {
  it("reads runs and a run's messages", () => {
    expect(parseRuns({ data: [{ session_id: "s1", status: "FAILED", fired_at: "t" }, {}] })).toEqual([
      { sessionId: "s1", status: "FAILED", firedAt: "t", finishedAt: undefined },
    ]);
    expect(
      parseRunLog({
        events: [
          { type: "user", text: "go" },
          { message: { role: "assistant", content: [{ type: "text", text: "done" }] } },
          { x: 1 },
        ],
      }),
    ).toEqual([
      { role: "user", text: "go" },
      { role: "assistant", text: "done" },
    ]);
  });
});

describe("describeSchedule", () => {
  it("says common schedules in words", () => {
    expect(describeSchedule("37 8 * * 1-5")).toBe("Weekdays at 08:37 (UTC)");
    expect(describeSchedule("CRON_TZ=Europe/Stockholm 0 9 * * *")).toBe(
      "Every day at 09:00 (Europe/Stockholm)",
    );
    expect(describeSchedule("0 6 * * 1")).toBe("Every Monday at 06:00 (UTC)");
    expect(describeSchedule("0 6 * * 1,3")).toBe("Every Monday and Wednesday at 06:00 (UTC)");
    expect(describeSchedule("15 * * * *")).toBe("Every hour at :15");
    expect(describeSchedule("0 */4 * * *")).toBe("Every 4 hours at :00");
    expect(describeSchedule("*/30 * * * *")).toBe("Every 30 minutes");
    expect(describeSchedule("0 7 1 * *")).toBe("On day 1 of every month at 07:00 (UTC)");
    expect(describeSchedule("0 7 1 1 *")).toBe("0 7 1 1 *");
    expect(describeSchedule("nonsense")).toBe("nonsense");
  });
});

describe("remoteTriggerBody", () => {
  it("parses the JSON and turns errors into messages", () => {
    expect(remoteTriggerBody({ status: 200, json: '{"data":[]}' }, "")).toEqual({ data: [] });
    expect(remoteTriggerBody(undefined, '{"ok":1}')).toEqual({ ok: 1 });
    expect(() =>
      remoteTriggerBody({ status: 403, json: '{"error":{"message":"Routines are off"}}' }, ""),
    ).toThrow("The routines service said: Routines are off (403)");
    expect(() => remoteTriggerBody(undefined, "not json")).toThrow("not json");
  });
});
