import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeKey,
  azEnv,
  DEFAULT_TENANT,
  defaultLabel,
  emptyTenantsFile,
  errorLine,
  failedCheck,
  isTenantInput,
  loginArgs,
  mergeSignIn,
  parseTenantsFile,
  signInStatusFromError,
  type TenantInfo,
  tenantConfigDir,
  tenantKey,
  tenantsState,
} from "./tenants";

const GUID = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";
const now = new Date("2026-11-03T10:00:00Z");

describe("parseTenantsFile", () => {
  it("gives an empty file for nothing or junk", () => {
    expect(parseTenantsFile(undefined)).toEqual(emptyTenantsFile());
    expect(parseTenantsFile({ tenants: "x", default: 3 })).toEqual(emptyTenantsFile());
  });

  it("keeps good entries and drops bad, repeated and reserved keys", () => {
    const file = parseTenantsFile({
      default: { user: "ann@contoso.com", status: "ok" },
      tenants: [
        { key: "contoso", label: "Contoso", status: "expired", addedAt: "2026-11-01T00:00:00Z", extra: 1 },
        { key: "contoso", label: "Again" },
        { key: "default", label: "Reserved" },
        { key: "../up", label: "Bad" },
        { key: "fabrikam", status: "weird" },
      ],
    });
    expect(file.default).toEqual({ user: "ann@contoso.com", status: "ok" });
    expect(file.tenants).toEqual([
      { key: "contoso", label: "Contoso", status: "expired", addedAt: "2026-11-01T00:00:00Z" },
      { key: "fabrikam", label: "fabrikam", status: "unknown", addedAt: new Date(0).toISOString() },
    ]);
  });
});

describe("isTenantInput", () => {
  it("accepts empty, a GUID or a domain", () => {
    expect(isTenantInput("")).toBe(true);
    expect(isTenantInput(GUID)).toBe(true);
    expect(isTenantInput("contoso.onmicrosoft.com")).toBe(true);
    expect(isTenantInput("contoso")).toBe(false);
    expect(isTenantInput("--tenant x")).toBe(false);
  });
});

describe("tenantKey", () => {
  it("names the folder after the domain or the id, unique and never default", () => {
    expect(tenantKey("Contoso.onmicrosoft.com", [])).toBe("contoso");
    expect(tenantKey("contoso.com", ["contoso"])).toBe("contoso-2");
    expect(tenantKey("contoso.com", ["contoso", "contoso-2"])).toBe("contoso-3");
    expect(tenantKey(GUID, [])).toBe("tenant-0b1c2d3e");
    expect(tenantKey("", [])).toBe("tenant");
    expect(tenantKey("default.com", [])).toBe("default-2");
    expect(tenantKey("_x_.com", [])).toBe("x");
  });
});

describe("tenantConfigDir and azEnv", () => {
  const root = join("home", ".jig", "azure");
  const home = "home";

  it("gives no folder or environment for your own az login", () => {
    expect(tenantConfigDir(root, DEFAULT_TENANT, join)).toBeUndefined();
    expect(tenantConfigDir(root, "../x", join)).toBeUndefined();
    expect(azEnv(undefined, { root, home, join, env: {} })).toEqual({});
    expect(azEnv(DEFAULT_TENANT, { root, home, join, env: {} })).toEqual({});
  });

  it("points az at the tenant's folder and keeps your extensions", () => {
    expect(azEnv("contoso", { root, home, join, env: {} })).toEqual({
      AZURE_CONFIG_DIR: join(root, "contoso"),
      AZURE_EXTENSION_DIR: join(home, ".azure", "cliextensions"),
    });
    expect(azEnv("contoso", { root, home, join, env: { AZURE_CONFIG_DIR: "own" } }).AZURE_EXTENSION_DIR).toBe(
      join("own", "cliextensions"),
    );
    expect(
      azEnv("contoso", { root, home, join, env: { AZURE_EXTENSION_DIR: "ext", AZURE_CONFIG_DIR: "own" } })
        .AZURE_EXTENSION_DIR,
    ).toBe("ext");
  });
});

