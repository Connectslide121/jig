import { describe, expect, it } from "vitest";
import {
  demoText,
  deployArgs,
  domainAllowed,
  live,
  parseNames,
  publishHtml,
  SWA_CLI,
  scanRealData,
  sitePath,
  targetsOf,
  untilOf,
} from "./publish";

describe("targetsOf", () => {
  it("keeps complete targets, trims them and drops duplicates and the reserved name", () => {
    expect(
      targetsOf([
        { name: " Demos ", app: "demos", resourceGroup: "rg", url: "https://demos.azurestaticapps.net/" },
        { name: "Demos", app: "x", resourceGroup: "y", url: "https://x.net" },
        { name: "local", app: "x", resourceGroup: "y", url: "https://x.net" },
        { name: "No url", app: "x", resourceGroup: "y", url: "ftp://x" },
        { name: "Sub", app: "s", resourceGroup: "g", subscription: " 123 ", url: "https://s.contoso.com" },
        null,
      ]),
    ).toEqual([
      { name: "Demos", app: "demos", resourceGroup: "rg", url: "https://demos.azurestaticapps.net" },
      { name: "Sub", app: "s", resourceGroup: "g", subscription: "123", url: "https://s.contoso.com" },
    ]);
    expect(targetsOf("nope")).toEqual([]);
  });
});

describe("scanRealData", () => {
  it("finds real-looking addresses and numbers, not reserved or invented ones", () => {
    const hits = scanRealData(
      "a@shop.example b@contoso.com c@mail.test d@realcorp.io call +46 70 123 45 67 or 12 34 at 10:30, id 2026-11-06",
    );
    expect(hits).toEqual([
      { kind: "email", value: "d@realcorp.io" },
      { kind: "phone", value: "+46 70 123 45 67" },
    ]);
  });
  it("allows extra domains and finds listed real names as whole words", () => {
    expect(scanRealData("x@partner.io", { allowDomains: ["partner.io"] })).toEqual([]);
    expect(
      scanRealData("Signed by Ada Lindqvist.", { realNames: ["# comment", "ada lindqvist", "Bo"] }),
    ).toEqual([{ kind: "name", value: "ada lindqvist" }]);
    expect(scanRealData("Bob", { realNames: ["Bo"] })).toEqual([]);
  });
  it("reports each finding once", () => {
    expect(scanRealData("d@realcorp.io and d@realcorp.io")).toHaveLength(1);
  });
});

describe("domainAllowed", () => {
  it("knows RFC 2606 names and subdomains of invented companies", () => {
    expect(domainAllowed("shop.example")).toBe(true);
    expect(domainAllowed("mail.Fabrikam.com")).toBe(true);
    expect(domainAllowed("gmail.com")).toBe(false);
  });
});

describe("demoText", () => {
  it("reads text, attributes and script strings, not styles or tags", () => {
    const t = demoText(
      `<html><head><style>.a{color:red}</style></head><body><p title="Hi there">Shop&nbsp;today</p><script>const p={email:"d@realcorp.io"};</script></body></html>`,
    );
    expect(t).toContain("Shop today");
    expect(t).toContain("Hi there");
    expect(t).toContain("d@realcorp.io");
    expect(t).not.toContain("color:red");
    expect(t).not.toContain("<p");
  });
});

describe("parseNames", () => {
  it("skips comments and blank lines", () => {
    expect(parseNames("# real customers\n\nAda Lindqvist\r\n  Bo Berg \n")).toEqual([
      "Ada Lindqvist",
      "Bo Berg",
    ]);
  });
});

describe("publishHtml", () => {
  const until = "2026-12-01T00:00:00.000Z";
  it("puts the end date script first in the head", () => {
    const out = publishHtml("<html><head><title>x</title></head><body>hi</body></html>", {
      title: "Shop",
      until,
    });
    expect(out).toMatch(/<head><script data-jig-factory="expiry">/);
    expect(out).toContain(String(new Date(until).getTime()));
    expect(out).toContain("2026-12-01 and has ended");
    expect(out).not.toContain('data-jig-factory="confirm"');
  });
  it("adds the confirm bar before the last </body>, with e-mail links", () => {
    const out = publishHtml("<html><head></head><body>hi</body></html>", {
      title: "Shop & co",
      until,
      confirmTo: "pm@contoso.com",
    });
    expect(out).toMatch(/data-jig-factory="confirm"[\s\S]*<\/body><\/html>$/);
    expect(out).toContain("mailto:pm%40contoso.com?subject=Shop%20%26%20co%3A%20confirmed");
    expect(out).toContain("Is this what you wanted?");
  });
  it("works on a page without head or body", () => {
    const out = publishHtml("<p>hi</p>", { title: "x", until, confirmTo: "a@b.example" });
    expect(out.startsWith('<script data-jig-factory="expiry">')).toBe(true);
    expect(out).toContain('data-jig-factory="confirm"');
  });
});

describe("helpers", () => {
  it("dates, paths, live copies and deploy arguments", () => {
    expect(untilOf(30, Date.UTC(2026, 10, 1))).toBe("2026-12-01T00:00:00.000Z");
    expect(sitePath("r1", 2)).toBe("r1/v2");
    expect(
      live([
        { id: "a", version: 1, where: "local", at: "", until: "" },
        { id: "b", version: 1, where: "local", at: "", until: "", takenDown: "x" },
      ]).map((p) => p.id),
    ).toEqual(["a"]);
    expect(
      deployArgs("/d", { name: "n", app: "a", resourceGroup: "g", subscription: "s", url: "https://x" }),
    ).toEqual([
      "--yes",
      SWA_CLI,
      "deploy",
      "/d",
      "--app-name",
      "a",
      "--resource-group",
      "g",
      "--subscription-id",
      "s",
      "--env",
      "production",
    ]);
  });
});
