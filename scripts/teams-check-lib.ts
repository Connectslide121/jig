/**
 * The throwaway tenant check of phase 27 (docs/plan/27-teams-phone.md → "Tenant check"): a tab-only
 * Teams app that asks a team for the same resource-specific consent Jig's bot will (channels through
 * Graph), so Jon can see, before any Azure is created, whether his tenant lets him create a team and
 * grant an app RSC as its owner. Pure parts here; `teams-check.ts` writes and runs them.
 */
import { crc32, deflateSync } from "node:zlib";

/** The RSC permissions Jig's bot asks a team for: make channels, rename them (D-370). */
export const RSC_PERMISSIONS = ["Channel.Create.Group", "ChannelSettings.ReadWrite.Group"] as const;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (s: string | undefined): s is string => !!s && GUID.test(s);

export function checkManifest(appId: string, packageId: string) {
  if (!isGuid(appId) || !isGuid(packageId)) throw new Error("app id and package id must be GUIDs");
  const site = "https://github.com/Connectslide121/jig";
  return {
    $schema: "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
    manifestVersion: "1.17",
    version: "1.0.0",
    id: packageId,
    developer: { name: "Jig", websiteUrl: site, privacyUrl: site, termsOfUseUrl: site },
    name: { short: "Jig tenant check", full: "Jig tenant check (safe to remove)" },
    description: {
      short: "Checks that a team owner can grant Jig's channel permissions.",
      full: "A throwaway app with no bot and no code: adding it to a team shows the consent Jig's bot will ask for (create and rename channels in this team). Remove it, and the test team, afterwards.",
    },
    icons: { color: "color.png", outline: "outline.png" },
    accentColor: "#4F6BED",
    staticTabs: [
      { entityId: "check", name: "Check", contentUrl: site, websiteUrl: site, scopes: ["personal", "team"] },
    ],
    permissions: ["identity"],
    validDomains: ["github.com"],
    webApplicationInfo: { id: appId, resource: `api://jig-tenant-check/${appId}` },
    authorization: {
      permissions: { resourceSpecific: RSC_PERMISSIONS.map((name) => ({ name, type: "Application" })) },
    },
  };
}

/** The team's Microsoft 365 group id and tenant from "Get link to team" (or the bare group id). */
export function parseTeamLink(link: string): { groupId?: string; tenantId?: string } {
  const text = link.trim();
  if (isGuid(text)) return { groupId: text };
  try {
    const url = new URL(text);
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const tenantId = url.searchParams.get("tenantId") ?? undefined;
    return {
      groupId: isGuid(groupId) ? groupId : undefined,
      tenantId: isGuid(tenantId) ? tenantId : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * A PNG of `size`² pixels, each `pixel(x, y)` → RGBA. Enough for Teams' two icons without an image
 * library: 8-bit RGBA, no filtering.
 */
export function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), row + 1 + x * 4);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Teams' colour icon (192², filled) and outline icon (32², white on transparent): a rounded square. */
export function checkIcons(): { color: Buffer; outline: Buffer } {
  const inside = (x: number, y: number, size: number, r: number) => {
    const cx = Math.min(Math.max(x, r), size - 1 - r);
    const cy = Math.min(Math.max(y, r), size - 1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const color = png(192, (x, y) => (inside(x, y, 192, 36) ? [79, 107, 237, 255] : [0, 0, 0, 0]));
  const outline = png(32, (x, y) =>
    inside(x, y, 32, 7) && !(x >= 4 && x <= 27 && y >= 4 && y <= 27) ? [255, 255, 255, 255] : [0, 0, 0, 0],
  );
  return { color, outline };
}
