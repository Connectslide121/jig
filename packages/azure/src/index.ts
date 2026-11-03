/**
 * @jig/azure — Azure tenants (D-282): one Azure CLI sign-in per folder, the tenants file's shape,
 * what `az account show` and ARM `/tenants` say about a sign-in, the environment that makes an `az`
 * run use one, and what a failed `az` run means (one error mapping for Jig and its add-ons). Pure (no
 * Electron). Documented in docs/reference/state.md → Azure tenants.
 */
export * from "./az";
export * from "./tenants";
