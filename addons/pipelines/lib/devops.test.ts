import { describe, expect, it } from "vitest";
import {
  branchList,
  changedParams,
  fromBuild,
  isRetired,
  mergeValues,
  newestPerPipeline,
  parseParameters,
  parseRemote,
  runAge,
  runKind,
  runLabel,
  runParameters,
  stageLine,
  stagesOf,
  toRun,
} from "./devops";

const YAML = [
  "trigger:",
  "  batch: true",
  "",
  "parameters:",
  "  - name: deployTo",
  "    displayName: Deploy to (manual runs only)",
  "    type: string",
  "    default: none",
  "    values: [none, staging, production]",
  "  - name: deployParts",
  "    displayName: 'What to build and deploy'",
  "    type: string",
  "    default: both",
  "    values:",
  "      - both",
  "      - api",
  "      - client",
  "  - name: runTests",
  "    displayName: Run tests",
  "    type: boolean",
  "    default: true",
  "",
  "variables:",
  "  x: 1",
].join("\n");

describe("pipelines from your repositories", () => {
  it("reads Azure DevOps remotes, the YAML's parameters and retired pipelines", () => {
    expect(parseRemote("https://contoso.visualstudio.com/Shop%20Web/_git/ShopWeb\n")).toEqual({
      org: "contoso",
      project: "Shop Web",
      repo: "ShopWeb",
    });
    expect(parseRemote("https://ann@dev.azure.com/Fabrikam/Shop/_git/shop")).toEqual({
      org: "Fabrikam",
      project: "Shop",
      repo: "shop",
    });
    expect(parseRemote("git@ssh.dev.azure.com:v3/contoso/Api/Api")).toEqual({
      org: "contoso",
      project: "Api",
      repo: "Api",
    });
    expect(parseRemote("https://github.com/ann/site.git")).toBeNull();
    expect(parseParameters(YAML)).toEqual([
      {
        name: "deployTo",
        label: "Deploy to (manual runs only)",
        type: "string",
        defaultValue: "none",
        values: ["none", "staging", "production"],
      },
      {
        name: "deployParts",
        label: "What to build and deploy",
        type: "string",
        defaultValue: "both",
        values: ["both", "api", "client"],
      },
      {
        name: "runTests",
        label: "Run tests",
        type: "boolean",
        defaultValue: "true",
        values: ["true", "false"],
      },
    ]);
    expect(parseParameters("trigger: none\n")).toEqual([]);
    expect(isRetired("(old) Shop-API", "enabled")).toBe(true);
    expect(isRetired("shop", "disabled")).toBe(true);
    expect(isRetired("shop", "enabled")).toBe(false);
  });

  it("labels runs, shows their stages and says what a run changed from the defaults", () => {
    const now = Date.parse("2026-10-16T21:00:00Z");
    const run = toRun({
      id: 1,
      number: "20261016.5",
      status: "completed",
      result: "succeeded",
      branch: "refs/heads/develop",
      reason: "batchedCI",
      queued: new Date(now - 40 * 60_000).toISOString(),
      started: new Date(now - 35 * 60_000).toISOString(),
      finished: new Date(now - 12 * 60_000).toISOString(),
      by: "Ann Demo",
      params: { deployTo: "none", deployParts: "both", runTests: "True" },
    })!;
    expect(run.branch).toBe("develop");
    expect(runLabel(run, now)).toBe("✓ 12m");
    expect(runLabel({ ...run, status: "inProgress", result: "" }, now)).toBe("▶ Running 35m");
    expect(runLabel({ ...run, status: "notStarted", result: "", started: 0 }, now)).toBe("◷ Queued 40m");
    expect(runLabel(null, now)).toBe("never run");
    expect(runAge(run, now)).toBe("12m");
    expect(runAge({ ...run, status: "inProgress", result: "" }, now)).toBe("35m");
    expect(runAge({ ...run, status: "notStarted", result: "", started: 0 }, now)).toBe("40m");
    expect(runAge(null, now)).toBe("");
    expect(runLabel({ ...run, result: "canceled" }, now)).toBe("Cancelled 12m");
    expect(runKind({ ...run, result: "failed" })).toBe("failed");
    expect(runKind({ ...run, status: "notStarted", result: "" })).toBe("other");
    const stages = [
      { name: "Build", state: "completed", result: "succeeded" },
      { name: "Deploy to staging", state: "inProgress", result: "" },
      { name: "Deploy to none", state: "completed", result: "skipped" },
      { name: "Smoke test", state: "pending", result: "" },
    ];
    expect(stageLine({ ...run, stages })).toBe("Build ✓ → Deploy to staging ▶ → Smoke test ○");
    const pipeline = { params: parseParameters(YAML) };
    expect(changedParams(pipeline, run.params)).toBe("");
    expect(changedParams(pipeline, { ...run.params, deployTo: "production", runTests: "false" })).toBe(
      "Deploy to: production · Run tests: false",
    );
    expect(toRun(null)).toBeNull();
  });

  it("builds a run's parameters and the branches to pick from", () => {
    expect(runParameters(parseParameters(YAML), { deployTo: "staging" })).toEqual([
      "deployTo=staging",
      "deployParts=both",
      "runTests=true",
    ]);
    expect(
      branchList(
        "refs/heads/develop\nrefs/heads/main\nrefs/remotes/origin/HEAD\nrefs/remotes/origin/feature/x\n",
        "main",
      ),
    ).toEqual(["main", "develop", "feature/x"]);
  });
});

