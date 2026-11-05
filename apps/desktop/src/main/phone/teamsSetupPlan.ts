/**
 * Setting up Jig on your phone through Teams (D-370, D-381): what Jig creates in your
 * Azure and the `az` commands that do it, in order, and the Teams app package. Pure: `teamsSetup.ts`
 * runs the commands with Jig's `az` for the active tenant, only when you press Create.
 */
import { RSC_PERMISSIONS } from "../../../../../relay/teams/src/protocol";
import type { PhoneCommand } from "./channel";
import { teamsCommandLists } from "./teams";

/** Where the Azure pieces go: chosen in the modal's first step. */
export interface SetupChoice {
  /** The Entra tenant of the active tenant (where your Teams is): the app registration's home. */
  tenantId: string;
  subscription: string;
  region: string;
  group: string;
  /** Six lowercase letters and digits, so the global names are free: `jigphone<suffix>`… */
  suffix: string;
}

/** What the commands answered that later ones need. Never the bot's secret or the relay key. */
export interface SetupOutputs {
  appId?: string;
  host?: string;
}

export const SETUP_STEPS = [
  "app",
  "group",
  "storage",
  "function",
  "deploy",
  "settings",
  "bot",
  "connect",
] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** One `az` run: its arguments with what is known filled in, and how it reads in the modal. */
export interface PlannedCommand {
  id: string;
  step: SetupStepId;
  /** The real arguments (after `az`); undefined for Jig's own work (the relay check). */
  args?: string[];
  /** What the modal shows: the command, with placeholders for what isn't known yet and for secrets. */
  display: string;
  /** Pick these from the JSON az answers (`--query`). */
  outputs?: Array<keyof SetupOutputs | "password">;
  /** Minutes it may take (creating a Function app, deploying). */
  minutes?: number;
}

export interface PlannedStep {
  id: SetupStepId;
  title: string;
  /** What it creates, in a few words (the row's second line). */
  creates: string;
}

export const DEFAULT_GROUP = "jig-phone";
const APP_NAME = "Jig phone";
/** Placeholders for what the modal never shows. */
const SECRET = "<bot secret>";
const KEY = "<relay key>";

/** The names of what setup creates (storage accounts: 3-24 lowercase letters and digits). */
export function resourceNames(suffix: string) {
  return {
    app: APP_NAME,
    storage: `jigphone${suffix}`,
    functionApp: `jig-phone-${suffix}`,
    bot: `jig-phone-${suffix}`,
  };
}

/** Six random lowercase letters and digits. */
export function newSuffix(random: () => number = Math.random): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(random() * chars.length)]).join("");
}

const RESOURCE_GROUP = /^[\w.()-]{1,89}[\w()-]$/;
/** Azure's rule for a resource group's name: letters, digits, `_ . ( ) -`, not ending in a period. */
export const isResourceGroupName = (name: string) => RESOURCE_GROUP.test(name);

export const STEP_TITLES: PlannedStep[] = [
  { id: "app", title: "App registration", creates: "The bot's identity in your tenant (single-tenant)" },
  { id: "group", title: "Resource group", creates: "One group that holds everything below" },
  { id: "storage", title: "Storage account", creates: "Where the relay keeps your messages for 24 hours" },
  { id: "function", title: "Function app", creates: "The relay: Flex Consumption, Node 22" },
  { id: "deploy", title: "Relay deployed", creates: "Jig's relay package, into the Function app" },
  {
    id: "settings",
    title: "Relay settings",
    creates: "The bot's id, tenant and secret, and Jig's relay key",
  },
  { id: "bot", title: "Azure Bot", creates: "Free tier, single-tenant, with the Teams channel on" },
  { id: "connect", title: "Connect Jig", creates: "Jig checks the relay answers and keeps its key" },
];

/** A command as you'd type it: arguments with spaces or quotes in double quotes. */
export function displayCommand(args: string[]): string {
  return [
    "az",
    ...args.map((a) =>
      /^[\w@%+=:,./<>-]+$/.test(a) && !a.includes("<") ? a : `"${a.replace(/"/g, '\\"')}"`,
    ),
  ]
    .join(" ")
    .replace(/"(<[^>]+>)"/g, "$1");
}

