import { writeFileSync } from "node:fs";
import type { AddonAzureTenant, AddonHostApi } from "@jig/sdk";
import { describe, expect, it } from "vitest";
import { type Found, pipelines, saved, toolPipelines, toolRun, toolRuns } from "./host";

const own: AddonAzureTenant = { key: "default", label: "Your az login", isDefault: true };
const contoso: AddonAzureTenant = { key: "contoso", label: "Contoso", isDefault: false };

/**
 * A host API with two checkouts in your own az login's organisation: the tenant switches to Contoso
 * (where those repositories don't exist) right after the search's first az call.
 */
function fakeApi(stored: Record<string, unknown> = {}) {
  let active = own;
  const ranIn: string[] = [];
  const storage = new Map(Object.entries(stored));
  const api = {
    azure: {
      tenant: () => active,
      async az(args: string[], options?: { tenant?: string }) {
        const where = options?.tenant ?? active.key;
        ranIn.push(where);
        active = contoso;
        if (where !== "default")
          throw new Error("In tenant Contoso: ERROR: Identity has not been materialized");
        if (args[0] === "repos") return { defaultBranch: "refs/heads/main" };
        if (args[1] === "list") return [{ id: args.includes("api") ? 1 : 2, name: "CI" }];
        return { process: { yamlFilename: "/ci.yml" }, repository: { id: "r" } };
      },
    },
    workspaces: async () => [
      {
        id: "w",
        name: "repos",
        path: "/r",
        isGitRepo: false,
        exists: true,
        repos: [
          { path: "/r/api", name: "api" },
          { path: "/r/web", name: "web" },
        ],
      },
    ],
    exec: async (_: string, __: string[], options?: { cwd?: string }) => ({
      code: 0,
      stdout: `https://dev.azure.com/shop/Shop/_git/${options?.cwd?.endsWith("api") ? "api" : "web"}\n`,
      stderr: "",
    }),
    fs: { readFile: async () => Promise.reject(new Error("no file")) },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, value),
    },
  } as unknown as AddonHostApi;
  return { api, ranIn, storage, switchBack: () => (active = own) };
}

describe("pipelines across a tenant switch", () => {
  it("finishes a search in the tenant it started with, and keeps it there", async () => {
    const { api, ranIn, storage } = fakeApi();
    const found = await pipelines({}, api);
    expect(ranIn.length).toBeGreaterThan(1);
    expect(new Set(ranIn)).toEqual(new Set(["default"]));
    expect(found).toMatchObject({ tenant: "default", errors: [] });
    expect(found.pipelines.map((p) => p.repoName)).toEqual(["api", "web"]);
    expect(storage.get("found")).toMatchObject({ errors: [] });
    expect(storage.has("found@contoso")).toBe(false);
  });

  it("searches again over a saved list with another tenant's errors, and doesn't show them meanwhile", async () => {
    const poisoned: Found = {
      at: Date.now(),
      tenant: "default",
      pipelines: [],
      errors: ["web: In tenant Contoso: ERROR: Identity has not been materialized"],
    };
    const { api, ranIn, switchBack } = fakeApi({ found: poisoned });
    expect((await saved(undefined, api)).found?.errors).toEqual([]);
    const found = await pipelines({}, api);
    expect(ranIn.length).toBeGreaterThan(0);
    expect(found.errors).toEqual([]);
    switchBack();
    expect((await saved(undefined, api)).found?.pipelines).toHaveLength(2);
  });
});

