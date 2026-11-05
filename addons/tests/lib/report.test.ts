import { describe, expect, it } from "vitest";
import { doneReport, duration, runningReport, tail, waitSeconds, within } from "./report";

const run = {
  id: "abc-12",
  label: "e2e:changed",
  status: "running" as const,
  startedAt: "2026-11-05T10:00:00.000Z",
  passed: 0,
  failed: 0,
  skipped: 0,
  failures: [] as string[],
  parsed: false,
};

describe("waiting for a run", () => {
  it("waits 90 s unless told, never over 100 s (the host gives a call 120 s) nor below 0", () => {
    expect(waitSeconds(undefined)).toBe(90);
    expect(waitSeconds("30")).toBe(90);
    expect(waitSeconds(Number.NaN)).toBe(90);
    expect(waitSeconds(30)).toBe(30);
    expect(waitSeconds(500)).toBe(100);
    expect(waitSeconds(-5)).toBe(0);
    expect(waitSeconds(2.6)).toBe(3);
  });

  it("gives the value when it comes in time, else undefined", async () => {
    expect(await within(Promise.resolve("done"), 50)).toBe("done");
    expect(await within(new Promise(() => {}), 10)).toBeUndefined();
  });
});

describe("what the tools answer", () => {
  it("formats durations", () => {
    expect(duration(4_400)).toBe("4 s");
    expect(duration(185_000)).toBe("3 min 05 s");
    expect(duration(-10)).toBe("0 s");
  });

  it("keeps the output's last lines as plain text", () => {
    expect(tail("a\nb\n\u001b[32mc\u001b[0m\n\n", 2)).toBe("b\nc");
  });

  it("says a run still going, with its id and what to call next", () => {
    const text = runningReport(
      run,
      "Running 40 tests using 4 workers\n",
      Date.parse(run.startedAt) + 130_000,
    );
    expect(text).toContain("e2e:changed: still running (run abc-12, 2 min 10 s so far).");
    expect(text).toContain('Call addon_tests_wait with id "abc-12"');
    expect(text).toContain("Output so far (last lines):\nRunning 40 tests using 4 workers");
    expect(runningReport(run, "", Date.parse(run.startedAt))).not.toContain("Output so far");
  });

  it("reports a finished run: status, counts, failing tests, output", () => {
    const text = doneReport(
      {
        ...run,
        status: "failed",
        endedAt: "2026-11-05T10:04:30.000Z",
        exitCode: 1,
        passed: 39,
        failed: 1,
        parsed: true,
        failures: ["e2e/cart.spec.ts › adds to the cart"],
      },
      "  1 failed\n  39 passed (4.5m)\n",
    );
    expect(text.split("\n")).toEqual([
      "e2e:changed: failed (exit 1, 4 min 30 s, run abc-12)",
      "39 passed, 1 failed, 0 skipped",
      "Failing:",
      "- e2e/cart.spec.ts › adds to the cart",
      "Output (last lines):",
      "  1 failed",
      "  39 passed (4.5m)",
    ]);
  });
});
