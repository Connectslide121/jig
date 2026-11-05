import { describe, expect, it, vi } from "vitest";
import type { PhoneState, TeamsSetupView } from "../../shared/phone";
import { type SavedSetup, TeamsSetup, type TeamsSetupDeps } from "./teamsSetup";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SUB = "22222222-2222-4222-8222-222222222222";
const OTHER = "44444444-4444-4444-8444-444444444444";
const APP = "33333333-3333-4333-8333-333333333333";

/** A fake az: answers by command, records every run (and what the settings file held). */
function harness(options: { fail?: string; saved?: SavedSetup } = {}) {
  const runs: string[][] = [];
  const files: string[] = [];
  let fail = options.fail;
  let saved: SavedSetup | undefined = options.saved;
  const views: TeamsSetupView[] = [];
  const connect = vi.fn(
    async (_credential: string) => ({ status: "pairing", remembered: true }) as PhoneState,
  );
  const az = vi.fn(async (args: string[]) => {
    runs.push(args);
    const line = args.join(" ");
    if (fail && line.startsWith(fail)) throw new Error(`ERROR: ${fail} refused (tenant Contoso)`);
    if (line.startsWith("account show"))
      return { tenantId: TENANT, user: "ann@contoso.example.com", tenant: "Contoso" };
    if (line.startsWith("account list"))
      return [
        { id: OTHER, name: "Elsewhere", tenantId: "other", isDefault: true },
        { id: SUB, name: "Contoso dev", tenantId: TENANT, isDefault: false },
      ];
    if (line.startsWith("functionapp list-flexconsumption-locations")) return ["East US", "westeurope"];
    if (line.startsWith("ad app create")) return { appId: APP };
    if (line.startsWith("functionapp show")) return { host: "jig-phone-x.azurewebsites.net" };
    if (line.startsWith("ad app credential reset")) return { password: "s3cret" };
    return { id: "x" };
  });
  const deps: TeamsSetupDeps = {
    az,
    load: async () => saved ?? { outputs: {}, done: [] },
    save: async (next) => {
      saved = next && structuredClone(next);
    },
    relayZip: () => "C:/Jig/relay.zip",
    settingsFile: async (contents) => {
      files.push(contents);
      return { path: "C:/tmp/settings.json", done: async () => {} };
    },
    connect,
    installs: async () => ({ app: true, team: false }),
    writePackage: async () => "C:/home/teams/jig-teams-app.zip",
    onChange: (view) => views.push(view),
    sleep: async () => {},
    relayWaitMs: 0,
  };
  const setup = new TeamsSetup(deps);
  const idle = () => vi.waitFor(() => expect(views.at(-1)?.running).toBe(false));
  return {
    setup,
    runs,
    files,
    connect,
    views,
    idle,
    saved: () => saved,
    failNext: (prefix?: string) => (fail = prefix),
  };
}

async function ready(h: ReturnType<typeof harness>) {
  await h.setup.open({ load: true });
  await vi.waitFor(() => expect(h.setup.view().regions.length).toBeGreaterThan(0));
}

describe("TeamsSetup: where", () => {
  it("reads the active tenant, only its subscriptions can be picked, and regions as --location takes them", async () => {
    const h = harness();
    await ready(h);
    const view = h.setup.view();
    expect(view.tenant).toEqual({ id: TENANT, name: "Contoso", user: "ann@contoso.example.com" });
    expect(view.subscriptions).toEqual([
      { id: SUB, name: "Contoso dev", inTenant: true },
      { id: OTHER, name: "Elsewhere", inTenant: false },
    ]);
    // The other tenant's default isn't picked.
    expect(view.choice).toEqual({ subscription: SUB, region: "westeurope", group: "jig-phone" });
    expect(view.regions).toEqual(["eastus", "westeurope"]);
    await expect(h.setup.setWhere({ subscription: OTHER })).rejects.toThrow(/tenant where your Teams is/);
    // Nothing was created by opening it: only reading commands ran.
    expect(h.runs.map((r) => r.slice(0, 2).join(" "))).toEqual([
      "account show",
      "account list",
      "functionapp list-flexconsumption-locations",
    ]);
  });

  it("refuses a bad resource group name at Create", async () => {
    const h = harness();
    await ready(h);
    await h.setup.setWhere({ group: "bad name." });
    await expect(h.setup.create()).rejects.toThrow(/resource group/);
  });
});

