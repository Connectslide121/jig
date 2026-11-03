/** Azure tenants across the IPC boundary (D-282); the logic is in `@jig/azure`. */
export type { TenantStatus, TenantsState, TenantView } from "@jig/azure";
/**
 * The Azure tenant a chat's Claude Code process or a terminal started with (its `AZURE_CONFIG_DIR`).
 * It keeps that tenant when you switch; the chat header and the terminal tab name it while it differs
 * from the active one.
 */
export interface TenantTag {
  /** `default` for your own az login. */
  key: string;
  label: string;
}

export { DEFAULT_TENANT, DEFAULT_TENANT_LABEL, isTenantInput, tenantInitials } from "@jig/azure";
