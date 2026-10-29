import { describe, expect, it } from "vitest";
import { latestRuns, pipelineUrl, runState, runUrl, toPipeline, toRun } from "./runs";

const azRun = (id: number, def: number, extra: Record<string, unknown> = {}) => ({
  id,
  buildNumber: `2026.${id}`,
  status: "completed",
  result: "succeeded",
  sourceBranch: "refs/heads/main",
  startTime: "2026-10-27T10:00:00Z",
  finishTime: "2026-10-27T10:05:00Z",
  requestedFor: { displayName: "Jon" },
  definition: { id: def, name: `Pipeline ${def}` },
  ...extra,
});

describe("az pipelines data", () => {
  it("normalises runs and pipelines", () => {
    expect(toRun(azRun(5, 1))).toEqual({
      id: 5,
      buildNumber: "2026.5",
      status: "completed",
      result: "succeeded",
      branch: "main",
      startTime: "2026-10-27T10:00:00Z",
      finishTime: "2026-10-27T10:05:00Z",
      queueTime: undefined,
      requestedBy: "Jon",
      definitionId: 1,
      definitionName: "Pipeline 1",
    });
    expect(toPipeline({ id: 3, name: "CI", path: "\\" })).toEqual({ id: 3, name: "CI", folder: "" });
    expect(toPipeline({ id: 4, name: "Deploy", path: "\\Releases" }).folder).toBe("\\Releases");
  });

  it("keeps the latest run per pipeline", () => {
    const latest = latestRuns([azRun(9, 1), azRun(7, 2), azRun(3, 1)].map(toRun));
    expect(latest.get(1)?.id).toBe(9);
    expect(latest.get(2)?.id).toBe(7);
  });

  it("describes run states", () => {
    expect(runState(toRun(azRun(1, 1, { status: "inProgress", result: null })))).toBe("running");
    expect(runState(toRun(azRun(1, 1, { status: "notStarted", result: null })))).toBe("queued");
    expect(runState(toRun(azRun(1, 1, { result: "failed" })))).toBe("failed");
    expect(runState(toRun(azRun(1, 1, { result: "partiallySucceeded" })))).toBe("partial");
    expect(runState(undefined)).toBe("none");
  });

  it("builds organisation and web URLs", () => {
    expect(runUrl("contoso", "My Project", 42)).toBe(
      "https://dev.azure.com/contoso/My%20Project/_build/results?buildId=42",
    );
    expect(pipelineUrl("https://contoso.visualstudio.com", "P", 7)).toBe(
      "https://dev.azure.com/contoso/P/_build?definitionId=7",
    );
  });
});
