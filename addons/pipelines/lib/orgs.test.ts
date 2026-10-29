import { describe, expect, it } from "vitest";
import { effectiveOrgs, inBatches, orgName, orgUrl, readSettings } from "./orgs";

describe("organisations", () => {
  it("turns any way of writing an organisation into its dev.azure.com URL", () => {
    expect(orgUrl("contoso")).toBe("https://dev.azure.com/contoso");
    expect(orgUrl("https://dev.azure.com/contoso/")).toBe("https://dev.azure.com/contoso");
    expect(orgUrl("https://dev.azure.com/contoso/Shop/_build")).toBe("https://dev.azure.com/contoso");
    // What the accounts API answers: vssps hosts, with a port.
    expect(orgUrl("https://fabrikam.vssps.visualstudio.com:443/")).toBe("https://dev.azure.com/fabrikam");
    expect(orgUrl("https://vssps.dev.azure.com:443/Northwind/")).toBe("https://dev.azure.com/Northwind");
    expect(orgUrl("https://contoso.visualstudio.com")).toBe("https://dev.azure.com/contoso");
    expect(orgUrl("  ")).toBe("");
    expect(orgName("https://dev.azure.com/Northwind")).toBe("Northwind");
  });

  it("reads the settings, including the first version with one organisation", () => {
    expect(readSettings(undefined)).toEqual({ allOrgs: true, orgs: [] });
    expect(readSettings({ org: "https://dev.azure.com/contoso", projects: ["Shop"] })).toEqual({
      allOrgs: false,
      orgs: [{ org: "https://dev.azure.com/contoso", projects: ["Shop"] }],
    });
    expect(readSettings({ org: "", projects: [] })).toEqual({ allOrgs: true, orgs: [] });
    expect(readSettings({ allOrgs: false, orgs: [{ org: "contoso", projects: [] }] })).toEqual({
      allOrgs: false,
      orgs: [{ org: "https://dev.azure.com/contoso", projects: undefined }],
    });
  });

  it("shows every organisation you belong to once, keeping the projects you chose", () => {
    const settings = {
      allOrgs: true,
      orgs: [{ org: "https://dev.azure.com/Fabrikam", projects: ["Web"] }],
    };
    expect(
      effectiveOrgs(settings, [
        "https://fabrikam.vssps.visualstudio.com:443/",
        "https://vssps.dev.azure.com/Northwind/",
      ]),
    ).toEqual([
      { org: "https://dev.azure.com/Fabrikam", projects: ["Web"] },
      { org: "https://dev.azure.com/Northwind" },
    ]);
    expect(effectiveOrgs({ ...settings, allOrgs: false }, ["Northwind"])).toEqual([
      { org: "https://dev.azure.com/Fabrikam", projects: ["Web"] },
    ]);
  });

  it("runs work a few at a time and keeps the order", async () => {
    let running = 0;
    let most = 0;
    const out = await inBatches([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(most).toBe(3);
  });
});
