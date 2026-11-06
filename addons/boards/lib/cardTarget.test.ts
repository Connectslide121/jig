import { describe, expect, it } from "vitest";
import { backlogType, boardTypes, pickIdentity } from "./boards";

describe("boardTypes and backlogType", () => {
  it("lists the types the columns map, once each, and picks the backlog type", () => {
    const types = boardTypes([
      { stateMappings: { Bug: "New", "User Story": "New" } },
      { stateMappings: { Bug: "Active", "User Story": "Active" } },
    ]);
    expect(types).toEqual(["Bug", "User Story"]);
    expect(backlogType(types)).toBe("User Story");
    expect(backlogType(["Feature"])).toBe("Feature");
    expect(backlogType(["Bug", "Product Backlog Item"])).toBe("Product Backlog Item");
    expect(backlogType([])).toBeUndefined();
  });
});

describe("pickIdentity", () => {
  const person = (name: string, mail: string, extra: Record<string, unknown> = {}) => ({
    providerDisplayName: name,
    isActive: true,
    properties: { Mail: { $value: mail }, Account: { $value: mail } },
    ...extra,
  });
  it("finds the one person with that name", () => {
    expect(pickIdentity({ value: [person("Ann Demo", "ann@contoso.com")] }, "ann demo")).toEqual({
      name: "Ann Demo",
      email: "ann@contoso.com",
    });
  });
  it("prefers an exact name over partial matches, and takes a single partial match", () => {
    const raw = {
      value: [person("Ann Demo", "ann@contoso.com"), person("Ann Demosson", "ann.d@contoso.com")],
    };
    expect(pickIdentity(raw, "Ann Demo")?.email).toBe("ann@contoso.com");
    expect(pickIdentity({ value: [person("Ann Demo", "ann@contoso.com")] }, "Ann")?.email).toBe(
      "ann@contoso.com",
    );
  });
  it("leaves it unassigned when several match, or nobody, or only groups", () => {
    const two = { value: [person("Ann Demo", "ann@contoso.com"), person("Ann Sample", "ann.s@contoso.com")] };
    expect(pickIdentity(two, "Ann")).toBeUndefined();
    expect(pickIdentity({ value: [] }, "Ann")).toBeUndefined();
    expect(
      pickIdentity({ value: [person("Ann team", "", { isContainer: true })] }, "Ann team"),
    ).toBeUndefined();
    expect(
      pickIdentity({ value: [person("Ann Demo", "ann@contoso.com", { isActive: false })] }, "Ann"),
    ).toBeUndefined();
    expect(pickIdentity(undefined, "Ann")).toBeUndefined();
    expect(pickIdentity({ value: [person("Ann Demo", "ann@contoso.com")] }, " ")).toBeUndefined();
  });
  it("counts one person once, whatever the search returned twice", () => {
    const raw = { value: [person("Ann Demo", "ann@contoso.com"), person("Ann Demo", "ANN@contoso.com")] };
    expect(pickIdentity(raw, "Ann")?.name).toBe("Ann Demo");
  });
});
