/**
 * Phase 27's tenant check, run by Jon in his own tenant (docs/plan/27-teams-phone.md → "Tenant
 * check"). Creates nothing in Azure.
 *
 *   npm run teams:check -- package --app-id <app registration's client id>
 *     writes .tmp/teams-check/jig-tenant-check.zip: a tab-only Teams app asking a team for the same
 *     resource-specific consent as Jig's bot (create and rename channels).
 *   npm run teams:check -- prove --app-id <id> --team "<Get link to team>"
 *     with the app registration's client secret in JIG_CHECK_SECRET: gets the app's own token and
 *     creates, then renames, a channel "Jig check" in that team, which only works with the RSC grant.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { checkIcons, checkManifest, isGuid, parseTeamLink } from "./teams-check-lib.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const [command, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const appId = arg("app-id");
if (!isGuid(appId)) {
  console.error("Give the app registration's Application (client) ID: --app-id <guid>");
  process.exit(1);
}

if (command === "package") {
  const out = join(root, ".tmp", "teams-check");
  mkdirSync(out, { recursive: true });
  const { color, outline } = checkIcons();
  const manifest = `${JSON.stringify(checkManifest(appId, randomUUID()), null, 2)}\n`;
  const zip = zipSync({
    "manifest.json": new TextEncoder().encode(manifest),
    "color.png": color,
    "outline.png": outline,
  });
  const file = join(out, "jig-tenant-check.zip");
  writeFileSync(file, zip);
  console.log(`Wrote ${file}\nNext: Teams → Apps → Manage your apps → Upload an app → Upload a custom app.`);
} else if (command === "prove") {
  const team = parseTeamLink(arg("team") ?? "");
  const tenantId = arg("tenant") ?? team.tenantId;
  const secret = process.env.JIG_CHECK_SECRET;
  if (!team.groupId || !isGuid(tenantId) || !secret) {
    console.error(
      'Needs --team "<Get link to team>" (or --team <group id> --tenant <tenant id>) and the client secret in JIG_CHECK_SECRET.',
    );
    process.exit(1);
  }
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const token = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!token.access_token) {
    console.error(
      `No app token: ${token.error ?? tokenRes.status} ${token.error_description?.split("\n")[0] ?? ""}`,
    );
    process.exit(1);
  }
  const graph = (method: string, path: string, body?: unknown) =>
    fetch(`https://graph.microsoft.com/v1.0/teams/${team.groupId}${path}`, {
      method,
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  const made = await graph("POST", "/channels", {
    displayName: `Jig check ${new Date().toISOString().slice(11, 16).replace(":", "")}`,
    description: "Made by Jig's tenant check with the app's resource-specific consent. Safe to delete.",
    membershipType: "standard",
  });
  const channel = (await made.json().catch(() => ({}))) as {
    id?: string;
    error?: { code?: string; message?: string };
  };
  if (!made.ok || !channel.id) {
    console.error(
      `Creating a channel failed: ${made.status} ${channel.error?.code ?? ""} ${channel.error?.message ?? ""}`,
    );
    console.error(
      made.status === 403 ? "→ RSC isn't granted for this team (or the tenant doesn't allow it)." : "",
    );
    process.exit(1);
  }
  console.log(`✓ Created a channel in the team (${channel.id}).`);
  const renamed = await graph("PATCH", `/channels/${encodeURIComponent(channel.id)}`, {
    displayName: "Jig check renamed",
  });
  console.log(
    renamed.ok
      ? "✓ Renamed it: both RSC permissions work."
      : `Renaming failed: ${renamed.status} (creating worked).`,
  );
} else {
  console.error(
    "Usage: npm run teams:check -- package --app-id <guid> | prove --app-id <guid> --team <link>",
  );
  process.exit(1);
}
