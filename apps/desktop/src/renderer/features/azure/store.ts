import { create } from "zustand";
import type { TenantsState } from "../../../shared/azure";
import { call } from "../../lib/host";

/**
 * Azure tenants in the renderer (D-282): the host's list and which one is active, kept current by
 * `azure.tenantChanged`, and which tenant modal is open (the top bar chip hosts them, so Settings →
 * Azure and the chip open the same ones).
 */
export const useTenants = create<{ state: TenantsState | undefined }>(() => ({ state: undefined }));

export type TenantDialog = "add" | "manage";
export const useTenantDialog = create<{ open: TenantDialog | undefined }>(() => ({ open: undefined }));

export const openAddTenant = () => useTenantDialog.setState({ open: "add" });
export const openManageTenants = () => useTenantDialog.setState({ open: "manage" });
export const closeTenantDialog = () => useTenantDialog.setState({ open: undefined });

let started = false;
/** Loads the tenants once and follows changes. Only with tenants of your own it asks the Azure CLI. */
export function startTenants(): void {
  if (started) return;
  started = true;
  window.jig.on("azure.tenantChanged", (state) => useTenants.setState({ state }));
  void call("azure.tenants", {})
    .then((state) => {
      useTenants.setState({ state });
      // Someone who never added a tenant never has `az` run for this; the others see an expired
      // sign-in in the menu without opening anything (the check asks without a prompt).
      if (state.tenants.length > 1) void call("azure.tenants", { check: true }).catch(() => undefined);
    })
    .catch(() => undefined);
}

/** Makes a tenant the one every `az` Jig runs uses. */
export function switchTenant(key: string): Promise<TenantsState> {
  return call("azure.setActiveTenant", { key });
}
