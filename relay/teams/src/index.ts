import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { BotKeys } from "./botAuth.ts";
import { AppTokens, BotConnector, TeamChannels } from "./microsoft.ts";
import { createRelay, type Relay } from "./relay.ts";
import { MIN_KEY_LENGTH } from "./relayKey.ts";
import { TableStore } from "./tableStore.ts";

/**
 * The relay as an Azure Function app (Functions v4, Node 22, Flex Consumption; D-370). Its settings,
 * written by Jig's setup: `MicrosoftAppId`, `MicrosoftAppPassword` (the bot's client secret: it never
 * leaves Azure), `MicrosoftAppTenantId`, `JIG_RELAY_KEY`, and the storage account's connection string
 * in `JIG_RELAY_STORAGE` (else the Function's own `AzureWebJobsStorage`).
 */

declare const __RELAY_VERSION__: string;
const version = typeof __RELAY_VERSION__ === "string" ? __RELAY_VERSION__ : "dev";

let relay: Relay | undefined;
let missing: string[] = [];

function get(): Relay | undefined {
  if (relay) return relay;
  const env = process.env;
  const appId = env.MicrosoftAppId ?? "";
  const secret = env.MicrosoftAppPassword ?? "";
  const tenantId = env.MicrosoftAppTenantId ?? "";
  const relayKey = env.JIG_RELAY_KEY ?? "";
  const storage = env.JIG_RELAY_STORAGE || env.AzureWebJobsStorage || "";
  missing = Object.entries({
    MicrosoftAppId: appId,
    MicrosoftAppPassword: secret,
    MicrosoftAppTenantId: tenantId,
    JIG_RELAY_KEY: relayKey.length >= MIN_KEY_LENGTH ? relayKey : "",
    JIG_RELAY_STORAGE: storage,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) return undefined;
  const tokens = new AppTokens({ appId, secret, tenantId });
  relay = createRelay({
    config: { appId, tenantId, relayKey, version },
    store: TableStore.fromConnectionString(storage),
    keys: new BotKeys(),
    connector: new BotConnector(tokens, appId),
    channels: new TeamChannels(tokens),
  });
  return relay;
}

/** Without its settings the relay answers 503 and names what's missing (never their values). */
function route(handler: (r: Relay, req: HttpRequest) => Promise<HttpResponseInit>) {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const r = get();
    if (!r) return { status: 503, jsonBody: { error: "not_configured", detail: missing.join(", ") } };
    return handler(r, req);
  };
}

app.http("messages", {
  route: "messages",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: route((r, req) => r.messages(req)),
});
app.http("updates", {
  route: "updates",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: route((r, req) => r.updates(req)),
});
app.http("send", {
  route: "send",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: route((r, req) => r.send(req)),
});
app.http("sendUpdate", {
  route: "send/{id}",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: route((r, req) => r.update(req)),
});
app.http("channels", {
  route: "channels",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: route((r, req) => r.channels(req)),
});
app.http("pairing", {
  route: "pairing",
  methods: ["PUT", "DELETE"],
  authLevel: "anonymous",
  handler: route((r, req) => r.pairing(req, req.method)),
});
app.http("health", {
  route: "health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: route((r, req) => r.health(req)),
});
app.timer("prune", {
  schedule: "0 17 * * * *",
  handler: async () => {
    await get()?.prune();
  },
});
