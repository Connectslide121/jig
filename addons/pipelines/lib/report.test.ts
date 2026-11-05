import { describe, expect, it } from "vitest";
import type { PipelineRun } from "./devops";
import {
  detailText,
  fromRun,
  latestText,
  logTail,
  matchesFilter,
  matchesName,
  matchesPipeline,
  parseRunUrl,
  runDetail,
  runText,
  runWord,
} from "./report";

const now = Date.parse("2026-11-05T12:00:00Z");
const run = (over: Partial<PipelineRun> = {}): PipelineRun => ({
  id: 412,
  number: "20261105.3",
  status: "completed",
  result: "succeeded",
  branch: "main",
  reason: "individualCI",
  queued: now - 20 * 60_000,
  started: now - 19 * 60_000,
  finished: now - 12 * 60_000,
  by: "Ana",
  params: {},
  ...over,
});

describe("runWord and matchesFilter", () => {
  it("names each state", () => {
    expect(runWord(run({ status: "notStarted", result: "" }))).toBe("queued");
    expect(runWord(run({ status: "inProgress", result: "" }))).toBe("running");
    expect(runWord(run({ result: "partiallySucceeded" }))).toBe("partially succeeded");
    expect(runWord(run({ result: "canceled" }))).toBe("cancelled");
  });

  it("keeps queued and running ones for running, failed ones for failed", () => {
    expect(matchesFilter(run({ status: "notStarted" }), "running")).toBe(true);
    expect(matchesFilter(run(), "running")).toBe(false);
    expect(matchesFilter(run({ result: "failed" }), "failed")).toBe(true);
    expect(matchesFilter(run(), "failed")).toBe(false);
    expect(matchesFilter(run(), "recent")).toBe(true);
  });
});