describe("tenantsState and activeKey", () => {
  const file = parseTenantsFile({
    default: { user: "ann@contoso.com", status: "ok" },
    tenants: [{ key: "fabrikam", label: "Fabrikam", requested: "fabrikam.com", addedAt: "x" }],
  });

  it("lists your az login first, without internal fields", () => {
    const state = tenantsState(file, "fabrikam");
    expect(state.active).toBe("fabrikam");
    expect(state.tenants).toEqual([
      { key: "default", label: "Your az login", isDefault: true, user: "ann@contoso.com", status: "ok" },
      { key: "fabrikam", label: "Fabrikam", isDefault: false, status: "unknown" },
    ]);
  });

  it("falls back to your az login for an unknown or empty setting", () => {
    expect(activeKey(file, "")).toBe(DEFAULT_TENANT);
    expect(activeKey(file, "gone")).toBe(DEFAULT_TENANT);
    expect(activeKey(file, undefined)).toBe(DEFAULT_TENANT);
  });
});

describe("loginArgs", () => {
  it("signs in to the tenant, also without subscriptions, quietly", () => {
    expect(loginArgs(" contoso.com ")).toEqual([
      "login",
      "--tenant",
      "contoso.com",
      "--allow-no-subscriptions",
      "--output",
      "none",
    ]);
    expect(loginArgs(undefined)).toEqual(["login", "--allow-no-subscriptions", "--output", "none"]);
  });
});

describe("signInStatusFromError and errorLine", () => {
  it("tells signed out from expired from other failures", () => {
    expect(signInStatusFromError("ERROR: Please run 'az login' to setup account.")).toBe("signedOut");
    expect(
      signInStatusFromError(
        "AADSTS700082: The refresh token has expired due to inactivity.\nTo re-authenticate, please run:\naz login",
      ),
    ).toBe("expired");
    expect(signInStatusFromError("AADSTS50076: Due to a configuration change… multi-factor")).toBe("expired");
    expect(signInStatusFromError("ERROR: HTTPSConnectionPool: Max retries exceeded")).toBeUndefined();
  });

  it("shows the error line, not warnings", () => {
    expect(errorLine("WARNING: update available\n\nERROR: Please run 'az login'\nmore")).toBe(
      "Please run 'az login'",
    );
    expect(errorLine("WARNING: only\nsomething broke")).toBe("something broke");
    expect(errorLine("")).toBe("");
  });
});

describe("mergeSignIn and failedCheck", () => {
  const account = {
    tenantId: GUID,
    tenantDisplayName: "Contoso CLI",
    user: { name: "ann@contoso.com", type: "user" },
  };
  const arm = {
    value: [
      { tenantId: "other", displayName: "Other" },
      { tenantId: GUID.toUpperCase(), displayName: "Contoso", defaultDomain: "contoso.onmicrosoft.com" },
    ],
  };

  it("takes the user and tenant from az account show and names from ARM", () => {
    const merged = mergeSignIn({ status: "expired" as const, problem: "old" }, account, arm, now);
    expect(merged).toEqual({
      status: "ok",
      checkedAt: now.toISOString(),
      user: "ann@contoso.com",
      tenantId: GUID,
      displayName: "Contoso",
      domain: "contoso.onmicrosoft.com",
    });
  });

  it("keeps what it knew when ARM couldn't be asked", () => {
    const merged = mergeSignIn(
      { status: "unknown" as const, domain: "contoso.com", key: "c" },
      account,
      undefined,
      now,
    );
    expect(merged).toMatchObject({ key: "c", displayName: "Contoso CLI", domain: "contoso.com" });
  });

  it("marks a failed check with its status and line", () => {
    expect(failedCheck({ status: "ok" as const, user: "a" }, "ERROR: Please run 'az login'", now)).toEqual({
      status: "signedOut",
      user: "a",
      problem: "Please run 'az login'",
      checkedAt: now.toISOString(),
    });
    const ok: TenantInfo = { status: "ok" };
    expect(failedCheck(ok, "", now).problem).toBe("The Azure CLI failed");
    expect(failedCheck({ status: "ok" as const }, "timeout", now).status).toBe("unknown");
  });
});

describe("defaultLabel", () => {
  it("prefers the display name, then the domain, then what was asked", () => {
    expect(defaultLabel({ status: "ok", displayName: "Contoso", domain: "c.com" })).toBe("Contoso");
    expect(defaultLabel({ status: "ok", domain: "c.com" })).toBe("c.com");
    expect(defaultLabel({ status: "ok" }, "fabrikam.com")).toBe("fabrikam.com");
    expect(defaultLabel({ status: "ok" })).toBe("Tenant");
  });
});