describe("TeamsSetup: Create", () => {
  it("runs every command in order, keeps no secret, sends the secret only in the settings file, and connects", async () => {
    const h = harness();
    await ready(h);
    h.runs.length = 0;
    await h.setup.create();
    await h.idle();
    const view = h.setup.view();
    expect(view.created).toBe(true);
    expect(view.steps.every((s) => s.status === "done")).toBe(true);
    expect(h.runs.map((r) => r.slice(0, 3).join(" "))).toEqual([
      "ad app create",
      "ad sp create",
      "provider register --namespace",
      "provider register --namespace",
      "provider register --namespace",
      "group create --name",
      "storage account create",
      "functionapp create --name",
      "functionapp show --name",
      "functionapp deployment source",
      "ad app credential",
      "functionapp config appsettings",
      "bot create --name",
      "bot msteams create",
    ]);
    // The secret travels in the private file only, never as an argument or in what is saved.
    expect(h.runs.flat().some((a) => a.includes("s3cret"))).toBe(false);
    expect(h.files[0]).toContain("s3cret");
    expect(JSON.stringify(h.saved())).not.toContain("s3cret");
    const key = JSON.parse(h.files[0]!).find((x: { name: string }) => x.name === "JIG_RELAY_KEY").value;
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(h.saved())).not.toContain(key);
    expect(JSON.stringify(view)).not.toContain(key);
    expect(h.connect).toHaveBeenCalledWith(`https://jig-phone-x.azurewebsites.net#${key}`);
    expect(h.saved()?.outputs).toEqual({ appId: APP, host: "jig-phone-x.azurewebsites.net" });
    expect(view.resources?.subscription).toBe("Contoso dev");
  });

  it("stops at a failure with its error, and Retry goes on from there", async () => {
    const h = harness({ fail: "storage account create" });
    await ready(h);
    await h.setup.create();
    await h.idle();
    let view = h.setup.view();
    const storage = view.steps.find((s) => s.id === "storage")!;
    expect(storage.status).toBe("failed");
    expect(storage.error).toMatch(/refused \(tenant Contoso\)/);
    expect(view.steps.find((s) => s.id === "function")!.status).toBe("todo");
    expect(view.started).toBe(true);
    await expect(h.setup.setWhere({ region: "eastus" })).rejects.toThrow(/Start over/);
    h.failNext(undefined);
    h.runs.length = 0;
    await h.setup.create();
    await h.idle();
    view = h.setup.view();
    expect(view.created).toBe(true);
    expect(h.runs[0]!.slice(0, 3)).toEqual(["storage", "account", "create"]);
    expect(h.runs.some((r) => r[0] === "group")).toBe(false);
  });

  it("after a restart makes a new secret and key before connecting (they were only in memory)", async () => {
    const first = harness({ fail: "bot create" });
    await ready(first);
    await first.setup.create();
    await first.idle();
    const saved = first.saved()!;
    expect(saved.done).toContain("settings.set");
    const h = harness({ saved });
    await ready(h);
    h.runs.length = 0;
    await h.setup.create();
    await h.idle();
    expect(h.runs.map((r) => r.slice(0, 2).join(" "))).toEqual([
      "ad app",
      "functionapp config",
      "bot create",
      "bot msteams",
    ]);
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it("says what the relay answered when it never comes up", async () => {
    const h = harness();
    h.connect.mockRejectedValue(new Error("The Teams relay can't be reached."));
    await ready(h);
    await h.setup.create();
    await h.idle();
    const connect = h.setup.view().steps.find((s) => s.id === "connect")!;
    expect(connect.status).toBe("failed");
    expect(connect.error).toMatch(/relay didn't answer: The Teams relay can't be reached/);
  });
});

describe("TeamsSetup: by hand, the package, installs, forgetting", () => {
  it("connects a relay made in the portal and marks Create done", async () => {
    const h = harness();
    const view = await h.setup.manual(APP, `https://relay.example.net#${"k".repeat(43)}`);
    expect(view.manual).toBe(true);
    expect(view.created).toBe(true);
    expect(view.resources).toBeUndefined();
    expect(h.saved()?.outputs).toEqual({ appId: APP, host: "relay.example.net" });
    expect(h.runs).toEqual([]);
    expect((await h.setup.writePackage()).packagePath).toBe("C:/home/teams/jig-teams-app.zip");
  });

  it("asks the relay what it has seen, and forgets everything on Start over", async () => {
    const h = harness();
    await h.setup.manual(APP, `https://relay.example.net#${"k".repeat(43)}`);
    expect((await h.setup.open({ installs: true })).installs).toEqual({ app: true, team: false });
    const view = await h.setup.forget();
    expect(view.created).toBe(false);
    expect(h.saved()).toBeUndefined();
    await expect(h.setup.writePackage()).rejects.toThrow(/Create the Azure pieces first/);
  });
});
