import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkIcons, checkManifest, parseTeamLink, RSC_PERMISSIONS } from "./teams-check-lib.ts";

const APP = "11111111-2222-3333-4444-555555555555";
const PKG = "66666666-7777-8888-9999-000000000000";

describe("checkManifest", () => {
  it("asks a team for Jig's RSC permissions, tied to the app registration", () => {
    const m = checkManifest(APP, PKG);
    expect(m.manifestVersion).toBe("1.17");
    expect(m.id).toBe(PKG);
    expect(m.webApplicationInfo.id).toBe(APP);
    expect(m.authorization.permissions.resourceSpecific).toEqual(
      RSC_PERMISSIONS.map((name) => ({ name, type: "Application" })),
    );
    expect(m.staticTabs[0]!.scopes).toContain("team");
    expect(m.developer.name.length).toBeLessThanOrEqual(32);
  });

  it("refuses ids that aren't GUIDs", () => {
    expect(() => checkManifest("nope", PKG)).toThrow();
  });
});

describe("parseTeamLink", () => {
  it("reads the group and tenant from Teams' Get link to team", () => {
    const link = `https://teams.microsoft.com/l/team/19%3aabc%40thread.tacv2/conversations?groupId=${APP}&tenantId=${PKG}`;
    expect(parseTeamLink(link)).toEqual({ groupId: APP, tenantId: PKG });
    expect(parseTeamLink(` ${APP} `)).toEqual({ groupId: APP });
    expect(parseTeamLink("not a link")).toEqual({});
  });
});

describe("checkIcons", () => {
  it("makes PNGs of Teams' sizes", () => {
    const { color, outline } = checkIcons();
    for (const [png, size] of [
      [color, 192],
      [outline, 32],
    ] as const) {
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      const idat = png.indexOf("IDAT");
      const len = png.readUInt32BE(idat - 4);
      expect(inflateSync(png.subarray(idat + 4, idat + 4 + len)).length).toBe(size * (size * 4 + 1));
    }
  });
});