/** One checkout (api in Shop) with pipeline 1, a run going and one that failed; records every az call. */
function toolsApi() {
  const calls: string[][] = [];
  const storage = new Map<string, unknown>();
  const build = (id: number, status: string, result: string | null) => ({
    id,
    buildNumber: `2026.${id}`,
    status,
    result,
    sourceBranch: "refs/heads/main",
    reason: "manual",
    queueTime: "2026-11-05T11:00:00Z",
    startTime: "2026-11-05T11:01:00Z",
    finishTime: status === "completed" ? "2026-11-05T11:05:00Z" : undefined,
    requestedFor: { displayName: "Ana" },
    definition: { id: 1, name: "CI" },
  });
  const api = {
    azure: {
      tenant: () => own,
      async az(args: string[]) {
        calls.push(args);
        const out = args[args.indexOf("--out-file") + 1];
        if (args[0] === "devops" && out && args.includes("Timeline"))
          writeFileSync(
            out,
            JSON.stringify({
              records: [
                { id: "s", type: "Stage", name: "Build", state: "completed", result: "failed" },
                { id: "j", parentId: "s", type: "Job", name: "Compile", result: "failed" },
                { id: "t", parentId: "j", type: "Task", name: "npm test", result: "failed", log: { id: 5 } },
              ],
            }),
          );
        else if (args[0] === "devops" && out) writeFileSync(out, "2026-11-05T11:04:00.0Z 1 test failed\n");
        if (args[0] === "repos") return { defaultBranch: "refs/heads/main" };
        if (
          args.join(" ") ===
          "pipelines list --org https://dev.azure.com/shop --project Shop --repository api --repository-type tfsgit"
        )
          return [{ id: 1, name: "CI" }];
        if (args[1] === "show") return { process: { yamlFilename: "/ci.yml" }, repository: { id: "r" } };
        if (args[1] === "runs" && args[2] === "show") return build(Number(args[4]), "completed", "failed");
        if (args[1] === "runs" && args.includes("inProgress")) return [build(9, "inProgress", null)];
        if (args[1] === "runs" && args.includes("notStarted")) return [];
        if (args[1] === "runs") return [build(9, "inProgress", null), build(8, "completed", "failed")];
        return {};
      },
    },
    workspaces: async () => [{ id: "w", name: "api", path: "/r/api", isGitRepo: true, exists: true }],
    exec: async () => ({ code: 0, stdout: "https://dev.azure.com/shop/Shop/_git/api\n", stderr: "" }),
    fs: { readFile: async () => Promise.reject(new Error("no file")) },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, value),
    },
  } as unknown as AddonHostApi;
  return { api, calls };
}

describe("Claude's tools", () => {
  it("lists the runs going, asking for queued and running ones apart, with their stages", async () => {
    const { api, calls } = toolsApi();
    const text = await toolRuns({ state: "running" }, api);
    expect(text).toMatch(/^1 running or queued run in your checked-out repositories' pipelines:/);
    expect(text).toContain("- CI (shop/Shop) #9 · 2026.9 · running for");
    expect(text).toContain("Build ✗");
    expect(text).toContain("https://dev.azure.com/shop/Shop/_build/results?buildId=9");
    const lists = calls.filter((a) => a[1] === "runs" && a[2] === "list");
    expect(lists.map((a) => a[a.indexOf("--status") + 1])).toEqual(["inProgress", "notStarted"]);
    expect(lists.every((a) => a.includes("--pipeline-ids") && a.includes("1"))).toBe(true);
  });

  it("lists failed runs and the pipelines with their newest run", async () => {
    const { api } = toolsApi();
    expect(await toolRuns({ state: "failed", top: 5 }, api)).toContain("#8 · 2026.8 · failed");
    const listed = await toolPipelines({}, api);
    expect(listed).toContain("api (shop/Shop, /r/api):\n- CI [shop/Shop/1]: newest run #9");
    expect(await toolPipelines({ repo: "web" }, api)).toMatch(/^No pipelines found/);
  });

  it("reads one run with its failed step and the end of its log", async () => {
    const { api } = toolsApi();
    const text = await toolRun({ url: "https://dev.azure.com/shop/Shop/_build/results?buildId=8" }, api);
    expect(text).toContain("CI (shop/Shop) #8");
    expect(text).toContain("Failed step: Build › Compile › npm test");
    expect(text).toContain("1 test failed");
    expect(await toolRun({ id: 8 }, api)).toContain(
      "Link: https://dev.azure.com/shop/Shop/_build/results?buildId=8",
    );
  });

  it("never starts, queues or cancels a run", async () => {
    const { api, calls } = toolsApi();
    await toolRuns({}, api);
    await toolPipelines({}, api);
    await toolRun({ id: 8 }, api);
    const changing = calls.filter(
      (a) => (a[0] === "pipelines" && (a[1] === "run" || a.includes("cancel"))) || a.includes("--method"),
    );
    expect(changing).toEqual([]);
  });
});
