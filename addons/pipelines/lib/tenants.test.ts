import { describe, expect, it } from "vitest";
import { foreignErrors, tenantNamed } from "./tenants";

describe("errors that name a tenant", () => {
  const failed = "Shop/api: In tenant Contoso: ERROR: Identity has not been materialized";
  const signedOut = "Shop/web: You're not signed in to tenant Contoso. Sign in again from the tenant avatar.";
  const expired = "Shop/app: The sign-in to tenant Fabrikam expired. Sign in again from the tenant avatar.";
  const own = "Shop/api: You're not signed in to the Azure CLI. Run `az login` in a terminal.";

  it("reads the tenant out of Jig's az messages", () => {
    expect(tenantNamed(failed)).toBe("Contoso");
    expect(tenantNamed(signedOut)).toBe("Contoso");
    expect(tenantNamed(expired)).toBe("Fabrikam");
    expect(tenantNamed(own)).toBeUndefined();
  });

  it("finds another tenant's errors on a tenant's list", () => {
    const all = [failed, signedOut, expired, own];
    expect(foreignErrors(all, { label: "Your az login", isDefault: true })).toEqual([
      failed,
      signedOut,
      expired,
    ]);
    expect(foreignErrors(all, { label: "Contoso", isDefault: false })).toEqual([expired]);
    expect(foreignErrors([own], { label: "Contoso", isDefault: false })).toEqual([]);
  });
});
