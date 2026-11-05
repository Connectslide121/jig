import { describe, expect, it } from "vitest";
import { RSC_PERMISSIONS } from "../../../../../relay/teams/src/protocol";
import { COMMANDS } from "./service";
import {
  displayCommand,
  isResourceGroupName,
  newSuffix,
  plannedCommands,
  relaySettings,
  SETUP_STEPS,
  STEP_TITLES,
  setupResources,
  teamsAppManifest,
} from "./teamsSetupPlan";

const choice = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  subscription: "22222222-2222-4222-8222-222222222222",
  region: "westeurope",
  group: "jig-phone",
  suffix: "ab12cd",
};
const APP = "33333333-3333-4333-8333-333333333333";

describe("plannedCommands", () => {
  it("lists every step's commands in Create's order, a title per step", () => {
    const commands = plannedCommands(choice, {}, { zip: "C:/Jig/relay.zip" });
    expect([...new Set(commands.map((c) => c.step))]).toEqual([...SETUP_STEPS]);
    expect(STEP_TITLES.map((s) => s.id)).toEqual([...SETUP_STEPS]);
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it("shows placeholders until earlier steps answer, then the real values", () => {
    const before = plannedCommands(choice, {}, { zip: "relay.zip" });
    const bot = before.find((c) => c.id === "bot.create")!;
    expect(bot.display).toContain("--appid <app id>");
    expect(bot.display).toContain('--endpoint "https://<relay host>/api/messages"');
    const after = plannedCommands(
      choice,
      { appId: APP, host: "jig-phone-ab12cd.azurewebsites.net" },
      { zip: "relay.zip" },
    );
    expect(after.find((c) => c.id === "bot.create")!.args).toEqual(
      expect.arrayContaining([
        "--appid",
        APP,
        "--tenant-id",
        choice.tenantId,
        "--endpoint",
        "https://jig-phone-ab12cd.azurewebsites.net/api/messages",
        "--app-type",
        "SingleTenant",
        "--sku",
        "F0",
      ]),
    );
  });

  it("creates a Flex Consumption Function on Node 22 and deploys the relay's zip", () => {
    const commands = plannedCommands(choice, {}, { zip: "C:/Jig/relay.zip" });
    const fn = commands.find((c) => c.id === "function.create")!;
    expect(fn.args).toEqual(
      expect.arrayContaining([
        "--flexconsumption-location",
        "westeurope",
        "--runtime",
        "node",
        "--runtime-version",
        "22",
      ]),
    );
    const deploy = commands.find((c) => c.id === "deploy.zip")!;
    expect(deploy.args?.slice(0, 4)).toEqual(["functionapp", "deployment", "source", "config-zip"]);
    expect(deploy.args).toContain("C:/Jig/relay.zip");
    // Every Azure command names the subscription: never the CLI's default by accident.
    for (const c of commands.filter((x) => x.args && x.args[0] !== "ad"))
      expect(c.args, c.id).toContain(choice.subscription);
  });

  it("never shows the bot's secret or the relay key, and sends them only through the settings file", () => {
    const commands = plannedCommands(choice, { appId: APP }, { zip: "z", settingsFile: "C:/tmp/s.json" });
    const set = commands.find((c) => c.id === "settings.set")!;
    expect(set.args).toContain("@C:/tmp/s.json");
    expect(set.display).toContain('"MicrosoftAppPassword=<bot secret>"');
    expect(set.display).toContain('"JIG_RELAY_KEY=<relay key>"');
    expect(commands.find((c) => c.id === "settings.secret")!.outputs).toEqual(["password"]);
  });
});

describe("relaySettings", () => {
  it("writes the names the relay reads", () => {
    const settings = relaySettings({ appId: APP, tenantId: choice.tenantId, secret: "s", key: "k" });
    expect(Object.fromEntries(settings.map((x) => [x.name, x.value]))).toEqual({
      MicrosoftAppId: APP,
      MicrosoftAppPassword: "s",
      MicrosoftAppTenantId: choice.tenantId,
      MicrosoftAppType: "SingleTenant",
      JIG_RELAY_KEY: "k",
    });
  });
});

describe("displayCommand", () => {
  it("quotes what has spaces or quotes, not placeholders or plain words", () => {
    expect(displayCommand(["ad", "app", "create", "--display-name", "Jig phone", "--id", "<app id>"])).toBe(
      'az ad app create --display-name "Jig phone" --id <app id>',
    );
    expect(displayCommand(["--query", "{id: id}"])).toBe('az --query "{id: id}"');
  });
});

describe("names", () => {
  it("makes a six-character suffix and valid storage names", () => {
    const suffix = newSuffix(() => 0.5);
    expect(suffix).toMatch(/^[a-z0-9]{6}$/);
    expect(`jigphone${suffix}`).toMatch(/^[a-z0-9]{3,24}$/);
  });

  it("checks resource group names as Azure does", () => {
    expect(isResourceGroupName("jig-phone")).toBe(true);
    expect(isResourceGroupName("rg.(test)_1")).toBe(true);
    expect(isResourceGroupName("ends.")).toBe(false);
    expect(isResourceGroupName("has space")).toBe(false);
    expect(isResourceGroupName("")).toBe(false);
  });
});

describe("setupResources", () => {
  it("lists what to delete and the commands, never deleting anything", () => {
    const r = setupResources(choice, { appId: APP });
    expect(r.names).toContain("Function app jig-phone-ab12cd");
    expect(r.commands).toEqual([
      `az group delete --name jig-phone --subscription ${choice.subscription}`,
      `az ad app delete --id ${APP}`,
    ]);
  });
});

describe("teamsAppManifest", () => {
  it("is a bot for the 1:1 chat and a team, with its commands and the team permissions", () => {
    const m = teamsAppManifest({ appId: APP, host: "relay.example.net", commands: COMMANDS });
    expect(m.id).toBe(APP);
    expect(m.bots[0]).toMatchObject({ botId: APP, scopes: ["personal", "team"] });
    expect(m.bots[0]!.commandLists[0]!.commands.length).toBeGreaterThan(0);
    expect(m.webApplicationInfo.id).toBe(APP);
    expect(m.authorization.permissions.resourceSpecific.map((p) => p.name)).toEqual([...RSC_PERMISSIONS]);
    expect(m.authorization.permissions.resourceSpecific.map((p) => p.name)).toContain(
      "ChannelMessage.Read.Group",
    );
    expect(m.validDomains).toEqual(["relay.example.net"]);
    expect(m.icons).toEqual({ color: "color.png", outline: "outline.png" });
  });
});