describe("runText", () => {
  it("puts a finished run on one line", () => {
    expect(runText(run(), now)).toBe("#412 · 20261105.3 · succeeded 12m ago (took 7m 0s) · main · CI · Ana");
  });

  it("says how long a running run has run, with its stages", () => {
    const going = run({
      status: "inProgress",
      result: "",
      finished: 0,
      stages: [
        { name: "Build", state: "completed", result: "succeeded" },
        { name: "Deploy", state: "inProgress", result: "" },
      ],
    });
    expect(runText(going, now)).toBe(
      "#412 · 20261105.3 · running for 19m · main · CI · Ana · Build ✓ → Deploy ▶",
    );
  });

  it("says never run for a pipeline without runs", () => {
    expect(latestText(null)).toBe("never run");
    expect(latestText(run(), now)).toMatch(/^newest run #412/);
  });
});

describe("fromRun", () => {
  it("reads the overview's run shape", () => {
    const r = fromRun({
      id: 7,
      buildNumber: "7",
      status: "inProgress",
      result: "none",
      branch: "main",
      queueTime: "2026-11-05T11:50:00Z",
      startTime: "2026-11-05T11:51:00Z",
      requestedBy: "Ana",
      definitionId: 3,
      definitionName: "CI",
    });
    expect(r).toMatchObject({ id: 7, result: "", started: Date.parse("2026-11-05T11:51:00Z"), by: "Ana" });
    expect(runWord(r)).toBe("running");
  });
});

describe("matching", () => {
  it("finds a pipeline by key, id or part of its name", () => {
    const p = { key: "shop/Shop/12", id: 12, name: "Shop CI" };
    expect(matchesPipeline(p, "shop/shop/12")).toBe(true);
    expect(matchesPipeline(p, "12")).toBe(true);
    expect(matchesPipeline(p, "ci")).toBe(true);
    expect(matchesPipeline(p, "deploy")).toBe(false);
    expect(matchesPipeline(p)).toBe(true);
    expect(matchesName("Shop", " sh ")).toBe(true);
  });

  it("reads a run's link", () => {
    expect(
      parseRunUrl("https://dev.azure.com/contoso/Shop%20Web/_build/results?buildId=412&view=logs"),
    ).toEqual({ org: "contoso", project: "Shop Web", id: 412 });
    expect(parseRunUrl("https://contoso.visualstudio.com/Shop/_build/results?buildId=9")).toEqual({
      org: "contoso",
      project: "Shop",
      id: 9,
    });
    expect(parseRunUrl("https://example.com")).toBeNull();
  });
});

const timeline = {
  records: [
    { id: "s2", type: "Stage", name: "Deploy", state: "completed", result: "failed", order: 2 },
    { id: "s1", type: "Stage", name: "Build", state: "completed", result: "succeeded", order: 1 },
    { id: "p1", parentId: "s1", type: "Phase", name: "Build" },
    { id: "j1", parentId: "p1", type: "Job", name: "Compile", state: "completed", result: "succeeded" },
    { id: "p2", parentId: "s2", type: "Phase", name: "Deploy" },
    { id: "j2", parentId: "p2", type: "Job", name: "Release", state: "completed", result: "failed" },
    {
      id: "t1",
      parentId: "j2",
      type: "Task",
      name: "Upload",
      result: "failed",
      order: 3,
      log: { id: 17 },
      issues: [
        { type: "error", message: "Access denied" },
        { type: "warning", message: "Slow" },
      ],
    },
    {
      id: "t0",
      parentId: "j1",
      type: "Task",
      name: "npm ci",
      result: "succeeded",
      issues: [{ type: "warning" }],
    },
  ],
};

describe("runDetail", () => {
  it("nests jobs under their stage and finds the failed step with its errors and log", () => {
    const d = runDetail(timeline);
    expect(d.stages.map((s) => [s.name, s.jobs.map((j) => j.name)])).toEqual([
      ["Build", ["Compile"]],
      ["Deploy", ["Release"]],
    ]);
    expect(d.failures).toEqual([
      { stage: "Deploy", job: "Release", step: "Upload", logId: 17, errors: ["Access denied"] },
    ]);
    expect(d.warnings).toBe(2);
  });

  it("shows jobs of a pipeline without stages as one", () => {
    const d = runDetail({
      records: [{ id: "j", type: "Job", name: "Build", state: "completed", result: "succeeded" }],
    });
    expect(d.stages).toEqual([
      {
        name: "Jobs",
        state: "",
        result: "",
        jobs: [{ name: "Build", state: "completed", result: "succeeded" }],
      },
    ]);
    expect(runDetail(null)).toEqual({ stages: [], failures: [], warnings: 0 });
  });
});

describe("logTail and detailText", () => {
  it("keeps the last lines without timestamps", () => {
    const log =
      "2026-11-05T11:00:00.1234567Z one\r\n2026-11-05T11:00:01.0000000Z two\r\n2026-11-05T11:00:02.0Z three\r\n";
    expect(logTail(log, 2)).toBe("two\nthree");
  });

  it("writes the run, its stages, the failed step and the log", () => {
    const text = detailText({
      run: run({ result: "failed", params: { deployTo: "stage" } }),
      pipeline: "Shop CI",
      org: "contoso",
      project: "Shop",
      url: "https://dev.azure.com/contoso/Shop/_build/results?buildId=412",
      detail: runDetail(timeline),
      log: "Access denied",
      now,
    });
    expect(text).toContain("Shop CI (contoso/Shop) #412 · 20261105.3 · failed 12m ago");
    expect(text).toContain("Parameters: deployTo=stage");
    expect(text).toContain("- Deploy: failed\n  - Release: failed");
    expect(text).toContain("Failed step: Deploy › Release › Upload\n  error: Access denied");
    expect(text).toContain("Last lines of the failed step's log:\nAccess denied");
    expect(
      detailText({ run: run(), pipeline: "CI", org: "o", project: "p", url: "u", detail: null }),
    ).toContain("Its stages couldn't be read.");
  });
});
