import { describe, expect, it } from "vitest";
import { domainAllowed, fromProblems, misaligned, nonLocalRefs, parseNames, report, scanRealData } from "./checks.ts";

describe("scanRealData", () => {
  it("allows invented domains and flags real-looking ones", () => {
    const hits = scanRealData("a.b@fabrikam.example, c@contoso.com, d@shop.test, e@mail.contoso.com", { allowDomains: ["contoso.com"] });
    expect(hits).toEqual([]);
    expect(scanRealData("x@realcorp.se")).toEqual([{ kind: "email", value: "x@realcorp.se" }]);
  });
  it("finds phone numbers but not dates, times or money", () => {
    expect(scanRealData("Call +46 70 123 45 67 now").map((h) => h.kind)).toEqual(["phone"]);
    expect(scanRealData("(555) 123-4567")).toHaveLength(1);
    expect(scanRealData("2026-05-04 07:30 · 2026-05-04 07:30–09:00 · 1 240 € · J-2140 · 18 Canal Walk")).toEqual([]);
  });
  it("matches real names as whole words, any case", () => {
    const names = ["Acme Holdings", "Bo"];
    expect(scanRealData("Customer: acme holdings", { realNames: names })).toEqual([{ kind: "name", value: "Acme Holdings" }]);
    expect(scanRealData("Bolt and Boat", { realNames: names })).toEqual([]);
  });
});

describe("helpers", () => {
  it("domainAllowed knows reserved domains and subdomains of allowed ones", () => {
    expect(domainAllowed("x.example")).toBe(true);
    expect(domainAllowed("example.com")).toBe(true);
    expect(domainAllowed("eu.fabrikam.com", ["fabrikam.com"])).toBe(true);
    expect(domainAllowed("fabrikam.com.evil.io", ["fabrikam.com"])).toBe(false);
  });
  it("parseNames skips comments and blanks", () => {
    expect(parseNames("# customers\nAcme\n\n  Globex  \r\n")).toEqual(["Acme", "Globex"]);
  });
  it("nonLocalRefs finds absolute and remote references", () => {
    const html = `<script src="/assets/a.js"></script><link href="https://fonts.example/x.css"><img src="data:image/png;base64,AA"><script src="./b.js"></script>`;
    expect(nonLocalRefs(html)).toEqual(["/assets/a.js", "https://fonts.example/x.css"]);
  });
  it("misaligned finds columns that move between rows", () => {
    const row = (...xs: [number, number][]) => xs.map(([left, right]) => ({ left, right }));
    const good = { where: "jobs", rows: [row([0, 50], [60, 300], [310, 400]), row([0, 50], [60, 280], [310, 400]), row([0, 50], [60, 200], [310, 400])] };
    const pushed = { where: "today", rows: [row([0, 50], [60, 300], [310, 400]), row([0, 50], [60, 340], [350, 440]), row([0, 50], [60, 200], [310, 400])] };
    expect(misaligned([good])).toEqual([]);
    expect(misaligned([pushed])).toEqual(["today: column 3 starts at different x"]);
  });
  it("report and fromProblems summarise", () => {
    const ok = fromProblems("console", [], "clean");
    const bad = fromProblems("axe", Array.from({ length: 10 }, (_, i) => `p${i}`), "");
    expect(ok.pass).toBe(true);
    expect(bad.detail).toContain("and 2 more");
    expect(report([ok, bad], []).pass).toBe(false);
  });
});
