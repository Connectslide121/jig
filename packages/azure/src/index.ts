/**
 * @jig/azure — Azure tenants (D-282): one Azure CLI sign-in per folder, the tenants file's shape,
 * what `az account show` and ARM `/tenants` say about a sign-in, and the environment that makes an
 * `az` run use one. Pure (no Electron). Documented in docs/reference/state.md → Azure tenants.
 */
export * from "./tenants";
