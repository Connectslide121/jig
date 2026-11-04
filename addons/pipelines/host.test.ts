import type { AddonAzureTenant, AddonHostApi } from "@jig/sdk";
import { describe, expect, it } from "vitest";
import { type Found, pipelines, saved } from "./host";

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
