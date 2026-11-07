import { describe, expect, it } from "vitest";
import { parseNames, scan } from "./realdata";

describe("real-data scan", () => {
  it("flags e-mails outside invented domains", () => {
    const found = scan(["Mail ana@contoso.com, bo@mail.example.com or jo@realcorp.io"]);
    expect(found).toEqual([{ kind: "email", text: "jo@realcorp.io" }]);
  });

  it("flags phone numbers but not dates, versions or sample numbers", () => {
    const found = scan([
      "Call +1 (425) 555-0182 today. Released 2025-03-14, v1.2.3, order 1234567890, 0000000",
    ]);
    expect(found).toEqual([{ kind: "phone", text: "+1 (425) 555-0182" }]);
  });

  it("flags the names you listed, as whole words", () => {
    const names = parseNames("# people\nMaria Lopez\nAl\n  Contoso Ltd  \n");
    expect(names).toEqual(["Maria Lopez", "Contoso Ltd"]);
    expect(scan(["Owner: maria lopez", "Contoso Ltdx"], names)).toEqual([
      { kind: "name", text: "Maria Lopez" },
    ]);
  });

  it("reports each finding once", () => {
    expect(scan(["x@real.io", "X@real.io again"])).toHaveLength(1);
  });
});