/** The relay's settings (`az functionapp config appsettings set --settings @file`), written to a private file. */
export function relaySettings(input: { appId: string; tenantId: string; secret: string; key: string }) {
  return [
    { name: "MicrosoftAppId", value: input.appId, slotSetting: false },
    { name: "MicrosoftAppPassword", value: input.secret, slotSetting: false },
    { name: "MicrosoftAppTenantId", value: input.tenantId, slotSetting: false },
    { name: "MicrosoftAppType", value: "SingleTenant", slotSetting: false },
    { name: "JIG_RELAY_KEY", value: input.key, slotSetting: false },
  ];
}

/**
 * Every command, in the order Create runs them. What isn't known yet shows as a placeholder (the app
 * id before the app registration exists); `settingsFile` and `zip` are paths only the runner knows.
 */
export function plannedCommands(
  choice: SetupChoice,
  outputs: SetupOutputs,
  files: { zip: string; settingsFile?: string },
): PlannedCommand[] {
  const n = resourceNames(choice.suffix);
  const sub = ["--subscription", choice.subscription];
  const rg = ["--resource-group", choice.group];
  const appId = outputs.appId ?? "<app id>";
  const host = outputs.host ?? "<relay host>";
  const cmd = (
    id: string,
    step: SetupStepId,
    args: string[],
    extra: Omit<PlannedCommand, "id" | "step" | "display" | "args"> & { display?: string[] } = {},
  ): PlannedCommand => {
    const { display, ...rest } = extra;
    return { id, step, args, display: displayCommand(display ?? args), ...rest };
  };
  const settingsShown = [
    `MicrosoftAppId=${appId}`,
    `MicrosoftAppPassword=${SECRET}`,
    `MicrosoftAppTenantId=${choice.tenantId}`,
    "MicrosoftAppType=SingleTenant",
    `JIG_RELAY_KEY=${KEY}`,
  ];
  const settingsBase = [
    "functionapp",
    "config",
    "appsettings",
    "set",
    "--name",
    n.functionApp,
    ...rg,
    ...sub,
  ];
  return [
    cmd(
      "app.create",
      "app",
      [
        "ad",
        "app",
        "create",
        "--display-name",
        n.app,
        "--sign-in-audience",
        "AzureADMyOrg",
        "--query",
        "{appId: appId}",
      ],
      { outputs: ["appId"] },
    ),
    cmd("app.principal", "app", ["ad", "sp", "create", "--id", appId, "--query", "{id: id}"]),
    ...["Microsoft.Web", "Microsoft.Storage", "Microsoft.BotService"].map((namespace) =>
      cmd(
        `group.provider.${namespace}`,
        "group",
        ["provider", "register", "--namespace", namespace, ...sub, "--wait"],
        {
          minutes: 5,
        },
      ),
    ),
    cmd("group.create", "group", [
      "group",
      "create",
      "--name",
      choice.group,
      "--location",
      choice.region,
      ...sub,
      "--query",
      "{id: id}",
    ]),
    cmd("storage.create", "storage", [
      "storage",
      "account",
      "create",
      "--name",
      n.storage,
      ...rg,
      "--location",
      choice.region,
      ...sub,
      "--sku",
      "Standard_LRS",
      "--kind",
      "StorageV2",
      "--min-tls-version",
      "TLS1_2",
      "--allow-blob-public-access",
      "false",
      "--query",
      "{id: id}",
    ]),
    cmd(
      "function.create",
      "function",
      [
        "functionapp",
        "create",
        "--name",
        n.functionApp,
        ...rg,
        ...sub,
        "--storage-account",
        n.storage,
        "--flexconsumption-location",
        choice.region,
        "--runtime",
        "node",
        "--runtime-version",
        "22",
        "--query",
        "{id: id}",
      ],
      { minutes: 10 },
    ),
    cmd(
      "function.host",
      "function",
      // Newer az (2.85) answers with the ARM shape, the fields under `properties`.
      [
        "functionapp",
        "show",
        "--name",
        n.functionApp,
        ...rg,
        ...sub,
        "--query",
        "{host: defaultHostName || properties.defaultHostName}",
      ],
      { outputs: ["host"] },
    ),
    cmd(
      "deploy.zip",
      "deploy",
      [
        "functionapp",
        "deployment",
        "source",
        "config-zip",
        "--name",
        n.functionApp,
        ...rg,
        ...sub,
        "--src",
        files.zip,
      ],
      {
        minutes: 10,
        display: [
          "functionapp",
          "deployment",
          "source",
          "config-zip",
          "--name",
          n.functionApp,
          ...rg,
          ...sub,
          "--src",
          "teams-relay.zip",
        ],
      },
    ),
    cmd(
      "settings.secret",
      "settings",
      [
        "ad",
        "app",
        "credential",
        "reset",
        "--id",
        appId,
        "--append",
        "--display-name",
        "Jig relay",
        "--years",
        "2",
        "--query",
        "{password: password}",
      ],
      { outputs: ["password"] },
    ),
    cmd(
      "settings.set",
      "settings",
      [...settingsBase, "--settings", `@${files.settingsFile ?? "settings.json"}`, "--query", "[].name"],
      { display: [...settingsBase, "--settings", ...settingsShown] },
    ),
    cmd("bot.create", "bot", [
      "bot",
      "create",
      "--name",
      n.bot,
      ...rg,
      ...sub,
      "--app-type",
      "SingleTenant",
      "--appid",
      appId,
      "--tenant-id",
      choice.tenantId,
      "--endpoint",
      `https://${host}/api/messages`,
      "--sku",
      "F0",
      "--query",
      "{id: id}",
    ]),
    cmd("bot.teams", "bot", [
      "bot",
      "msteams",
      "create",
      "--name",
      n.bot,
      ...rg,
      ...sub,
      "--query",
      "{id: id}",
    ]),
    {
      id: "connect.health",
      step: "connect",
      display: `GET https://${host}/api/health (with the relay key), then pairing`,
      minutes: 3,
    },
  ];
}

