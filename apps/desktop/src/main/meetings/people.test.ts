import { describe, expect, it } from "vitest";
import { peopleSearchUrl, suggestedNames, toPeople, usersByNameUrl } from "./people";

describe("people to call", () => {
  it("searches by name or mail without letting quotes through", () => {
    const url = new URL(peopleSearchUrl(' al"ex\\ '));
    expect(url.pathname).toBe("/v1.0/users");
    expect(url.searchParams.get("$search")).toBe('"displayName:al ex" OR "mail:al ex"');
  });
  it("keeps organisation users from /me/people and looks them up by name", () => {
    const names = suggestedNames([
      { userPrincipalName: "alex@contoso.com", personType: { subclass: "OrganizationUser" } },
      { userPrincipalName: "list@contoso.com", personType: { subclass: "UnifiedGroup" } },
      { userPrincipalName: "alex@contoso.com", personType: { subclass: "OrganizationUser" } },
    ]);
    expect(names).toEqual(["alex@contoso.com"]);
    const filter = new URL(usersByNameUrl(["o'neil@contoso.com", "sam@contoso.com"])).searchParams.get(
      "$filter",
    );
    expect(filter).toBe("userPrincipalName in ('o''neil@contoso.com','sam@contoso.com')");
  });
  it("leaves yourself out and keeps the suggested order", () => {
    const users = [
      { id: "2", displayName: "Sam", userPrincipalName: "sam@contoso.com", jobTitle: "Designer" },
      { id: "1", displayName: "Alex", mail: "alex@contoso.com", userPrincipalName: "Alex@contoso.com" },
      { id: "me", displayName: "Me", userPrincipalName: "me@contoso.com" },
    ];
    expect(toPeople(users, "me", ["alex@contoso.com", "sam@contoso.com"])).toEqual([
      { id: "1", name: "Alex", email: "alex@contoso.com" },
      { id: "2", name: "Sam", email: "sam@contoso.com", title: "Designer" },
    ]);
  });
});