describe("runs as az answers them", () => {
  it("reads builds, timelines and the newest run per pipeline", () => {
    const run = fromBuild({
      id: 7,
      buildNumber: "20261016.7",
      status: "inProgress",
      result: null,
      sourceBranch: "refs/heads/main",
      reason: "manual",
      queueTime: "2026-10-16T20:00:00Z",
      requestedFor: { displayName: "Ann Demo" },
      templateParameters: { deployTo: "staging", runTests: true },
    })!;
    expect(run).toMatchObject({ id: 7, number: "20261016.7", branch: "main", result: "", by: "Ann Demo" });
    expect(run.params).toEqual({ deployTo: "staging", runTests: "true" });
    expect(
      stagesOf({
        records: [
          { type: "Job", name: "x", order: 1 },
          { type: "Stage", name: "Deploy", order: 2, state: "pending", result: null },
          { type: "Stage", name: "Build", order: 1, state: "completed", result: "succeeded" },
        ],
      }),
    ).toEqual([
      { name: "Build", state: "completed", result: "succeeded" },
      { name: "Deploy", state: "pending", result: "" },
    ]);
    const newest = newestPerPipeline([
      { ...run, pipelineId: 1 },
      { ...run, id: 9, pipelineId: 1 },
      { ...run, id: 3, pipelineId: 2 },
    ]);
    expect([newest.get(1)?.id, newest.get(2)?.id]).toEqual([9, 3]);
  });
});

describe("a pipeline's form read from any YAML", () => {
  const YAML_2 = [
    "parameters:",
    "  - name: mode",
    "    displayName: Build",
    "    type: string",
    "    default: Build the branch",
    "    values: ['Build the branch', 'Use the latest build']",
    "  - name: number",
    "    type: string",
    "    default: ' '",
    "  - name: stage",
    "    type: boolean",
    "    default: false",
    "  - name: targets",
    "    type: object",
    "    default:",
    "      - { id: a, flag: stage }",
    "variables:",
    "  - name: x",
  ].join("\n");

  it("offers values and booleans, leaves objects at their defaults and blanks to the YAML", () => {
    const params = parseParameters(YAML_2);
    expect(params.map((p) => p.name)).toEqual(["mode", "number", "stage"]);
    expect(runParameters(params, { stage: "true" })).toEqual(["mode=Build the branch", "stage=true"]);
  });

  it("keeps what was picked when another branch's YAML still allows it", () => {
    const params = parseParameters(YAML_2);
    expect(mergeValues(params, { mode: "Use the latest build", stage: "true", gone: "x" })).toEqual({
      mode: "Use the latest build",
      number: " ",
      stage: "true",
    });
    expect(mergeValues(params, { mode: "not a choice" }).mode).toBe("Build the branch");
  });
});
