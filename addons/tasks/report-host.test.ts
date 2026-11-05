import type { AddonHostApi } from "@jig/sdk";
import { expect, it, vi } from "vitest";
import { forgetRun, report, reportQueued, reports, saveReport } from "./host";
import type { RunReport } from "./lib/report";
import type { Run } from "./lib/tasks";

it("keeps a finished run's report with the run, marks queued proposals and forgets it with the run", async () => {
  const runs: Run[] = [
    { id: "r1", startedAt: "2026-11-05T10:00:00Z", finishedAt: "2026-11-05T11:00:00Z", tasks: [] },
    { id: "r2", startedAt: "2026-11-05T12:00:00Z", tasks: [] },
  ];
  const data = new Map<string, unknown>([["history@shop", runs]]);
  const at = (key: string, opts?: { id?: string }) => `${key}@${opts?.id ?? ""}`;
  const api = {
    storage: {
      get: async (key: string, opts?: { id?: string }) => data.get(at(key, opts)),
      set: async (key: string, value: unknown, opts?: { id?: string }) => {
        data.set(at(key, opts), value);
      },
    },
    projects: async () => [{ id: "shop" }],
    emit: vi.fn(),
    attachments: { remove: vi.fn() },
  } as unknown as AddonHostApi;
  const made: RunReport = {
    runId: "r1",
    madeAt: "2026-11-05T13:00:00Z",
    provider: "chatgpt",
    model: "sol",
    overview: "Fine.",
    tasks: [],
    aware: [],
    stuck: [],
    needsYou: [],
    proposals: [{ id: "p1", kind: "fix", title: "Fix", why: "", prompt: "Fix it", sources: [] }],
  };
  await saveReport({ projectId: "shop", report: made }, api);
  expect(await reports({ projectId: "shop" }, api)).toEqual({ r1: made.madeAt });
  expect(await report({ projectId: "shop", runId: "r1" }, api)).toEqual(made);
  expect(api.emit).toHaveBeenCalledWith("changed", { projectId: "shop" });
  // A run still going has none.
  await expect(saveReport({ projectId: "shop", report: { ...made, runId: "r2" } }, api)).rejects.toThrow(
    "still going",
  );
  const marked = await reportQueued({ projectId: "shop", runId: "r1", ids: ["p1"] }, api);
  expect(marked?.proposals[0]?.queuedAt).toBeTruthy();
  await forgetRun({ projectId: "shop", runId: "r1" }, api);
  expect(await report({ projectId: "shop", runId: "r1" }, api)).toBeNull();
});
