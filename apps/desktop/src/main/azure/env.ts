/**
 * The environment every `az` Jig runs gets for the active tenant (D-282): `AZURE_CONFIG_DIR` (and
 * `AZURE_EXTENSION_DIR`) for a tenant added in Jig, nothing for your own az login. Kept here, apart
 * from the tenants module, so the places that run `az` (links, setup checks, add-on host processes)
 * only read it. The tenants module sets it.
 */
let current: Record<string, string> = {};
const listeners = new Set<(env: Record<string, string>) => void>();

export function azureEnv(): Record<string, string> {
  return current;
}

export function setAzureEnv(env: Record<string, string>): void {
  const same =
    Object.keys(env).length === Object.keys(current).length &&
    Object.entries(env).every(([k, v]) => current[k] === v);
  if (same) return;
  current = env;
  for (const listener of listeners) listener(env);
}

/** Called with the new environment when the active tenant changes. */
export function onAzureEnvChange(listener: (env: Record<string, string>) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