/** What Disconnect lists: the group holds everything but the app registration. */
export function setupResources(choice: SetupChoice, outputs: SetupOutputs) {
  const n = resourceNames(choice.suffix);
  return {
    subscription: choice.subscription,
    group: choice.group,
    names: [
      `Resource group ${choice.group}`,
      `Storage account ${n.storage}`,
      `Function app ${n.functionApp}`,
      `Azure Bot ${n.bot}`,
      `App registration ${n.app}${outputs.appId ? ` (${outputs.appId})` : ""}`,
    ],
    commands: [
      displayCommand(["group", "delete", "--name", choice.group, "--subscription", choice.subscription]),
      ...(outputs.appId ? [displayCommand(["ad", "app", "delete", "--id", outputs.appId])] : []),
    ],
  };
}

/**
 * The Teams app package's manifest: the bot in the 1:1 chat and in a team, its command list, and
 * the team permissions (RSC) the channels need. `id` is the bot's app id, so a new package replaces
 * the old app in Teams.
 */
export function teamsAppManifest(input: {
  appId: string;
  host: string;
  commands: PhoneCommand[];
  version?: string;
}) {
  const site = "https://github.com/Connectslide121/jig";
  return {
    $schema: "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
    manifestVersion: "1.17",
    version: input.version ?? "1.0.0",
    id: input.appId,
    developer: { name: "Jig", websiteUrl: site, privacyUrl: site, termsOfUseUrl: site },
    name: { short: "Jig", full: "Jig on your phone" },
    description: {
      short: "Your Jig: chats, questions and permissions on your phone.",
      full: "Your own bot for Jig, the desktop workbench around Claude Code: it messages you when a chat needs you, finishes or stops, and you answer from Teams. Its team has a channel per project and a thread per chat. It talks only to you, through a relay in your own Azure.",
    },
    icons: { color: "color.png", outline: "outline.png" },
    accentColor: "#E0A458",
    bots: [
      {
        botId: input.appId,
        scopes: ["personal", "team"],
        supportsFiles: false,
        isNotificationOnly: false,
        commandLists: teamsCommandLists(input.commands),
      },
    ],
    permissions: ["identity", "messageTeamMembers"],
    validDomains: [input.host],
    webApplicationInfo: { id: input.appId, resource: `api://botid-${input.appId}` },
    authorization: {
      permissions: { resourceSpecific: RSC_PERMISSIONS.map((name) => ({ name, type: "Application" })) },
    },
  };
}
