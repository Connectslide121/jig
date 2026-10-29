import { describe, expect, it } from "vitest";
import { azureItems, azurePortalUrl, defaultLinkLabel, guessLinkType, linkLabel } from "./links";

const rg = "/subscriptions/abc/resourceGroups/shop-stage";
const portal = (id: string) => azurePortalUrl(id);

describe("guessLinkType / defaultLinkLabel", () => {
  it("reads Azure portal addresses", () => {
    expect(guessLinkType(portal(rg))).toBe("resource-group");
    expect(defaultLinkLabel(portal(rg))).toBe("shop-stage");
    const site = `${rg}/providers/Microsoft.Web/sites/shop-web`;
    expect(guessLinkType(portal(site))).toBe("app-service");
    expect(defaultLinkLabel(portal(site))).toBe("shop-web");
    expect(guessLinkType(portal(`${rg}/providers/Microsoft.Sql/servers/sql1/databases/shop`))).toBe(
      "database",
    );
    expect(defaultLinkLabel(portal(`${rg}/providers/Microsoft.Sql/servers/sql1/databases/shop`))).toBe(
      "shop",
    );
    expect(guessLinkType(portal(`${rg}/providers/Microsoft.KeyVault/vaults/kv-shop`))).toBe("key-vault");
    expect(guessLinkType(portal(`${rg}/providers/Microsoft.Storage/storageAccounts/st1`))).toBe("storage");
    expect(guessLinkType(portal(`${rg}/providers/microsoft.insights/components/ai-shop`))).toBe("monitoring");
  });
  it("reads Azure DevOps and other addresses", () => {
    expect(guessLinkType("https://dev.azure.com/contoso/Shop/_git/webshop")).toBe("devops-repo");
    expect(defaultLinkLabel("https://dev.azure.com/contoso/Shop/_git/webshop")).toBe("webshop");
    expect(guessLinkType("https://dev.azure.com/contoso/Shop/_build?definitionId=3")).toBe("devops-pipeline");
    expect(guessLinkType("https://dev.azure.com/contoso/Shop/_boards/board")).toBe("devops-board");
    expect(guessLinkType("https://stage.shop.se/swagger/index.html")).toBe("api");
    expect(guessLinkType("https://stage.shop.se")).toBe("website");
    expect(defaultLinkLabel("https://www.shop.se/")).toBe("shop.se");
    expect(linkLabel({ url: "https://www.shop.se/admin", label: " " })).toBe("shop.se/admin");
    expect(linkLabel({ url: "https://www.shop.se", label: "Prod site" })).toBe("Prod site");
  });
});

describe("azureItems", () => {
  it("turns az output into portal links with types", () => {
    const items = azureItems([
      { id: "/subscriptions/a/resourceGroups/rg", name: "rg" },
      {
        id: "/subscriptions/a/resourceGroups/rg/providers/Microsoft.Web/sites/web",
        name: "web",
        type: "Microsoft.Web/sites",
        resourceGroup: "rg",
      },
      { nope: true },
    ]);
    expect(items.map((i) => [i.name, i.type, i.group])).toEqual([
      ["rg", "resource-group", "rg"],
      ["web", "app-service", "rg"],
    ]);
    expect(items[0]!.url).toBe("https://portal.azure.com/#@/resource/subscriptions/a/resourceGroups/rg");
    expect(azureItems("nope")).toEqual([]);
  });
});
