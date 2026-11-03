import { DEFAULT_TENANT_REF, type TenantRef } from "@jig/azure";

/**
 * The environment every `az` Jig runs gets for the active tenant (D-282): `AZURE_CONFIG_DIR` (and
 * `AZURE_EXTENSION_DIR`) for a tenant added in Jig, nothing for your own az login, and which tenant
 * that is (for caches and error messages). Kept here, apart from the tenants module, so the places
 * that run `az` (links, setup checks, add-on host processes) only read it. The tenants module sets it.
 */
export interface AzureContext {
  env: Record<string, string>;
  tenant: TenantRef;
}

let current: AzureContext = { env: {}, tenant: DEFAULT_TENANT_REF };
const listeners = new Set<(context: AzureContext) => void>();

export function azureEnv(): Record<string, string> {
  return current.env;
}

/** The active tenant and its environment. */
export function azureContext(): AzureContext {
  return current;
}

const sameRecord = (a: object, b: object) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => (b as Record<string, unknown>)[k] === v);

export function setAzureContext(next: AzureContext): void {
  if (sameRecord(next.env, current.env) && sameRecord(next.tenant, current.tenant)) return;
  current = next;
  for (const listener of listeners) listener(next);
}

/** Called when the active tenant (or what is known about it, such as its label) changes. */
export function onAzureContextChange(listener: (context: AzureContext) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
