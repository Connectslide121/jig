import { describe, expect, it } from "vitest";
import {
  activeTenantRef,
  azFailure,
  azJsonArgs,
  DEFAULT_TENANT_REF,
  decodeAzOutput,
  parseAzJson,
  tenantContext,
} from "./az";

const contoso = { key: "contoso", label: "Contoso", isDefault: false };

describe("azFailure", () => {
  it("says az is missing", () => {
    expect(azFailure({ code: 127, stderr: "", args: ["account", "show"] }).problem).toBe("missing");
  });

  it("keeps your own az login's messages", () => {
    const r = azFailure({ code: 1, stderr: "ERROR: Please run 'az login' to setup account.", args: [] });
    expect(r).toEqual({
      problem: "signedOut",
      message: "You're not signed in to the Azure CLI. Run `az login` in a terminal.",
    });
    expect(azFailure({ code: 1, stderr: "ERROR: boom", args: [], tenant: DEFAULT_TENANT_REF }).message).toBe(
      "ERROR: boom",
    );
  });

  it("names an added tenant and where to sign in again", () => {
    const out = azFailure({ code: 1, stderr: "ERROR: Please run 'az login'", args: [], tenant: contoso });
    expect(out.problem).toBe("signedOut");
    expect(out.message).toContain("tenant Contoso");
    const expired = azFailure({
      code: 1,
      stderr: "AADSTS700082: The refresh token has expired",
      args: [],
      tenant: contoso,
    });
    expect(expired.problem).toBe("expired");
    expect(expired.message).toContain("tenant Contoso");
    expect(
      azFailure({ code: 1, stderr: "WARNING: x\nERROR: TF400813: no access", args: [], tenant: contoso }),
    ).toEqual({
      problem: "failed",
      message: "In tenant Contoso: ERROR: TF400813: no access",
    });
  });

  it("spots the missing azure-devops extension", () => {
    expect(
      azFailure({ code: 2, stderr: "'pipelines' is misspelled or not recognized by the system.", args: [] })
        .problem,
    ).toBe("extension");
  });

  it("falls back to the command when az said nothing", () => {
    expect(azFailure({ code: 1, stderr: "", args: ["pipelines", "run", "--id", "1"] }).message).toBe(
      "az pipelines run failed",
    );
  });
});

describe("activeTenantRef", () => {
  it("picks the active tenant, without its status, with its avatar's initials", () => {
    const ref = activeTenantRef({
      active: "contoso",
      tenants: [
        { key: "default", label: "Your az login", isDefault: true, status: "ok" },
        {
          key: "contoso",
          label: "Contoso",
          isDefault: false,
          status: "ok",
          tenantId: "t1",
          domain: "contoso.com",
        },
      ],
    });
    expect(ref).toEqual({ ...contoso, tenantId: "t1", domain: "contoso.com", initials: "C" });
    expect(activeTenantRef({ active: "gone", tenants: [] })).toEqual(DEFAULT_TENANT_REF);
  });
});

describe("az output", () => {
  it("reads UTF-8, and the Windows code page az prints in", () => {
    expect(decodeAzOutput(new TextEncoder().encode("1.4 · main · Malmö"))).toBe("1.4 · main · Malmö");
    expect(decodeAzOutput(Uint8Array.from([0x31, 0x20, 0xb7, 0x20, 0x6d, 0xf6]))).toBe("1 · mö");
  });

  it("asks for JSON and parses it", () => {
    expect(azJsonArgs(["account", "show"])).toEqual(["account", "show", "-o", "json", "--only-show-errors"]);
    expect(parseAzJson<{ a: number }>(' {"a":1}\n')).toEqual({ a: 1 });
    expect(parseAzJson("  ")).toBeUndefined();
  });
});

describe("tenantContext", () => {
  it("names your own az login and its user", () => {
    expect(tenantContext({ ...DEFAULT_TENANT_REF, user: "ann@contoso.com" })).toBe(
      "Every az in this chat runs with the user's own az login, signed in as ann@contoso.com.",
    );
    expect(tenantContext(DEFAULT_TENANT_REF)).toBe(
      "Every az in this chat runs with the user's own az login.",
    );
  });

  it("names an added tenant, its Entra details and user, on one line", () => {
    const text = tenantContext({
      ...contoso,
      label: 'Contoso "prod"\nx',
      displayName: "Contoso Ltd",
      domain: "contoso.onmicrosoft.com",
      user: "bo@contoso.com",
    });
    expect(text).toBe(
      'Every az in this chat runs with the Azure tenant "Contoso prod x" (Entra tenant Contoso Ltd, contoso.onmicrosoft.com), signed in as bo@contoso.com.',
    );
  });
});
